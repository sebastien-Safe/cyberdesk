// ==========================================================================
// CyberDesk — Sauvegarde de l'arbre de tâches d'intervention 17Cyber
// POST { lead_id, os, incident_type, phases, completion_pct }
// Auth : bearer JWT utilisateur authentifié (vérifié via auth.getUser(),
// même pattern que supabase/functions/send-mandat-email/index.ts).
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

const VALID_OS = ["windows", "mac", "ios", "android"];

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "bad_method" }, 405);

  const SB_URL  = Deno.env.get("SUPABASE_URL")!;
  const SB_ANON = Deno.env.get("SUPABASE_ANON_KEY")!;
  const SB_SR   = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return json({ error: "unauthorized" }, 401);

  const sbAnon = createClient(SB_URL, SB_ANON, { global: { headers: { Authorization: authHeader } } });
  const { data: { user }, error: authErr } = await sbAnon.auth.getUser();
  if (authErr || !user) return json({ error: "unauthorized" }, 401);

  let body: any;
  try {
    body = await req.json();
  } catch {
    return json({ error: "bad_json" }, 400);
  }

  const { lead_id, os, incident_type, phases, completion_pct } = body;
  if (!lead_id) return json({ error: "missing_lead_id" }, 400);
  if (os && !VALID_OS.includes(os)) return json({ error: "invalid_os" }, 400);
  if (!Array.isArray(phases)) return json({ error: "invalid_phases" }, 400);

  const pct = Math.max(0, Math.min(100, Math.round(Number(completion_pct) || 0)));

  const sb = createClient(SB_URL, SB_SR);

  const { data: lead, error: eLead } = await sb
    .from("cybervictim_leads")
    .select("id")
    .eq("id", lead_id)
    .single();
  if (eLead || !lead) return json({ error: "not_found" }, 404);

  const intervention_tasks = {
    incident_type: incident_type || null,
    os: os || null,
    phases,
    completion_pct: pct,
    last_updated: new Date().toISOString(),
  };

  const { error: eUpdate } = await sb
    .from("cybervictim_leads")
    .update({
      intervention_tasks,
      os_victim: os || null,
      task_completion_pct: pct,
    })
    .eq("id", lead_id);
  if (eUpdate) return json({ error: "update_failed", details: eUpdate.message }, 500);

  await sb.from("audit_logs").insert({
    user_id:            user.id,
    action:              "victim_taches_maj",
    module:               "Victimes17Cyber",
    entity_type:          "cybervictim_lead",
    entity_id:            lead_id,
    donnees_concernees:   "Mise à jour de l'arbre de tâches d'intervention",
    criticite:            "Info",
    resultat:             "Succès",
    details:              { incident_type: incident_type || null, os: os || null, completion_pct: pct },
  });

  return json({ success: true, completion_pct: pct });
});
