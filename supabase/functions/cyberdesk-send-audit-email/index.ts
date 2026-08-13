// ==========================================================================
// S@FE CYBER PILOT — Envoi par email du résultat du quiz de diagnostic public
// (mission-cyber.html). Endpoint public — pas d'authentification JWT
// (le visiteur n'a pas de compte), protégé uniquement par la clé apikey
// standard Supabase (anon key), comme tout appel client public.
//
// POST { to_email, to_name, params } → { success: true }
//
// Fournisseur d'envoi : Brevo, via le secret Vault `brevo_api_key`
// (get_edge_secret) — même mécanisme que send-cybervictim-quote,
// cyberdesk-forgot-password et cyberdesk-dpo-request. Remplace l'appel
// direct à Resend (RESEND_API_KEY) utilisé jusqu'ici : c'était le seul
// point du projet, S@FE CYBER PILOT comme Vente confondus, à ne pas passer par
// Brevo — un choix isolé fait le jour de la création de cette fonction,
// jamais réconcilié avec le reste du stack.
//
// Protections anti-abus (endpoint public, sans compte visiteur) :
// validation basique du format d'email, et limite de fréquence globale
// via la table partagée `rate_limits` (compteur par action/fenêtre,
// déjà utilisée ailleurs sur le projet — pas de nouvelle table créée).
// ==========================================================================
import { createClient } from "@supabase/supabase-js";
import { corsHeaders } from "../_shared/cors.ts";

const SENDER = { name: "S@FE CYBER PILOT", email: "noreply@safe-digitalisation.fr" };

async function getSecret(sb: ReturnType<typeof createClient>, name: string): Promise<string> {
  const { data, error } = await sb.rpc("get_edge_secret", { secret_name: name });
  if (error || !data) throw new Error(`Secret "${name}" introuvable dans le Vault.`);
  return data as string;
}

const RATE_LIMIT_ACTION = "cyberdesk_send_audit_email";
const RATE_LIMIT_MAX = 30; // par fenêtre
const RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000; // 1 heure

