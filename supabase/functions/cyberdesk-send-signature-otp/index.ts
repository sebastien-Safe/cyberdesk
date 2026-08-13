// ==========================================================================
// CyberDesk — Envoi du code OTP pour la signature du contrat partenaire
// (Mandataire / Associé SEP). Même patron que cyberdesk-dpo-request (JWT
// utilisateur normal, service_role en interne) et que le mécanisme OTP déjà
// utilisé côté Vente (send-mandat-otp) — mais avec une table propre à
// CyberDesk (cyberdesk_signature_otp), voir 022_cyberdesk_partner_contracts.sql.
//
// POST {} (JWT utilisateur requis) → { success: true }
// Le code n'est jamais renvoyé dans la réponse HTTP, uniquement par e-mail.
// ==========================================================================
import { createClient } from "@supabase/supabase-js";
import { corsHeaders } from "../_shared/cors.ts";

const SENDER = { name: "S@FE — CyberDesk", email: "noreply@safe-digitalisation.fr" };

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
  // déclencher ce flux côté CyberDesk (projet Supabase partagé).
  const { data: hasAccess, error: accessErr } = await sbAnon.rpc("has_module_access", { p_module: "cyberdesk" });
  if (accessErr || hasAccess !== true) return json({ error: "forbidden" }, 403);

  const sb = createClient(SB_URL, SB_SR);

  let brevoKey: string;
  try {
    brevoKey = await getSecret(sb, "brevo_api_key");
  } catch (e) {
    return json({ error: "secrets_unavailable", details: String(e.message || e) }, 500);
  }

  // Invalide les codes non utilisés précédents avant d'en émettre un nouveau.
  await sb.from("cyberdesk_signature_otp")
    .update({ used: true })
    .eq("user_id", user.id)
    .eq("contexte", "contrat_partenaire")
    .eq("used", false);

  const code = Math.floor(100000 + Math.random() * 900000).toString();
  const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString();

  const { error: insertErr } = await sb.from("cyberdesk_signature_otp").insert({
    user_id: user.id,
    code,
    contexte: "contrat_partenaire",
    expires_at: expiresAt,
  });
  if (insertErr) return json({ error: "db_insert_failed", details: insertErr.message }, 500);

  const htmlContent = `
    <div style="font-family:Arial,sans-serif;color:#1d1d1b;max-width:560px;margin:0 auto;line-height:1.6">
      <div style="border-bottom:3px solid #000091;padding-bottom:10px;margin-bottom:20px">
        <strong style="font-size:18px">S<span style="color:#e1000f">@</span>FE</strong>
        <div style="font-size:11px;color:#666">CyberDesk — Signature du contrat partenaire</div>
      </div>
      <p>Voici votre code de confirmation pour la signature électronique de votre contrat partenaire CyberDesk :</p>
      <p style="font-size:28px;font-weight:700;letter-spacing:.2em;font-family:monospace">${code}</p>
      <p>Ce code est valable 15 minutes. Si vous n'êtes pas à l'origine de cette demande, ignorez cet e-mail.</p>
    </div>
  `;

  const brevoResp = await fetch("https://api.brevo.com/v3/smtp/email", {
    method: "POST",
    headers: { "api-key": brevoKey, "Content-Type": "application/json", "Accept": "application/json" },
    body: JSON.stringify({
      sender: SENDER,
      to: [{ email: user.email!, name: user.email! }],
      subject: "Votre code de confirmation — signature du contrat partenaire",
      htmlContent,
    }),
  });
  if (!brevoResp.ok) {
    const details = await brevoResp.text();
    return json({ error: "brevo_error", details }, 502);
  }

  return json({ success: true });
});
