// ==========================================================================
// CyberDesk — Créneaux disponibles pour la réservation d'intervention.
// GET ?client_token=xxx
// Accès public (pas de JWT Supabase) : le client_token (UUID imprévisible,
// colonne dédiée depuis la migration 001) sert d'identifiant d'accès à la
// page de réservation envoyée par e-mail avec le devis.
// ==========================================================================
import { createClient } from "@supabase/supabase-js";
import { getFreeBusy, generateCandidateSlots, durationForPrestation } from "../_shared/google-calendar.ts";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });
}

const CALENDAR_ID = "sebastien@alonso.biz"; // "Travail" (agenda principal) — reçoit les événements créés
// Agendas consultés pour la détection de conflits (anti-doublon) — pas
// d'écriture dessus, uniquement lecture des périodes occupées.
const FREEBUSY_CALENDAR_IDS = [
  CALENDAR_ID,
  "c_c78ef913e5de9edfd3bdd17a6aeb08beec26a02fb5f232ac931344f14c274ca8@group.calendar.google.com", // Iphone Apple
];

async function getSecret(sb: ReturnType<typeof createClient>, name: string): Promise<string> {
  const { data, error } = await sb.rpc("get_edge_secret", { secret_name: name });
  if (error || !data) throw new Error(`Secret "${name}" introuvable dans le Vault.`);
  return data as string;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "GET") return json({ error: "bad_method" }, 405);

  const url = new URL(req.url);
  const clientToken = url.searchParams.get("client_token");
  if (!clientToken) return json({ error: "missing_client_token" }, 400);

  const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  const { data: lead, error: eLead } = await sb
    .from("cybervictim_leads")
    .select("id, first_name, last_name, quote_prestation_id, appointment_duration_minutes, client_token_expires_at, appointment_at")
    .eq("client_token", clientToken)
    .single();
  if (eLead || !lead) return json({ error: "not_found" }, 404);
  if (lead.client_token_expires_at && new Date(lead.client_token_expires_at) < new Date()) {
    return json({ error: "token_expired" }, 410);
  }

  const duration = lead.appointment_duration_minutes || durationForPrestation(lead.quote_prestation_id, null) || 60;

  let saJson: string;
  try {
    saJson = await getSecret(sb, "google_service_account_json");
  } catch (e) {
    return json({ error: "calendar_unavailable", details: String(e.message || e) }, 500);
  }
  const sa = JSON.parse(saJson);

  const now = new Date();
  const timeMin = now.toISOString();
  const timeMax = new Date(now.getTime() + 15 * 86400000).toISOString();

  let busy;
  try {
    busy = await getFreeBusy(sa, FREEBUSY_CALENDAR_IDS, timeMin, timeMax);
  } catch (e) {
    return json({ error: "google_calendar_error", details: String(e.message || e) }, 502);
  }

  const slots = generateCandidateSlots(duration, busy, 14, 4);

  return json({
    lead_name: `${lead.first_name || ""} ${lead.last_name || ""}`.trim(),
    duration_minutes: duration,
    already_booked_at: lead.appointment_at,
    slots,
  });
});
