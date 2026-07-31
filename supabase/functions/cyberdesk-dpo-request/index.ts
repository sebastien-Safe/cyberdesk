// ==========================================================================
// CyberDesk — Demande d'exercice de droits RGPD (module DPO — préparation).
// Enregistre la demande (cyberdesk_dpo_requests) et notifie immédiatement
// le DPO par e-mail (Brevo) : le délai légal de réponse est de 1 mois,
// une demande non vue tant qu'un panneau admin dédié n'existe pas serait
// trop risquée à manquer.
//
// POST { request_type, message } (JWT utilisateur requis, appel authentifié
// normal — pas de --no-verify-jwt, contrairement à cyberdesk-forgot-password).
// ==========================================================================
import { createClient } from "@supabase/supabase-js";
import { corsHeaders } from "../_shared/cors.ts";

const SENDER = { name: "S@FE — CyberDesk", email: "noreply@safe-digitalisation.fr" };
const DPO_EMAIL = "dpo@safe-digitalisation.fr";

const REQUEST_TYPES: Record<string, string> = {
  acces: "Droit d'accès",
  rectification: "Droit de rectification",
  effacement: "Droit à l'effacement",
  opposition: "Droit d'opposition",
  portabilite: "Droit à la portabilité",
  limitation: "Droit à la limitation du traitement",
};

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

  // Garde d'accès module — un compte Vente authentifié ne doit pas pouvoir
  // ouvrir une demande DPO côté CyberDesk (projet Supabase partagé).
  const { data: hasAccess, error: accessErr } = await sbAnon.rpc("has_module_access", { p_module: "cyberdesk" });
  if (accessErr || hasAccess !== true) return json({ error: "forbidden" }, 403);

  let body: any;
  try {
    body = await req.json();
  } catch {
    return json({ error: "bad_json" }, 400);
  }

  const requestType: string = String(body.request_type || "");
  const message: string = String(body.message || "").trim();
  if (!REQUEST_TYPES[requestType]) return json({ error: "invalid_request_type" }, 400);

  const sb = createClient(SB_URL, SB_SR);

  const { data: dpoRequest, error: insertErr } = await sb
    .from("cyberdesk_dpo_requests")
    .insert({ user_id: user.id, request_type: requestType, message: message || null })
    .select()
    .single();
  if (insertErr) return json({ error: "db_insert_failed", details: insertErr.message }, 500);

  let brevoKey: string;
  try {
    brevoKey = await getSecret(sb, "brevo_api_key");
  } catch (e) {
    return json({ error: "secrets_unavailable", details: String(e.message || e) }, 500);
  }

  const htmlContent = `
    <div style="font-family:Arial,sans-serif;color:#1d1d1b;max-width:560px;margin:0 auto;line-height:1.6">
      <div style="border-bottom:3px solid #000091;padding-bottom:10px;margin-bottom:20px">
        <strong style="font-size:18px">S<span style="color:#e1000f">@</span>FE</strong>
        <div style="font-size:11px;color:#666">CyberDesk — Registre de traitement RGPD</div>
      </div>
      <p>Nouvelle demande d'exercice de droits reçue depuis CyberDesk.</p>
      <p><strong>Type :</strong> ${REQUEST_TYPES[requestType]}</p>
      <p><strong>Compte :</strong> ${user.email || user.id}</p>
      ${message ? `<p><strong>Message :</strong><br>${message.replace(/</g, "&lt;")}</p>` : ""}
      <p style="font-size:12px;color:#999;margin-top:24px">
        Demande enregistrée le ${new Date(dpoRequest.created_at).toLocaleString("fr-FR")} — id ${dpoRequest.id}.
      </p>
    </div>
  `;

  const brevoResp = await fetch("https://api.brevo.com/v3/smtp/email", {
    method: "POST",
    headers: { "api-key": brevoKey, "Content-Type": "application/json", "Accept": "application/json" },
    body: JSON.stringify({
      sender: SENDER,
      to: [{ email: DPO_EMAIL }],
      subject: `CyberDesk — Demande d'exercice de droits (${REQUEST_TYPES[requestType]})`,
      htmlContent,
    }),
  });
  if (!brevoResp.ok) {
    const details = await brevoResp.text();
    return json({ error: "brevo_error", details }, 502);
  }

  await sb.from("audit_logs").insert({
    user_id: user.id,
    action: "dpo_demande_exercice_droits",
    module: "CyberDesk",
    entity_type: "cyberdesk_dpo_request",
    entity_id: dpoRequest.id,
    donnees_concernees: `Demande d'exercice de droits (${REQUEST_TYPES[requestType]}) envoyée au DPO`,
    criticite: "Attention",
    resultat: "Succès",
    details: { request_type: requestType },
  });

  return json({ success: true });
});
