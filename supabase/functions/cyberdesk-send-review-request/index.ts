// ==========================================================================
// S@FE CYBER PILOT — Envoi de la demande d'avis client à la clôture d'un dossier.
// Crée une ligne cybervictim_reviews (token valable 60 jours) et envoie au
// client un e-mail Brevo contenant le lien public vers avis-client.html.
//
// POST { lead_id } (JWT utilisateur requis — appelée depuis victimes17.js
// au moment du passage en colonne "cloture").
// ==========================================================================
import { createClient } from "@supabase/supabase-js";
import { corsHeaders } from "../_shared/cors.ts";
import { canAccessLead } from "../_shared/lead-access.ts";

const SITE_URL = "https://cyberdesk.safe-digitalisation.fr";
const SENDER = { name: "S@FE CYBER PILOT", email: "noreply@safe-digitalisation.fr" };
const REVIEW_VALIDITY_DAYS = 60;

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

  const { data: hasAccess, error: accessErr } = await sbAnon.rpc("has_module_access", { p_module: "cyberdesk" });
  if (accessErr || hasAccess !== true) return json({ error: "forbidden" }, 403);

  let body: any;
  try {
    body = await req.json();
  } catch {
    return json({ error: "bad_json" }, 400);
  }

  const leadId: string = String(body.lead_id || "");
  if (!leadId) return json({ error: "missing_lead_id" }, 400);

  const sb = createClient(SB_URL, SB_SR);

  const { data: lead, error: eLead } = await sb
    .from("cybervictim_leads")
    .select("id, first_name, last_name, email, created_by")
    .eq("id", leadId)
    .single();
  if (eLead || !lead) return json({ error: "not_found" }, 404);
  if (!(await canAccessLead(sbAnon, lead.created_by, user.id))) return json({ error: "forbidden" }, 403);
  if (!lead.email) return json({ error: "no_email", details: "Aucun e-mail renseigné pour ce dossier." }, 400);

  const expiresAt = new Date(Date.now() + REVIEW_VALIDITY_DAYS * 86400000).toISOString();

  const { data: review, error: eInsert } = await sb
    .from("cybervictim_reviews")
    .insert({ lead_id: leadId, expires_at: expiresAt })
    .select()
    .single();
  if (eInsert) return json({ error: "db_insert_failed", details: eInsert.message }, 500);

  let brevoKey: string;
  try {
    brevoKey = await getSecret(sb, "brevo_api_key");
  } catch (e) {
    return json({ error: "secrets_unavailable", details: String(e.message || e) }, 500);
  }

  const clientNom = `${lead.first_name || ""} ${lead.last_name || ""}`.trim() || "Madame, Monsieur";
  const reviewUrl = `${SITE_URL}/avis-client.html?token=${review.review_token}`;

  const htmlContent = `
    <div style="font-family:Arial,sans-serif;color:#1d1d1b;max-width:560px;margin:0 auto;line-height:1.6">
      <div style="border-bottom:3px solid #000091;padding-bottom:10px;margin-bottom:20px">
        <strong style="font-size:18px">S<span style="color:#e1000f">@</span>FE</strong>
        <div style="font-size:11px;color:#666">Prestataire référencé cybermalveillance.gouv.fr / 17Cyber</div>
      </div>
      <p>Bonjour ${clientNom},</p>
      <p>Votre dossier vient d'être clôturé. Votre avis nous aide à améliorer notre accompagnement des
      victimes de cyberattaques — pourriez-vous prendre un instant pour le partager ?</p>
      <p style="text-align:center;margin:24px 0">
        <a href="${reviewUrl}" style="background:#000091;color:#fff;text-decoration:none;padding:12px 28px;border-radius:8px;font-weight:bold;display:inline-block">
          Donner mon avis
        </a>
      </p>
      <p style="font-size:13px;color:#666">Ce lien reste valable ${REVIEW_VALIDITY_DAYS} jours.</p>
      <p style="font-size:12px;color:#999;margin-top:24px">S@FE — contact@safe-digitalisation.fr</p>
    </div>
  `;

  const brevoResp = await fetch("https://api.brevo.com/v3/smtp/email", {
    method: "POST",
    headers: { "api-key": brevoKey, "Content-Type": "application/json", "Accept": "application/json" },
    body: JSON.stringify({
      sender: SENDER,
      to: [{ email: lead.email, name: clientNom }],
      subject: "S@FE — Votre avis sur notre intervention 17Cyber",
      htmlContent,
    }),
  });
  if (!brevoResp.ok) {
    const details = await brevoResp.text();
    return json({ error: "brevo_error", details }, 502);
  }

  return json({ success: true });
});
