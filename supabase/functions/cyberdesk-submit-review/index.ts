// ==========================================================================
// CyberDesk — Soumission publique d'un avis client (page avis-client.html).
// Appelée par un visiteur non authentifié via un lien reçu par e-mail
// (cyberdesk-send-review-request) — même logique que cyberdesk-forgot-password :
// service_role en interne, --no-verify-jwt, réponse générique en cas de
// token invalide/expiré/déjà utilisé (pas de détail exploitable).
//
// POST { token, rating, comment } → { success: true|false }
// ==========================================================================
import { createClient } from "@supabase/supabase-js";
import { corsHeaders } from "../_shared/cors.ts";

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

  const token: string = String(body.token || "").trim();
  const rating = Number(body.rating);
  const comment: string = String(body.comment || "").trim().slice(0, 2000);
  if (!token || !Number.isInteger(rating) || rating < 1 || rating > 5) {
    return json({ error: "invalid_input" }, 400);
  }

  const SB_URL = Deno.env.get("SUPABASE_URL")!;
  const SB_SR = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const sb = createClient(SB_URL, SB_SR);

  const { data: review, error: eFind } = await sb
    .from("cybervictim_reviews")
    .select("id, expires_at, submitted_at")
    .eq("review_token", token)
    .maybeSingle();

  // Token inconnu, déjà utilisé ou expiré : réponse générique, aucun détail.
  if (eFind || !review || review.submitted_at || new Date(review.expires_at) < new Date()) {
    return json({ success: false });
  }

  const { error: eUpdate } = await sb
    .from("cybervictim_reviews")
    .update({ rating, comment: comment || null, submitted_at: new Date().toISOString() })
    .eq("id", review.id);
  if (eUpdate) return json({ success: false });

  return json({ success: true });
});
