-- Migration 003 : champs diagnostic complet
-- Charte Cybermalveillance.gouv.fr v2.5 — art. 3a et 3b
--
-- Note : os_victim existe déjà (migration 001, colonne + check
-- windows/mac/ios/android) — non recréé ici.

alter table "public"."cybervictim_leads"

  -- Identification victime
  add column if not exists "victim_type" text
    check (victim_type in ('particulier','entreprise_association','collectivite')),
  add column if not exists "city" text,

  -- Description de l'incident (art. 3a)
  add column if not exists "attack_type" text
    check (attack_type in (
      'hameconnage','ransomware','violation_compte','arnaque_virement',
      'fraude_telephonique','usurpation_identite','intrusion_reseau',
      'deni_de_service','autre'
    )),
  add column if not exists "attack_description" text,
  add column if not exists "severity" text
    default 'moderee'
    check (severity in ('faible','moderee','elevee','critique')),
  add column if not exists "targeted_services" text,

  -- Évaluation de l'impact (art. 3a)
  add column if not exists "impacted_systems" text[],
  add column if not exists "financial_loss" text,
  add column if not exists "activity_impacted" text
    check (activity_impacted in ('non','partiellement','totalement')),
  add column if not exists "third_party_data_exposed" text
    default 'non'
    check (third_party_data_exposed in ('oui_cnil','non','inconnu')),

  -- Chronologie (art. 3b — préservation des traces)
  add column if not exists "attack_date" date,
  add column if not exists "attack_time" time,
  add column if not exists "discovery_date" date,
  add column if not exists "timeline_events" jsonb default '[]'::jsonb,
  add column if not exists "complaint_status" text
    default 'non_envisage'
    check (complaint_status in ('effectue','a_effectuer','non_envisage')),

  -- Preuves disponibles (art. 3b)
  add column if not exists "available_proofs" jsonb default '[]'::jsonb,
  add column if not exists "main_proof_ref" text,
  add column if not exists "remontee_cybermalveillance" boolean default true,

  -- Notes internes conseiller (séparées des notes victime, jamais dans
  -- le rapport DOCX généré — generate-cybervictim-report.ts utilise un
  -- .select() explicite qui n'inclut pas cette colonne, voir CLAUDE.md)
  add column if not exists "internal_notes" text;

-- Index utiles
create index if not exists cybervictim_leads_attack_type_idx
  on public.cybervictim_leads (attack_type);
create index if not exists cybervictim_leads_severity_idx
  on public.cybervictim_leads (severity);
create index if not exists cybervictim_leads_attack_date_idx
  on public.cybervictim_leads (attack_date);

comment on column public.cybervictim_leads.attack_description
  is 'Diagnostic obligatoire avant prestation — Charte Cybermalveillance art. 3a';
comment on column public.cybervictim_leads.timeline_events
  is 'JSONB : [{date: "YYYY-MM-DD", description: "..."}] — préservation traces art. 3b';
comment on column public.cybervictim_leads.available_proofs
  is 'JSONB : [{type: "email_phishing|capture|log|...", details: "..."}]';
comment on column public.cybervictim_leads.internal_notes
  is 'Notes internes conseiller — non communiquées à la victime, non incluses dans le rapport';
