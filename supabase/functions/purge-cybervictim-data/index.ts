// ==========================================================================
// CyberDesk — Purge RGPD automatique des dossiers victimes 17Cyber
// Déclenchée quotidiennement à 2h00 UTC par pg_cron (cf. migration SQL
// cybervictim_purge_cron), authentifiée par un secret partagé (Vault côté
// SQL / variable d'environnement PURGE_SECRET côté Edge Function) — même
// schéma que dda_check_echeances() → send-dda-alert-email.
//
// Trois volets indépendants, chacun idempotent :
//   1. Purge données victime  (purge_due_at < now)           → anonymisation
//   2. Purge documents        (documents_purge_due_at < now) → suppression
//      des références aux documents générés (horodatages quote/report)
//   3. Purge logs RGPD        (created_at < now - 1 an)      → uniquement
//      les logs cybervictim, jamais ceux des autres traitements
// ==========================================================================
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

serve(async (req) => {
  if (req.method !== "POST") return new Response("not allowed", { status: 405 });

  const PURGE_SECRET = Deno.env.get("PURGE_SECRET");
  if (PURGE_SECRET && req.headers.get("x-purge-secret") !== PURGE_SECRET) {
    return new Response("forbidden", { status: 403 });
  }

  const SB_URL = Deno.env.get("SUPABASE_URL")!;
  const SB_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const sb = createClient(SB_URL, SB_KEY);

  const now       = new Date();
  const nowIso    = now.toISOString();
  const purgeMark = `[PURGE RGPD - ${now.toLocaleDateString("fr-FR")}]`;

  const result = { data_purged: 0, documents_purged: 0, logs_purged: 0, errors: [] as string[] };

  async function logPurge(leadId: string, purgeType: "data" | "documents") {
    await sb.from("audit_logs").insert({
      user_id:     null,
      action:      "victim_donnees_purgees",
      entity_type: "cybervictim_lead",
      entity_id:   leadId,
      module:      "Victimes17Cyber",
      criticite:   "Attention",
      details:     { purge_type: purgeType, timestamp: nowIso },
    });
  }

  // ── 1. Purge données victime (5 ans après clôture) ──────────────────────
  const { data: dataCandidates, error: e1 } = await sb
    .from("cybervictim_leads")
    .select("id, first_name")
    .not("purge_due_at", "is", null)
    .lt("purge_due_at", nowIso);
  if (e1) result.errors.push("select_data_candidates: " + e1.message);

  for (const lead of dataCandidates || []) {
    if (lead.first_name && lead.first_name.startsWith("[PURGE RGPD")) continue; // déjà purgé — idempotent
    const { error } = await sb.from("cybervictim_leads").update({
      first_name: purgeMark,
      last_name:  purgeMark,
      email:      null,
      phone:      null,
      notes:      purgeMark,
    }).eq("id", lead.id);
    if (error) { result.errors.push(`update_data ${lead.id}: ${error.message}`); continue; }
    await logPurge(lead.id, "data");
    result.data_purged++;
  }

  // ── 2. Purge documents (10 ans après clôture) ───────────────────────────
  const { data: docsCandidates, error: e2 } = await sb
    .from("cybervictim_leads")
    .select("id, quote_generated_at, report_generated_at")
    .not("documents_purge_due_at", "is", null)
    .lt("documents_purge_due_at", nowIso);
  if (e2) result.errors.push("select_docs_candidates: " + e2.message);

  for (const lead of docsCandidates || []) {
    if (!lead.quote_generated_at && !lead.report_generated_at) continue; // déjà purgé — idempotent
    const { error } = await sb.from("cybervictim_leads").update({
      quote_generated_at:  null,
      report_generated_at: null,
    }).eq("id", lead.id);
    if (error) { result.errors.push(`update_docs ${lead.id}: ${error.message}`); continue; }
    await logPurge(lead.id, "documents");
    result.documents_purged++;
  }

  // ── 3. Purge logs RGPD à 1 an glissant — uniquement les logs cybervictim ─
  const oneYearAgoIso = new Date(now.getTime() - 365 * 24 * 3600 * 1000).toISOString();
  const { data: deletedLogs, error: e3 } = await sb
    .from("audit_logs")
    .delete()
    .eq("entity_type", "cybervictim_lead")
    .lt("created_at", oneYearAgoIso)
    .select("id");
  if (e3) result.errors.push("delete_logs: " + e3.message);
  result.logs_purged = (deletedLogs || []).length;

  return new Response(JSON.stringify(result), {
    status: result.errors.length ? 207 : 200,
    headers: { "Content-Type": "application/json" },
  });
});
