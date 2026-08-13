// ==========================================================================
// S@FE CYBER PILOT — Lien vers le portail client Stripe (changement de plan /
// résiliation en self-service pour l'abonnement SaaS tenant).
// POST {} → { success, portal_url }
// Retrouve le tenant de l'appelant via staff_module_access — n'exige PAS
// has_module_access('cyberdesk') (donc reste joignable même si l'abonnement
// est past_due/unpaid : c'est justement le chemin pour mettre à jour un
// moyen de paiement et débloquer la situation). Voir CLAUDE.md pour la
// limite assumée : un tenant déjà canceled/unpaid ET déconnecté par
// index.html ne voit plus le bouton menant ici en v1 (pas d'écran de
// reprise dédié) — contact direct de l'équipe dans ce cas précis.
// ==========================================================================
import { createClient } from "@supabase/supabase-js";
import Stripe from "stripe";
import { corsHeaders } from "../_shared/cors.ts";

const SITE_URL = "https://cyberdesk.safe-digitalisation.fr";

async function getSecret(sb: ReturnType<typeof createClient>, name: string): Promise<string> {
  const { data, error } = await sb.rpc("get_edge_secret", { secret_name: name });
  if (error || !data) throw new Error(`Secret "${name}" introuvable dans le Vault.`);
  return data as string;
}

Deno.serve(async (req) => {
  const CORS = corsHeaders(req);
  function json(body: unknown, status = 200) {
    return new Response(JSON.stringify(body), {
      status,
      headers: { ...CORS, "Content-Type": "application/json" },
    });
  }

  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "bad_method" }, 405);

  const SB_URL = Deno.env.get("SUPABASE_URL")!;
  const SB_ANON = Deno.env.get("SUPABASE_ANON_KEY")!;
  const SB_SR = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return json({ error: "unauthorized" }, 401);

  const sbAnon = createClient(SB_URL, SB_ANON, { global: { headers: { Authorization: authHeader } } });
  const { data: { user }, error: authErr } = await sbAnon.auth.getUser();
  if (authErr || !user) return json({ error: "unauthorized" }, 401);

  const sb = createClient(SB_URL, SB_SR);

  const { data: access, error: eAccess } = await sb
    .from("staff_module_access")
    .select("tenant_id")
    .eq("user_id", user.id)
    .eq("module", "cyberdesk")
    .maybeSingle();
  if (eAccess || !access?.tenant_id) return json({ error: "no_tenant" }, 404);

  const { data: tenant, error: eTenant } = await sb
    .from("cyberdesk_tenants")
    .select("stripe_customer_id")
    .eq("id", access.tenant_id)
    .single();
  if (eTenant || !tenant?.stripe_customer_id) return json({ error: "no_stripe_customer" }, 404);

  let stripeKey: string;
  try {
    stripeKey = await getSecret(sb, "stripe_secret_key");
  } catch (e) {
    return json({ error: "secrets_unavailable", details: String(e.message || e) }, 500);
  }

  const stripe = new Stripe(stripeKey, { apiVersion: "2023-10-16" });

  let portalSession: Stripe.BillingPortal.Session;
  try {
    portalSession = await stripe.billingPortal.sessions.create({
      customer: tenant.stripe_customer_id,
      return_url: `${SITE_URL}/index.html`,
    });
  } catch (e) {
    return json({ error: "stripe_error", details: String(e.message || e) }, 502);
  }

  return json({ success: true, portal_url: portalSession.url });
});
