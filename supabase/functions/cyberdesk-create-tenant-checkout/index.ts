// ==========================================================================
// S@FE CYBER PILOT — Création d'un tenant + session Stripe Checkout (abonnement).
// POST { tenant_name, user_id, trial_days? } → { success, tenant_id, checkout_url }
// Réservée aux super-admins (action de facturation, distincte de
// has_module_access('cyberdesk') qui ne garantit qu'un accès module) :
// crée la ligne cyberdesk_tenants, rattache l'utilisateur désigné à ce
// tenant avec un accès immédiat en statut 'trialing' (le client démarre
// avant même d'avoir payé — patron SaaS standard), puis crée la Checkout
// Session Stripe (mode subscription). Le lien renvoyé est transmis à la
// main au client par l'admin — pas d'envoi automatisé en v1 (créer un
// nouveau tenant payant est rare, contrairement à l'envoi de devis par
// dossier victime, voir send-cybervictim-quote).
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

  const { data: isSuperAdmin, error: adminErr } = await sbAnon.rpc("is_super_admin");
  if (adminErr || isSuperAdmin !== true) return json({ error: "forbidden" }, 403);

  let body: any;
  try {
    body = await req.json();
  } catch {
    return json({ error: "bad_json" }, 400);
  }
  const tenantName = (body.tenant_name || "").trim();
  const targetUserId = body.user_id;
  const trialDays = body.trial_days ? Number(body.trial_days) : null;
  if (!tenantName || !targetUserId) return json({ error: "missing_fields" }, 400);

  const sb = createClient(SB_URL, SB_SR);

  const { data: targetUser, error: eUser } = await sb.auth.admin.getUserById(targetUserId);
  if (eUser || !targetUser?.user) return json({ error: "user_not_found" }, 404);

  // Empêche d'écraser silencieusement le rattachement d'un utilisateur déjà
  // membre d'un autre tenant (erreur d'admin facile sinon — l'ancien tenant
  // se retrouverait sans aucun membre).
  const { data: existingAccess } = await sb
    .from("staff_module_access")
    .select("tenant_id")
    .eq("user_id", targetUserId)
    .eq("module", "cyberdesk")
    .maybeSingle();
  if (existingAccess?.tenant_id) {
    return json({ error: "user_already_has_tenant", details: existingAccess.tenant_id }, 409);
  }

  const { data: tenant, error: eTenant } = await sb
    .from("cyberdesk_tenants")
    .insert({ name: tenantName, created_by: user.id })
    .select()
    .single();
  if (eTenant) return json({ error: "tenant_create_failed", details: eTenant.message }, 500);

  const { error: eAccess } = await sb
    .from("staff_module_access")
    .upsert(
      { user_id: targetUserId, module: "cyberdesk", tenant_id: tenant.id, granted_by: user.id },
      { onConflict: "user_id,module" },
    );
  if (eAccess) {
    // Retour arrière : pas de tenant orphelin sans accès rattaché.
    await sb.from("cyberdesk_tenants").delete().eq("id", tenant.id);
    return json({ error: "access_grant_failed", details: eAccess.message }, 500);
  }

  let stripeKey: string, priceId: string;
  try {
    [stripeKey, priceId] = await Promise.all([
      getSecret(sb, "stripe_secret_key"),
      getSecret(sb, "stripe_price_id_cyberdesk"),
    ]);
  } catch (e) {
    return json({ error: "secrets_unavailable", details: String(e.message || e) }, 500);
  }

  const stripe = new Stripe(stripeKey, { apiVersion: "2023-10-16" });

  let session: Stripe.Checkout.Session;
  try {
    session = await stripe.checkout.sessions.create({
      mode: "subscription",
      line_items: [{ price: priceId, quantity: 1 }],
      customer_email: targetUser.user.email ?? undefined,
      client_reference_id: tenant.id,
      metadata: { tenant_id: tenant.id },
      subscription_data: trialDays ? { trial_period_days: trialDays } : undefined,
      success_url: `${SITE_URL}/abonnement-confirme.html?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${SITE_URL}/abonnement-annule.html`,
    });
  } catch (e) {
    return json({ error: "stripe_error", details: String(e.message || e) }, 502);
  }

  if (typeof session.customer === "string") {
    await sb.from("cyberdesk_tenants").update({ stripe_customer_id: session.customer }).eq("id", tenant.id);
  }

  await sb.from("audit_logs").insert({
    user_id: user.id,
    action: "tenant_cree",
    module: "CyberDesk",
    entity_type: "cyberdesk_tenant",
    entity_id: tenant.id,
    donnees_concernees: `Création du tenant "${tenantName}"`,
    criticite: "Info",
    resultat: "Succès",
    details: { target_user_id: targetUserId, trial_days: trialDays },
  });

  return json({ success: true, tenant_id: tenant.id, checkout_url: session.url });
});
