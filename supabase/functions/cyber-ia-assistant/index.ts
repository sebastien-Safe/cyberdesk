// ==========================================================================
// S@FE CYBER PILOT — Assistant Cybersécurité IA (appel direct Anthropic Claude)
// POST { lead_id, question } → { reply }
//
// Auth : bearer JWT utilisateur authentifié + droit d'accès au module
// cyberdesk (has_module_access) — nécessaire depuis que le projet Supabase
// est partagé avec Vente/safe-crm (même auth.users, comptes Vente exclus).
//
// Le contexte du dossier est assemblé ICI, côté serveur (pas dans le
// navigateur) : le client n'envoie que l'identifiant du dossier et la
// question. Le prompt système (CYBER_SYSTEM) n'est plus accepté depuis le
// client non plus, pour éviter qu'un navigateur modifié n'impose son
// propre system prompt à l'appel Anthropic.
//
// Pseudonymisation : le nom connu de la victime et les motifs identifiables
// (email, téléphone, IBAN, numéro de sécurité sociale, carte bancaire) sont
// masqués dans les champs texte libre avant l'appel à Anthropic — voir
// _shared/pii-redact.ts pour le détail et les limites documentées.
// ==========================================================================
import { createClient } from "@supabase/supabase-js";
import { CYBER_SYSTEM } from "../_shared/cyber-system-prompt.ts";
import { pseudonymize } from "../_shared/pii-redact.ts";
import { corsHeaders } from "../_shared/cors.ts";
import { canAccessLead } from "../_shared/lead-access.ts";

const ANTHROPIC_MODEL = "claude-sonnet-5";

