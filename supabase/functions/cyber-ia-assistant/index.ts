// ==========================================================================
// CyberDesk — Assistant Cybersécurité IA (appel direct Anthropic Claude)
// POST { system, message } → { reply }
// Auth : bearer JWT utilisateur authentifié (même pattern que les autres
// Edge Functions cyberdesk).
// ==========================================================================
import { createClient } from "@supabase/supabase-js";

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

const ANTHROPIC_MODEL = "claude-opus-4-8";

Deno.serve(async (req) => {
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

  const sbService = createClient(SB_URL, SB_SR);
  const { data: keyData, error: keyErr } = await sbService.rpc("get_edge_secret", { secret_name: "anthropic_api_key" });
  const ANTHROPIC_API_KEY = keyErr ? null : (keyData as string | null);

  if (!ANTHROPIC_API_KEY) return json({ error: "not_configured", details: "anthropic_api_key manquant dans le Vault" }, 500);

  let body: any;
  try {
    body = await req.json();
  } catch {
    return json({ error: "bad_json" }, 400);
  }

  const message: string = (body.message || "").trim();
  const system: string = body.system || "";
  if (!message) return json({ error: "missing_message" }, 400);

  const anthropicResp = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: ANTHROPIC_MODEL,
      max_tokens: 1536,
      system: system || undefined,
      messages: [{ role: "user", content: message }],
    }),
  });

  if (!anthropicResp.ok) {
    const errBody = await anthropicResp.text();
    return json({ error: "anthropic_error", details: errBody }, 502);
  }

  const result = await anthropicResp.json();
  const textBlock = (result.content || []).find((b: any) => b.type === "text");
  if (!textBlock) return json({ error: "empty_response" }, 502);

  return json({ reply: textBlock.text });
});
