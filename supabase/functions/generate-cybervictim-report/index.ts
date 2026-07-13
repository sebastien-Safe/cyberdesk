// ==========================================================================
// CyberDesk — Génération du rapport d'intervention 17Cyber (arbre de tâches)
// POST { lead_id } → { success, filename, docx_base64 }
// Le document est calculé à la volée et retourné dans la réponse HTTP :
// aucun stockage serveur (cohérent avec le registre RGPD T11 — cf. plan
// module-17cyber-les-devis-tidy-robin.md, section B.4/B.6).
// ==========================================================================
import { createClient } from "@supabase/supabase-js";
import { Document, Packer, Paragraph, PageBreak } from "docx";
import { h1, h2, p, bullet, placeholder, infoTable, chronoTable, centered, ChronoEntry } from "../_shared/docx-helpers.ts";

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

const SAFE = {
  nom: "S@FE SASU",
  adresse: "66 avenue des Champs-Élysées, 75008 Paris",
  siret: "104 699 558 00011",
  intervenant: "Sébastien Alonso — Président et DPO de S@FE",
  certification: "RNCP40652 BC01 (Délégué à la Protection des Données)",
  classification: "CONFIDENTIEL — diffusion restreinte au client",
  email: "contact@safe-digitalisation.fr",
  referencement: "Prestataire référencé cybermalveillance.gouv.fr / 17Cyber",
  disclaimer:
    "S@FE n'est pas un prestataire de forensique judiciaire agréé ; ce rapport constitue un élément d'aide à la décision et non une expertise judiciaire opposable.",
};

interface TaskRecord {
  task_id: string;
  label: string;
  detail?: string;
  priority?: string;
  charte_field?: string;
  checked?: boolean;
  checked_at?: string | null;
  evidence_ref?: string | null;
}

interface PhaseRecord {
  phase_id: string;
  phase_label: string;
  tasks: TaskRecord[];
}

function allTasks(phases: PhaseRecord[]): TaskRecord[] {
  return (phases || []).flatMap((ph) => ph.tasks || []);
}

function checkedTasks(phases: PhaseRecord[]): TaskRecord[] {
  return allTasks(phases).filter((t) => t.checked);
}

function tasksByCharteField(phases: PhaseRecord[], field: string): TaskRecord[] {
  return checkedTasks(phases).filter((t) => t.charte_field === field);
}

function buildChronoFromTasks(phases: PhaseRecord[]): ChronoEntry[] {
  return checkedTasks(phases)
    .filter((t) => t.checked_at)
    .sort((a, b) => new Date(a.checked_at!).getTime() - new Date(b.checked_at!).getTime())
    .map((t) => {
      const d = new Date(t.checked_at!);
      const when = d.toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short" });
      const detail = [t.detail, t.evidence_ref ? `Preuve : ${t.evidence_ref}` : null].filter(Boolean).join(" — ");
      return { when, action: t.label, detail: detail || "—" };
    });
}

