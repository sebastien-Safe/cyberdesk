// ==========================================================================
// CyberDesk — Réservation d'un créneau d'intervention par la victime.
// POST { client_token, start, end }
// Accès public (client_token). Revérifie la disponibilité juste avant
// création de l'événement pour limiter le risque de double réservation.
// ==========================================================================
import { createClient } from "@supabase/supabase-js";
import { getFreeBusy, createCalendarEvent } from "../_shared/google-calendar.ts";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });
}

const CALENDAR_ID = "sebastien@alonso.biz";

async function getSecret(sb: ReturnType<typeof createClient>, name: string): Promise<string> {
  const { data, error } = await sb.rpc("get_edge_secret", { secret_name: name });
  if (error || !data) throw new Error(`Secret "${name}" introuvable dans le Vault.`);
  return data as string;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "bad_method" }, 405);

  let body: any;
  try {
    body = await req.json();
  } catch {
    return json({ error: "bad_json" }, 400);
  }
  const { client_token, start, end } = body;
  if (!client_token || !start || !end) return json({ error: "missing_fields" }, 400);

  const startDate = new Date(start);
  const endDate = new Date(end);
  if (isNaN(startDate.getTime()) || isNaN(endDate.getTime()) || endDate <= startDate) {
    return json({ error: "invalid_range" }, 400);
  }
  if (startDate < new Date()) return json({ error: "slot_in_past" }, 400);

  const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  const { data: lead, error: eLead } = await sb
    .from("cybervictim_leads")
    .select("id, first_name, last_name, phone, ticket_number, quote_prestation_id, client_token_expires_at")
    .eq("client_token", client_token)
    .single();
  if (eLead || !lead) return json({ error: "not_found" }, 404);
  if (lead.client_token_expires_at && new Date(lead.client_token_expires_at) < new Date()) {
    return json({ error: "token_expired" }, 410);
  }

  let saJson: string;
  try {
    saJson = await getSecret(sb, "google_service_account_json");
  } catch (e) {
    return json({ error: "calendar_unavailable", details: String(e.message || e) }, 500);
  }
  const sa = JSON.parse(saJson);

  // Revérification anti-collision juste avant la création de l'événement.
  let busy;
  try {
    busy = await getFreeBusy(sa, CALENDAR_ID, start, end);
  } catch (e) {
    return json({ error: "google_calendar_error", details: String(e.message || e) }, 502);
  }
  const stillFree = !busy.some((b) => startDate.getTime() < new Date(b.end).getTime() && endDate.getTime() > new Date(b.start).getTime());
  if (!stillFree) return json({ error: "slot_no_longer_available" }, 409);

  const clientNom = `${lead.first_name || ""} ${lead.last_name || ""}`.trim() || "Dossier 17Cyber";
  let event;
  try {
    event = await createCalendarEvent(sa, CALENDAR_ID, {
      summary: `Intervention 17Cyber — ${clientNom}`,
      description: [
        `Dossier CyberDesk : ${lead.id}`,
        lead.ticket_number ? `Ticket 17Cyber : ${lead.ticket_number}` : null,
        lead.phone ? `Téléphone : ${lead.phone}` : null,
        lead.quote_prestation_id ? `Prestation : ${lead.quote_prestation_id}` : null,
        "Réservé par la victime via CyberDesk.",
      ].filter(Boolean).join("\n"),
      start: startDate.toISOString(),
      end: endDate.toISOString(),
    });
  } catch (e) {
    return json({ error: "google_calendar_error", details: String(e.message || e) }, 502);
  }

  const { error: eUpdate } = await sb
    .from("cybervictim_leads")
    .update({
      appointment_at: startDate.toISOString(),
      appointment_end_at: endDate.toISOString(),
      appointment_booked_at: new Date().toISOString(),
      calendar_event_id: event.id,
    })
    .eq("id", lead.id);
  if (eUpdate) return json({ error: "db_update_failed", details: eUpdate.message }, 500);

  await sb.from("audit_logs").insert({
    action: "victim_creneau_reserve",
    module: "Victimes17Cyber",
    entity_type: "cybervictim_lead",
    entity_id: lead.id,
    donnees_concernees: "Réservation créneau d'intervention (Google Calendar) par la victime",
    criticite: "Info",
    details: { start: startDate.toISOString(), end: endDate.toISOString(), calendar_event_id: event.id },
  });

  return json({ success: true, start: startDate.toISOString(), end: endDate.toISOString() });
});