async function checkRateLimit(sb: ReturnType<typeof createClient>): Promise<boolean> {
  const now = Date.now();
  const { data } = await sb
    .from("rate_limits")
    .select("count, window_at")
    .eq("action", RATE_LIMIT_ACTION)
    .maybeSingle();

  if (!data || new Date(data.window_at as string).getTime() < now - RATE_LIMIT_WINDOW_MS) {
    await sb.from("rate_limits").upsert({ action: RATE_LIMIT_ACTION, count: 1, window_at: new Date(now).toISOString() });
    return true;
  }
  if ((data.count as number) >= RATE_LIMIT_MAX) return false;

  await sb.from("rate_limits").update({ count: (data.count as number) + 1 }).eq("action", RATE_LIMIT_ACTION);
  return true;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function esc(s: unknown) {
  return String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

interface RowResult { question: string; reponse: string; text: string; bg: string; color: string }
interface AuditParams {
  nom: string; entreprise?: string; email: string; telephone?: string;
  mission: string; mission_color: string;
  score: string; niveau: string; niveau_color: string; niveau_bg: string; niveau_border: string;
  rows: RowResult[]; recommandations?: string[];
  date: string; conseiller: string;
}

function buildHtml(p: AuditParams): string {
  const rowsHtml = (p.rows || []).map((r) => `
    <tr>
      <td style="padding:9px 10px;border-bottom:1px solid #f3f4f6;font-size:13px;width:55%">${esc(r.question)}</td>
      <td style="padding:9px 10px;border-bottom:1px solid #f3f4f6;font-size:13px">${esc(r.reponse)}</td>
      <td style="padding:9px 10px;border-bottom:1px solid #f3f4f6;white-space:nowrap">
        <span style="background:${esc(r.bg)};color:${esc(r.color)};padding:2px 9px;border-radius:99px;font-size:11px">${esc(r.text)}</span>
      </td>
    </tr>`).join("");

  const recos = p.recommandations || [];
  const recoHtml = recos.length
    ? recos.map((r) => `<li style="margin-bottom:6px;padding-left:4px">${esc(r)}</li>`).join("")
    : `<li>Un conseiller S@FE CYBER PILOT reviendra vers vous avec des recommandations personnalisées.</li>`;

  const mColor = esc(p.mission_color || "#0a1628");
  const nBg = esc(p.niveau_bg || "#f8fafc");
  const nBd = esc(p.niveau_border || "#e2e8f0");
  const nColor = esc(p.niveau_color || "#0a1628");

  return `<!DOCTYPE html>
<html lang="fr" xmlns="http://www.w3.org/1999/xhtml">
<head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1.0">
<title>Votre diagnostic ${esc(p.mission)} — S@FE CYBER PILOT</title>
<style>
body,table,td,a{-webkit-text-size-adjust:100%;-ms-text-size-adjust:100%}
table,td{mso-table-lspace:0pt;mso-table-rspace:0pt}
img{border:0;outline:none;text-decoration:none}
body{margin:0;padding:0;background:#f3f4f6;font-family:Arial,Helvetica,sans-serif}
@media only screen and (max-width:600px){
  .em-w{width:100%!important}.em-p{padding:24px 16px!important}
  .score-n{font-size:44px!important}.col-h{display:block!important;width:100%!important}
}
</style>
</head>
<body>
<table role="presentation" class="em-w" width="100%" cellspacing="0" cellpadding="0" border="0" style="background:#f3f4f6">
<tr><td align="center" style="padding:24px 16px">
<table role="presentation" width="600" cellspacing="0" cellpadding="0" border="0" style="max-width:600px;width:100%;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,.08)">

<!-- HEADER -->
<tr><td style="background:#0a1628;padding:22px 28px">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0"><tr>
<td style="vertical-align:middle">
  <span style="font-size:20px;font-weight:900;color:#fff;letter-spacing:-.5px">S<span style="color:#e1000f">@</span>FE</span>
  <span style="display:block;font-size:10px;color:#94a3b8;letter-spacing:1.5px;text-transform:uppercase;margin-top:2px">S@FE CYBER PILOT — Diagnostic public</span>
</td>
<td style="text-align:right;vertical-align:middle">
  <span style="font-size:14px;font-weight:700;color:${mColor}">${esc(p.mission)}</span>
  <span style="display:block;font-size:11px;color:#94a3b8;margin-top:3px">${esc(p.date)}</span>
</td>
</tr></table>
</td></tr>

<!-- BODY -->
<tr><td class="em-p" style="padding:32px 28px">

<p style="margin:0 0 8px;font-size:17px;font-weight:700;color:#0a1628">Bonjour ${esc(p.nom)},</p>
<p style="margin:0 0 24px;font-size:14px;color:#4b5563;line-height:1.6">
  Voici les résultats de votre diagnostic <strong>${esc(p.mission)}</strong> réalisé via le quiz public S@FE CYBER PILOT.
</p>

<!-- Score -->
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0"
       style="background:${nBg};border:2px solid ${nBd};border-radius:12px;margin-bottom:24px">
<tr><td style="padding:24px 20px;text-align:center">
  <span class="score-n" style="display:block;font-size:52px;font-weight:900;color:${nColor};line-height:1">${esc(p.score)}%</span>
  <span style="display:block;font-size:13px;color:#6b7280;margin-top:6px">Score ${esc(p.mission)} — <strong style="color:${nColor}">${esc(p.niveau)}</strong></span>
</td></tr>
</table>

<!-- Coordonnées -->
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0"
       style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;margin-bottom:24px">
<tr><td style="padding:14px 16px">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
<tr>
  <td class="col-h" width="50%" style="vertical-align:top;padding-bottom:8px">
    <span style="display:block;font-size:10px;color:#64748b;text-transform:uppercase;letter-spacing:1px;font-weight:700">Nom</span>
    <span style="display:block;font-size:13px;color:#0f172a;margin-top:2px">${esc(p.nom)}</span>
  </td>
  <td class="col-h" width="50%" style="vertical-align:top;padding-bottom:8px">
    <span style="display:block;font-size:10px;color:#64748b;text-transform:uppercase;letter-spacing:1px;font-weight:700">Entreprise</span>
    <span style="display:block;font-size:13px;color:#0f172a;margin-top:2px">${esc(p.entreprise || "—")}</span>
  </td>
</tr>
<tr>
  <td class="col-h" width="50%" style="vertical-align:top">
    <span style="display:block;font-size:10px;color:#64748b;text-transform:uppercase;letter-spacing:1px;font-weight:700">E-mail</span>
    <span style="display:block;font-size:13px;color:#0f172a;margin-top:2px">${esc(p.email)}</span>
  </td>
  <td class="col-h" width="50%" style="vertical-align:top">
    <span style="display:block;font-size:10px;color:#64748b;text-transform:uppercase;letter-spacing:1px;font-weight:700">Téléphone</span>
    <span style="display:block;font-size:13px;color:#0f172a;margin-top:2px">${esc(p.telephone || "—")}</span>
  </td>
</tr>
</table>
</td></tr>
</table>

<!-- Tableau résultats -->
<p style="margin:0 0 10px;font-size:14px;font-weight:700;color:#0a1628">Détail des réponses</p>
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0"
       style="border:1px solid #e5e7eb;border-radius:8px;overflow:hidden;margin-bottom:24px;font-size:13px">
<thead>
<tr style="background:${mColor}">
  <th style="padding:9px 12px;text-align:left;color:#fff;font-size:11px;text-transform:uppercase;font-weight:700;width:55%">Question</th>
  <th style="padding:9px 12px;text-align:left;color:#fff;font-size:11px;text-transform:uppercase;font-weight:700">Réponse</th>
  <th style="padding:9px 12px;text-align:left;color:#fff;font-size:11px;text-transform:uppercase;font-weight:700">Statut</th>
</tr>
</thead>
<tbody>${rowsHtml}</tbody>
</table>

<!-- Recommandations -->
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0"
       style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;margin-bottom:24px">
<tr><td style="padding:16px 18px">
  <p style="margin:0 0 10px;font-size:13px;font-weight:700;color:#166534">Recommandations</p>
  <ul style="margin:0;padding-left:18px;color:#166534;font-size:13px;line-height:1.7">${recoHtml}</ul>
</td></tr>
</table>

<!-- Conseiller -->
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0"
       style="background:#f8fafc;border-left:3px solid ${mColor};border-radius:0 8px 8px 0;margin-bottom:24px">
<tr><td style="padding:14px 16px">
  <p style="margin:0 0 2px;font-size:12px;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:1px">Votre conseiller S@FE CYBER PILOT</p>
  <p style="margin:0;font-size:14px;color:#0f172a;font-weight:600">${esc(p.conseiller)}</p>
  <p style="margin:4px 0 0;font-size:13px;color:#4b5563">contact@safe-digitalisation.fr</p>
</td></tr>
</table>

<!-- RGPD -->
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
<tr><td style="background:#eff6ff;border:1px solid #bfdbfe;border-radius:8px;padding:12px 14px">
  <p style="margin:0;font-size:11px;color:#1e40af;line-height:1.5">
    Consentement RGPD recueilli le ${esc(p.date)} dans le cadre du quiz de diagnostic S@FE CYBER PILOT.
    ${esc(p.nom)} (${esc(p.email)}) autorise S@FE CYBER PILOT à conserver ses coordonnées pour le suivi de ce diagnostic.
    Données non transmises à des tiers — Art. 13 RGPD.
  </p>
</td></tr>
</table>

</td></tr>

<!-- FOOTER -->
<tr><td style="background:#f8fafc;border-top:1px solid #e5e7eb;padding:18px 28px">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0"><tr>
  <td><span style="font-size:11px;color:#9ca3af">S@FE CYBER PILOT · Safe Digitalisation<br>contact@safe-digitalisation.fr</span></td>
  <td style="text-align:right"><span style="font-size:11px;color:#9ca3af">Rapport généré le ${esc(p.date)}</span></td>
</tr></table>
<p style="margin:10px 0 0;font-size:10px;color:#d1d5db;text-align:center">
  Vous recevez cet email car vous avez complété le quiz de diagnostic S@FE CYBER PILOT.
  Ce rapport est confidentiel et destiné uniquement à son destinataire.
</p>
</td></tr>

</table>
</td></tr>
</table>
</body>
</html>`;
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

  let body: any;
  try {
    body = await req.json();
  } catch {
    return json({ error: "bad_json" }, 400);
  }

  const { to_email, to_name, params } = body;
  if (!to_email || !params) return json({ error: "missing_fields" }, 400);
  if (!EMAIL_RE.test(String(to_email))) return json({ error: "invalid_email" }, 400);

  const SB_URL = Deno.env.get("SUPABASE_URL")!;
  const SB_SR = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const sbService = createClient(SB_URL, SB_SR);

  const withinLimit = await checkRateLimit(sbService);
  if (!withinLimit) return json({ error: "rate_limited" }, 429);

  let brevoKey: string;
  try {
    brevoKey = await getSecret(sbService, "brevo_api_key");
  } catch (e) {
    return json({ error: "secrets_unavailable", details: String(e.message || e) }, 500);
  }

  const html = buildHtml(params as AuditParams);
  const auditParams = params as AuditParams;

  const brevoResp = await fetch("https://api.brevo.com/v3/smtp/email", {
    method: "POST",
    headers: { "api-key": brevoKey, "Content-Type": "application/json", "Accept": "application/json" },
    body: JSON.stringify({
      sender: SENDER,
      to: [{ email: to_email, name: to_name || to_email }],
      subject: `Votre diagnostic ${auditParams.mission || "cybersécurité"} — ${auditParams.score ?? ""}% de conformité`,
      htmlContent: html,
    }),
  });

  if (!brevoResp.ok) {
    const errBody = await brevoResp.text();
    return json({ error: "send_failed", details: errBody }, 502);
  }

  return json({ success: true, to: to_name || to_email });
});
