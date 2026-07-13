// ==========================================================================
// CyberDesk — Envoi par email du résultat du quiz de diagnostic public
// (mission-cyber.html). Endpoint public — pas d'authentification JWT
// (le visiteur n'a pas de compte), protégé uniquement par la clé apikey
// standard Supabase (anon key), comme tout appel client public.
//
// POST { to_email, to_name, params } → { success: true }
//
// Fournisseur d'envoi : Resend (https://resend.com). Adapter cette fonction
// si un autre fournisseur est utilisé — le reste du fichier (validation,
// gabarit HTML) est indépendant du fournisseur.
// ==========================================================================

const CORS = {
  "Access-Control-Allow-Origin": "*", // TODO: restreindre au domaine cyberdesk une fois déployé
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}

function esc(s: unknown) {
  return String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
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
  const rows = (p.rows || []).map((r) => `
    <tr>
      <td style="padding:8px 10px;border-bottom:1px solid #f3f4f6;font-size:12px">${esc(r.question)}</td>
      <td style="padding:8px 10px;border-bottom:1px solid #f3f4f6;font-size:12px">${esc(r.reponse)}</td>
      <td style="padding:8px 10px;border-bottom:1px solid #f3f4f6">
        <span style="background:${esc(r.bg)};color:${esc(r.color)};padding:2px 9px;border-radius:99px;font-size:11px">${esc(r.text)}</span>
      </td>
    </tr>`).join("");

  return `<!DOCTYPE html><html lang="fr"><head><meta charset="utf-8"></head>
<body style="font-family:Arial,sans-serif;color:#1f2937;font-size:13px;line-height:1.5;max-width:640px;margin:0 auto">
  <div style="border-bottom:3px solid #06b6d4;padding-bottom:10px;margin-bottom:16px">
    <div style="font-size:20px;font-weight:900">CyberDesk</div>
    <div style="font-size:15px;font-weight:700;color:${esc(p.mission_color)}">Diagnostic ${esc(p.mission)}</div>
    <small style="color:#6b7280">${esc(p.date)}</small>
  </div>
  <div style="background:#ecfeff;border:1px solid #a5f3fc;border-radius:8px;padding:12px 14px;margin-bottom:16px">
    <div><strong>${esc(p.nom)}</strong> — ${esc(p.entreprise || "—")}</div>
    <div>${esc(p.email)} ${p.telephone ? "— " + esc(p.telephone) : ""}</div>
  </div>
  <div style="text-align:center;padding:16px;border:2px solid ${esc(p.niveau_border)};background:${esc(p.niveau_bg)};border-radius:12px;margin-bottom:16px">
    <div style="font-size:38px;font-weight:900;color:${esc(p.niveau_color)}">${esc(p.score)}%</div>
    <div style="font-size:11px;color:#6b7280">Score de sécurité — ${esc(p.niveau)}</div>
  </div>
  <table style="width:100%;border-collapse:collapse">
    <thead><tr><th style="background:#06b6d4;color:#fff;padding:7px 10px;text-align:left;font-size:10px">Question</th><th style="background:#06b6d4;color:#fff;padding:7px 10px;text-align:left;font-size:10px">Réponse</th><th style="background:#06b6d4;color:#fff;padding:7px 10px;text-align:left;font-size:10px">Statut</th></tr></thead>
    <tbody>${rows}</tbody>
  </table>
  <div style="margin-top:14px;padding-top:8px;border-top:1px solid #e5e7eb;font-size:10px;color:#9ca3af">
    CyberDesk — Rapport généré le ${esc(p.date)} — Conseiller : ${esc(p.conseiller)}
  </div>
</body></html>`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "bad_method" }, 405);

  const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
  const FROM_EMAIL = Deno.env.get("AUDIT_EMAIL_FROM") || "CyberDesk <onboarding@resend.dev>";
  if (!RESEND_API_KEY) return json({ error: "not_configured", details: "RESEND_API_KEY manquant" }, 500);

  let body: any;
  try {
    body = await req.json();
  } catch {
    return json({ error: "bad_json" }, 400);
  }

  const { to_email, to_name, params } = body;
  if (!to_email || !params) return json({ error: "missing_fields" }, 400);

  const html = buildHtml(params as AuditParams);

  const resendResp = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${RESEND_API_KEY}`,
    },
    body: JSON.stringify({
      from: FROM_EMAIL,
      to: [to_email],
      subject: `Votre diagnostic cybersécurité — ${params.score ?? ""}%`,
      html,
    }),
  });

  if (!resendResp.ok) {
    const errBody = await resendResp.text();
    return json({ error: "send_failed", details: errBody }, 502);
  }

  return json({ success: true, to: to_name || to_email });
});
