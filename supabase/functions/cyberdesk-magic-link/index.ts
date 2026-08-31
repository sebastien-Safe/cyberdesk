// ==========================================================================
// S@FE CYBER PILOT — Connexion par lien magique (magic link), envoyé via Brevo pour
// la même raison que cyberdesk-forgot-password : le service e-mail intégré de
// Supabase a un quota par défaut trop bas. On génère nous-mêmes le lien
// (auth.admin.generateLink) puis on l'envoie par notre propre e-mail Brevo,
// sans toucher au SMTP/Site URL globaux du projet partagé avec Vente/safe-crm.
//
// POST { email } → toujours { success: true }, même si le compte n'existe
// pas, pour ne pas permettre l'énumération de comptes.
//
// Déployée avec --no-verify-jwt (appelée avant toute connexion, comme
// cyberdesk-forgot-password — voir CLAUDE.md).
// ==========================================================================
import { createClient } from "@supabase/supabase-js";
import { corsHeaders } from "../_shared/cors.ts";

const SITE_URL = "https://cyberdesk.safe-digitalisation.fr";
const SENDER = { name: "S@FE CYBER PILOT", email: "noreply@safe-digitalisation.fr" };

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

  let body: any;
  try {
    body = await req.json();
  } catch {
    return json({ error: "bad_json" }, 400);
  }

  const email: string = String(body.email || "").trim().toLowerCase();
  if (!email) return json({ error: "missing_email" }, 400);

  const SB_URL = Deno.env.get("SUPABASE_URL")!;
  const SB_SR = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const sb = createClient(SB_URL, SB_SR);

  const { data: linkData, error: linkErr } = await sb.auth.admin.generateLink({
    type: "magiclink",
    email,
    options: { redirectTo: `${SITE_URL}/index.html` },
  });

  // Compte inconnu : même réponse générique, rien à journaliser (aucun
  // e-mail n'est réellement envoyé).
  const actionLink = linkData?.properties?.action_link;
  if (linkErr || !actionLink || !linkData.user) return json({ success: true });

  const userId = linkData.user.id;

  // Garde-fou : contrairement à 'recovery' (utilisé par cyberdesk-forgot-
  // password), le type 'magiclink' de generateLink peut créer un utilisateur
  // auth.users s'il n'existe pas encore (même comportement que
  // signInWithOtp({shouldCreateUser:true}) côté client). auth.users étant
  // partagé avec safe-crm/Vente, on ne peut pas se fier à une simple ligne
  // 'profiles' comme pour send-magic-link (un compte Vente n'a pas forcément
  // accès à CyberDesk, et inversement) — on reproduit donc exactement le
  // contrôle d'accès de has_module_access('cyberdesk') (voir migration
  // 008_cyberdesk_on_safecrm.sql), qui s'appuie normalement sur auth.uid()
  // et doit donc être réécrit ici avec l'id cible explicite puisqu'aucune
  // session utilisateur n'existe côté serveur.
  const [{ data: profileRow }, { data: moduleRow }] = await Promise.all([
    sb.from("profiles").select("role").eq("id", userId).maybeSingle(),
    sb.from("staff_module_access").select("user_id").eq("user_id", userId).eq("module", "cyberdesk").maybeSingle(),
  ]);
  const hasAccess = profileRow?.role === "super_admin" || !!moduleRow;
  if (!hasAccess) return json({ success: true });

  async function logAttempt(resultat: "Succès" | "Échec", details: Record<string, unknown> = {}) {
    await sb.from("audit_logs").insert({
      user_id: userId,
      action: "lien_connexion_envoye",
      module: "CyberDesk",
      entity_type: "auth_user",
      entity_id: userId,
      donnees_concernees: `Lien de connexion (magic link) envoyé à ${email}`,
      criticite: resultat === "Succès" ? "Info" : "Alerte",
      resultat,
      details: { email, ...details },
    });
  }

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
        <div style="font-size:11px;color:#666">S@FE CYBER PILOT — Gestion de dossiers victimes cyber</div>
      </div>
      <p>Bonjour,</p>
      <p>Voici votre lien de connexion à S@FE CYBER PILOT — il vous connecte directement, sans mot de passe.</p>
      <p style="text-align:center;margin:24px 0">
        <a href="${actionLink}" style="background:#000091;color:#fff;text-decoration:none;padding:12px 28px;border-radius:8px;font-weight:bold;display:inline-block">
          Se connecter
        </a>
      </p>
      <p style="font-size:13px;color:#666">Si vous n'êtes pas à l'origine de cette demande, ignorez cet e-mail —
      votre mot de passe actuel reste valide.</p>
      <p style="font-size:12px;color:#999;margin-top:24px">S@FE SAS — contact@safe-digitalisation.fr</p>
    </div>
  `;

  const brevoResp = await fetch("https://api.brevo.com/v3/smtp/email", {
    method: "POST",
    headers: { "api-key": brevoKey, "Content-Type": "application/json", "Accept": "application/json" },
    body: JSON.stringify({
      sender: SENDER,
      to: [{ email }],
      subject: "S@FE CYBER PILOT — Votre lien de connexion",
      htmlContent,
    }),
  });

  if (!brevoResp.ok) {
    await logAttempt("Échec", { brevo_status: brevoResp.status });
    return json({ success: true });
  }

  await logAttempt("Succès");
  return json({ success: true });
});