// Reprend la logique de l'ancien _buildVictimAiContext (assets/victimes17/victimes17-ai.js),
// désormais côté serveur, avec pseudonymisation des champs texte libre.
function buildContext(lead: Record<string, any>): string {
  const fn = lead.first_name as string | null;
  const ln = lead.last_name as string | null;
  const pseudo = (s: string | null | undefined) => pseudonymize(s, fn, ln);

  const lines: string[] = [];
  lines.push(`Type de victime : ${lead.victim_type || "non renseigné"}.`);
  if (lead.attack_type) lines.push(`Type d'attaque (diagnostic) : ${lead.attack_type}.`);
  if (lead.attack_description) lines.push(`Description de l'incident : ${pseudo(lead.attack_description)}`);
  if (lead.severity) lines.push(`Gravité déclarée : ${lead.severity}.`);
  if (lead.targeted_services) lines.push(`Services/plateformes visés : ${pseudo(lead.targeted_services)}.`);
  if (Array.isArray(lead.impacted_systems) && lead.impacted_systems.length) {
    lines.push(`Systèmes touchés : ${lead.impacted_systems.join(", ")}.`);
  }
  if (lead.financial_loss) lines.push(`Préjudice financier estimé : ${pseudo(lead.financial_loss)}.`);
  if (lead.activity_impacted) lines.push(`Activité professionnelle impactée : ${lead.activity_impacted}.`);
  if (lead.third_party_data_exposed && lead.third_party_data_exposed !== "non") {
    lines.push(`Données personnelles de tiers exposées : ${lead.third_party_data_exposed}.`);
  }
  if (lead.os_victim) lines.push(`Système d'exploitation de la victime : ${lead.os_victim}.`);
  if (lead.complaint_status) lines.push(`Dépôt de plainte : ${lead.complaint_status}.`);
  if (lead.birth_year) {
    lines.push(`Âge approximatif de la victime : ${new Date().getFullYear() - lead.birth_year} ans.`);
  }
  if (Array.isArray(lead.timeline_events) && lead.timeline_events.length) {
    const chrono = lead.timeline_events
      .map((e: any) => `${e.date || "?"} — ${pseudo(e.description || "")}`)
      .filter((s: string) => s.replace(/[?—\s]/g, "") !== "")
      .join(" ; ");
    if (chrono) lines.push(`Chronologie connue : ${chrono}`);
  }
  if (lead.notes) lines.push(`Notes dossier (compte-rendu des échanges avec la victime) : ${pseudo(lead.notes)}`);
  if (lead.internal_notes) lines.push(`Notes internes conseiller : ${pseudo(lead.internal_notes)}`);

  return lines.length ? `Contexte du dossier CRM :\n${lines.join("\n")}\n\n` : "";
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

  // Garde d'accès module — indispensable sur le projet Supabase partagé :
  // un compte Vente authentifié ne doit pas pouvoir appeler cette fonction.
  const { data: hasAccess, error: accessErr } = await sbAnon.rpc("has_module_access", { p_module: "cyberdesk" });
  if (accessErr || hasAccess !== true) return json({ error: "forbidden" }, 403);

  let body: any;
  try {
    body = await req.json();
  } catch {
    return json({ error: "bad_json" }, 400);
  }

  const leadId: string = (body.lead_id || "").trim();
  const question: string = (body.question || "").trim();
  if (!leadId) return json({ error: "missing_lead_id" }, 400);
  if (!question) return json({ error: "missing_question" }, 400);

  const sbService = createClient(SB_URL, SB_SR);

  const { data: lead, error: leadErr } = await sbService
    .from("cybervictim_leads")
    .select(
      "id, first_name, last_name, victim_type, attack_type, attack_description, severity, " +
        "targeted_services, impacted_systems, financial_loss, activity_impacted, " +
        "third_party_data_exposed, os_victim, complaint_status, birth_year, timeline_events, " +
        "notes, internal_notes, created_by",
    )
    .eq("id", leadId)
    .maybeSingle();
  if (leadErr || !lead) return json({ error: "lead_not_found" }, 404);
  if (!(await canAccessLead(sbAnon, lead.created_by, user.id))) return json({ error: "forbidden" }, 403);

  const { data: keyData, error: keyErr } = await sbService.rpc("get_edge_secret", { secret_name: "anthropic_api_key" });
  const ANTHROPIC_API_KEY = keyErr ? null : (keyData as string | null);
  if (!ANTHROPIC_API_KEY) return json({ error: "not_configured", details: "anthropic_api_key manquant dans le Vault" }, 500);

  const context = buildContext(lead);
  const pseudoQuestion = pseudonymize(question, lead.first_name, lead.last_name);

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
      // Prompt caching : CYBER_SYSTEM est strictement identique à chaque appel,
      // pour tous les dossiers et tous les utilisateurs — c'est le candidat
      // idéal pour cache_control (breakpoint "ephemeral", ~5 min glissantes).
      // Sans effet ni coût si le texte est sous le seuil minimum de mise en
      // cache d'Anthropic pour ce modèle (~1024 tokens).
      system: [
        { type: "text", text: CYBER_SYSTEM, cache_control: { type: "ephemeral" } },
      ],
      messages: [
        {
          role: "user",
          content: [
            // Contexte du dossier : identique tant que le conseiller pose
            // plusieurs questions de suite sur le même dossier (cas fréquent)
            // → mis en cache séparément de la question, qui elle change à
            // chaque appel et reste donc hors cache.
            ...(context
              ? [{ type: "text", text: context, cache_control: { type: "ephemeral" } }]
              : []),
            { type: "text", text: pseudoQuestion },
          ],
        },
      ],
    }),
  });

  if (!anthropicResp.ok) {
    const errBody = await anthropicResp.text();
    return json({ error: "anthropic_error", details: errBody }, 502);
  }

  const result = await anthropicResp.json();
  const textBlock = (result.content || []).find((b: any) => b.type === "text");
  if (!textBlock) return json({ error: "empty_response" }, 502);

  // Journal RGPD — traçabilité des appels à l'assistant IA (absente jusqu'ici).
  await sbService.from("audit_logs").insert({
    user_id: user.id,
    action: "ia_assistant_appel",
    module: "CyberDesk",
    entity_type: "cybervictim_lead",
    entity_id: lead.id,
    donnees_concernees: "Question posée à l'assistant IA — contexte dossier pseudonymisé transmis à Anthropic",
    criticite: "Info",
    resultat: "Succès",
    details: { model: ANTHROPIC_MODEL },
  });

  return json({ reply: textBlock.text });
});
