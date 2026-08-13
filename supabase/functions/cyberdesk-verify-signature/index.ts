// ==========================================================================
// CyberDesk — Vérifie le code OTP et enregistre la signature du contrat
// partenaire (Mandataire / Associé SEP). C'est le seul point d'écriture de
// cyberdesk_partner_contracts (aucune policy insert pour authenticated,
// voir 022_cyberdesk_partner_contracts.sql) — la valeur probante de la
// signature dépend de cette vérification serveur, jamais du client.
//
// POST { code, remuneration_status, signature_svg } (JWT utilisateur requis)
//   → { success: true, remuneration_status, remuneration_pct, signed_at }
// ==========================================================================
import { createClient } from "@supabase/supabase-js";
import { corsHeaders } from "../_shared/cors.ts";
import { buildContractText, PARTNER_CONTRACT_VERSION, type RemunerationStatus } from "../_shared/partner-contract-content.ts";

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

  const code = String(body.code || "").trim();
  const remunerationStatus = body.remuneration_status as RemunerationStatus;
  const signatureSvg = String(body.signature_svg || "").trim();

  if (!/^\d{6}$/.test(code)) return json({ error: "invalid_code_format" }, 400);
  if (!["mandataire", "associe_sep"].includes(remunerationStatus)) return json({ error: "invalid_status" }, 400);
  if (!signatureSvg || !signatureSvg.startsWith("<svg")) return json({ error: "invalid_signature" }, 400);

  const sb = createClient(SB_URL, SB_SR);

  // Vérifie le code OTP : appartient à l'utilisateur, non utilisé, non expiré.
  const { data: otpRow, error: otpErr } = await sb
    .from("cyberdesk_signature_otp")
    .select("id, expires_at, used")
    .eq("user_id", user.id)
    .eq("contexte", "contrat_partenaire")
    .eq("code", code)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (otpErr) return json({ error: "db_error", details: otpErr.message }, 500);
  if (!otpRow || otpRow.used) return json({ error: "invalid_or_used_code" }, 400);
  if (new Date(otpRow.expires_at).getTime() < Date.now()) return json({ error: "expired_code" }, 400);

  const { error: markUsedErr } = await sb
    .from("cyberdesk_signature_otp")
    .update({ used: true })
    .eq("id", otpRow.id);
  if (markUsedErr) return json({ error: "db_error", details: markUsedErr.message }, 500);

  // Taux courant pour le statut choisi (barème admin, cyberdesk_remuneration_rates).
  const { data: rateRow, error: rateErr } = await sb
    .from("cyberdesk_remuneration_rates")
    .select("pct")
    .eq("status", remunerationStatus)
    .single();
  if (rateErr || !rateRow) return json({ error: "rate_unavailable" }, 500);
  const pct = Number(rateRow.pct);

  // Hash d'intégrité calculé côté serveur, jamais confié au client.
  const contractText = buildContractText(remunerationStatus, pct);
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(contractText));
  const docHash = Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, "0")).join("");

  const signedIp = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || null;
  const signedUserAgent = req.headers.get("user-agent") || null;

  const { data: contract, error: insertErr } = await sb
    .from("cyberdesk_partner_contracts")
    .insert({
      user_id: user.id,
      remuneration_status: remunerationStatus,
      remuneration_pct: pct,
      doc_version: PARTNER_CONTRACT_VERSION,
      doc_hash: docHash,
      signature_svg: signatureSvg,
      signed_ip: signedIp,
      signed_user_agent: signedUserAgent,
    })
    .select()
    .single();
  if (insertErr) return json({ error: "db_insert_failed", details: insertErr.message }, 500);

  await sb.from("audit_logs").insert({
    user_id: user.id,
    action: "contrat_partenaire_signe",
    module: "CyberDesk",
    entity_type: "cyberdesk_partner_contract",
    entity_id: contract.id,
    donnees_concernees: `Signature du contrat partenaire — statut ${remunerationStatus}, taux ${pct}%`,
    criticite: "Attention",
    resultat: "Succès",
    details: { remuneration_status: remunerationStatus, remuneration_pct: pct, doc_version: PARTNER_CONTRACT_VERSION },
  });

  return json({
    success: true,
    remuneration_status: contract.remuneration_status,
    remuneration_pct: contract.remuneration_pct,
    signed_at: contract.signed_at,
  });
});