function buildSectionBullets(phases: PhaseRecord[], field: string): Paragraph[] {
  const tasks = tasksByCharteField(phases, field);
  if (!tasks.length) return [placeholder("Aucune tâche cochée sur ce volet — à compléter manuellement si pertinent")];
  return tasks.map((t) => bullet(t.detail ? `${t.label} — ${t.detail}` : t.label));
}

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
  const leadId = body.lead_id;
  if (!leadId) return json({ error: "missing_lead_id" }, 400);

  const sb = createClient(SB_URL, SB_SR);
  const { data: lead, error: eLead } = await sb
    .from("cybervictim_leads")
    .select("id, first_name, last_name, ticket_number, os_victim, intervention_tasks, task_completion_pct, created_at, product_id, cybervictim_products(code, alert_type)")
    .eq("id", leadId)
    .single();
  if (eLead || !lead) return json({ error: "not_found" }, 404);

  const product = (lead as any).cybervictim_products || {};
  const it = lead.intervention_tasks || {};
  const phases: PhaseRecord[] = it.phases || [];
  const completionPct = lead.task_completion_pct || 0;

  const dossierRef = `S@FE-CYB-${new Date(lead.created_at || Date.now()).getFullYear()}-${leadId.slice(0, 8).toUpperCase()}`;
  const clientNom = `${lead.first_name || ""} ${lead.last_name || ""}`.trim() || "—";
  const dateSignalement = lead.created_at
    ? new Date(lead.created_at).toLocaleDateString("fr-FR", { day: "2-digit", month: "long", year: "numeric" })
    : "—";
  const dateIntervention = new Date().toLocaleDateString("fr-FR", { day: "2-digit", month: "long", year: "numeric" });

  const chrono = buildChronoFromTasks(phases);

  const doc = new Document({
    sections: [
      {
        properties: { page: { size: { width: 11906, height: 16838 }, margin: { top: 1134, bottom: 1134, left: 1134, right: 1134 } } },
        children: [
          centered("S@FE", { bold: true, size: 22 }),
          centered("Cybersécurité · RGPD · Prestataire référencé cybermalveillance.gouv.fr", { color: "666666", size: 16 }),
          h1(`RAPPORT D'INTERVENTION — ${product.alert_type || "Incident cybersécurité"}`),

          infoTable([
            ["Référence dossier S@FE", dossierRef],
            ["N° ticket 17Cyber", lead.ticket_number || "—"],
            ["Client", clientNom],
            ["Système de la victime", lead.os_victim ? lead.os_victim.toUpperCase() : "—"],
            ["Date de signalement", dateSignalement],
            ["Date d'intervention", dateIntervention],
            ["Avancement de l'intervention", `${completionPct} %`],
            ["Intervenant", SAFE.intervenant],
            ["Certification", SAFE.certification],
            ["Classification", SAFE.classification],
          ]),

          h2("1. Synthèse managériale"),
          placeholder(
            "Résumé en langage non technique (5 à 10 lignes) : ce qui s'est passé, ce qui a été fait, le risque résiduel, les actions restant à la charge du client — à compléter dans Word avant envoi"
          ),

          h2("2. Nature et contexte de l'incident"),
          ...buildSectionBullets(phases, "contexte"),

          h2("3. Chronologie de l'intervention"),
          chronoTable(chrono),

          h2("4. Mesures de confinement prises"),
          ...buildSectionBullets(phases, "mesures_confinement"),

          h2("5. Éléments de preuve collectés"),
          ...buildSectionBullets(phases, "preuves_collectees"),

          h2("6. Démarches effectuées (plaintes, signalements)"),
          ...buildSectionBullets(phases, "demarches_legales"),

          h2("7. Mesures de remédiation"),
          ...buildSectionBullets(phases, "mesures_remediation"),

          h2("8. Recommandations"),
          ...buildSectionBullets(phases, "recommandations"),
          placeholder("Évaluation du risque résiduel et recommandations de suivi — à compléter dans Word avant envoi"),

          h2("9. Coordonnées du prestataire"),
          p(SAFE.nom),
          p(SAFE.adresse),
          p(`SIRET : ${SAFE.siret}`),
          p(SAFE.referencement),
          p(SAFE.email),

          new Paragraph({ children: [new PageBreak()] }),
          p(`Fait à Paris, le ${dateIntervention}`),
          p(SAFE.intervenant, { bold: true }),
          p(SAFE.certification, { italic: true, color: "666666" }),
          p(SAFE.disclaimer, { italic: true, color: "888888" }),
        ],
      },
    ],
  });

  const base64 = await Packer.toBase64String(doc);
  const filename = `17C_${(product.code || "incident").toUpperCase()}_${(lead.last_name || "").replace(/\s+/g, "")}_${(lead.first_name || "").replace(/\s+/g, "")}_${new Date().toISOString().slice(0, 10).replace(/-/g, "")}.docx`;

  await sb.from("audit_logs").insert({
    user_id:            user.id,
    action:              "victim_rapport_genere",
    module:               "Victimes17Cyber",
    entity_type:          "cybervictim_lead",
    entity_id:            leadId,
    donnees_concernees:   "Génération du rapport d'intervention (arbre de tâches)",
    criticite:            "Info",
    resultat:             "Succès",
    details:              { filename, completion_pct: completionPct },
  });

  await sb.from("cybervictim_leads").update({ report_generated_at: new Date().toISOString() }).eq("id", leadId);

  return json({ success: true, filename, docx_base64: base64 });
});
