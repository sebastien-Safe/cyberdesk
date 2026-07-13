-- ==========================================================================
-- CyberDesk — Schéma initial
-- ==========================================================================
-- Ce schéma couvre deux sous-systèmes distincts issus de l'extraction de
-- safecrm (voir CLAUDE.md) :
--   1. Pipeline victimes 17Cyber (cybervictim_leads / cybervictim_products)
--   2. Module d'audit cybersécurité B2B (cyber_client_* + table clients)
--
-- IMPORTANT — cybervictim_leads / cybervictim_products n'existaient dans
-- AUCUNE migration versionnée de safecrm (créées manuellement en
-- production, jamais committées). Leur schéma ci-dessous est reconstruit
-- par déduction du code JS et des Edge Functions — à vérifier avant tout
-- usage réel avec des données de victimes.
--
-- Les tables cyber_client_* et audit_logs, elles, sont copiées fidèlement
-- depuis la migration versionnée de safecrm (20260708034035_remote_schema),
-- avec la seule adaptation de la FK contact_id : elle pointait vers
-- public.contacts (table du CRM parent, non extraite) et pointe maintenant
-- vers la nouvelle table clients ci-dessous.
-- ==========================================================================

-- ── Extensions ────────────────────────────────────────────────────────────
create extension if not exists "pgcrypto";
create extension if not exists "pg_cron";
create extension if not exists "pg_net";


-- ══════════════════════════════════════════════════════════════════════
-- 1. PIPELINE VICTIMES 17CYBER
-- ══════════════════════════════════════════════════════════════════════

-- ── cybervictim_products ────────────────────────────────────────────────
create table "public"."cybervictim_products" (
  "id"           uuid primary key default gen_random_uuid(),
  "code"         text not null unique,
  "alert_type"   text not null,
  "price_ht"     numeric(10,2) not null default 0,
  "price_ttc"    numeric(10,2) not null default 0,
  "pricing_note" text,
  "created_at"   timestamp with time zone not null default now()
);

alter table "public"."cybervictim_products" enable row level security;

create policy "auth_cybervictim_products"
  on "public"."cybervictim_products"
  as permissive
  for all
  to authenticated
  using (true)
  with check (true);

-- ── cybervictim_leads ────────────────────────────────────────────────────
create table "public"."cybervictim_leads" (
  "id"                        uuid primary key default gen_random_uuid(),
  "first_name"                text not null,
  "last_name"                 text not null,
  "email"                     text,
  "phone"                     text,
  "ticket_number"             text,
  "product_id"                uuid references public.cybervictim_products(id),
  "notes"                     text,
  "pipeline_stage"            text not null default 'signalement'
    check (pipeline_stage in ('signalement','qualification','devis_envoye','paiement_recu','rapport_livre','cloture')),
  "os_victim"                 text check (os_victim in ('windows','mac','ios','android')),
  "intervention_tasks"        jsonb,
  "task_completion_pct"       integer default 0,
  "quote_generated_at"        timestamp with time zone,
  "report_generated_at"       timestamp with time zone,
  "closed_at"                 timestamp with time zone,
  "purge_due_at"              timestamp with time zone,
  "documents_purge_due_at"    timestamp with time zone,
  "created_by"                uuid references auth.users(id),
  "created_at"                timestamp with time zone not null default now(),

  -- Canal d'entrée du dossier (multi-source)
  "source"                    text not null default '17cyber'
    check (source in ('17cyber','formulaire_web','csv','email','api','manuel')),

  -- Accès espace client sans authentification (portail futur — non exposé
  -- par RLS pour l'instant, voir commentaire plus bas)
  "client_token"               uuid not null default gen_random_uuid(),
  "client_token_expires_at"    timestamp with time zone
);

create index cybervictim_leads_product_id_idx on public.cybervictim_leads (product_id);
create index cybervictim_leads_pipeline_stage_idx on public.cybervictim_leads (pipeline_stage);
create unique index cybervictim_leads_client_token_idx on public.cybervictim_leads (client_token);

alter table "public"."cybervictim_leads" enable row level security;

create policy "auth_cybervictim_leads"
  on "public"."cybervictim_leads"
  as permissive
  for all
  to authenticated
  using (true)
  with check (true);

-- Pas de policy anon ici : l'espace client (accès par client_token, sans
-- authentification) est un chantier futur (voir CLAUDE.md roadmap). Sans
-- policy explicite pour le rôle anon, RLS bloque tout accès anonyme par
-- défaut — c'est le comportement voulu tant que ce portail n'existe pas.

-- Déclenche automatiquement les délais de purge RGPD à la clôture d'un
-- dossier (le code applicatif ne fait que passer pipeline_stage à
-- 'cloture' — victimes17.js lit ensuite closed_at/purge_due_at/
-- documents_purge_due_at depuis la ligne retournée).
create or replace function public.cybervictim_set_purge_dates()
returns trigger
language plpgsql
as $function$
begin
  if new.pipeline_stage = 'cloture' and (old.pipeline_stage is distinct from 'cloture') then
    new.closed_at := now();
    new.purge_due_at := now() + interval '5 years';
    new.documents_purge_due_at := now() + interval '10 years';
  end if;
  return new;
end;
$function$;

create trigger trg_cybervictim_set_purge_dates
  before update on public.cybervictim_leads
  for each row execute function public.cybervictim_set_purge_dates();


-- ══════════════════════════════════════════════════════════════════════
-- 2. MODULE AUDIT CYBERSÉCURITÉ B2B
-- ══════════════════════════════════════════════════════════════════════

-- ── clients ──────────────────────────────────────────────────────────────
-- Table propre à CyberDesk (ne vient pas de safecrm — le module d'audit
-- pointait vers la table `contacts` du CRM parent, non extraite). Schéma
-- de colonnes aligné sur ce que le code JS attend (nom, prenom, entreprise,
-- email) pour minimiser les changements de code lors du portage.
create table "public"."clients" (
  "id"          uuid primary key default gen_random_uuid(),
  "nom"         text,
  "prenom"      text,
  "entreprise"  text,
  "email"       text,
  "telephone"   text,
  "created_by"  uuid references auth.users(id),
  "created_at"  timestamp with time zone not null default now(),
  "updated_at"  timestamp with time zone not null default now()
);

alter table "public"."clients" enable row level security;

create policy "auth_clients"
  on "public"."clients"
  as permissive
  for all
  to authenticated
  using (true)
  with check (true);

-- ── cyber_client_profiles ────────────────────────────────────────────────
create table "public"."cyber_client_profiles" (
  "id"             uuid primary key default gen_random_uuid(),
  "contact_id"     uuid not null unique references public.clients(id) on delete cascade,
  "score_global"   integer default 0,
  "last_audit_at"  timestamp with time zone,
  "created_by"     uuid references auth.users(id),
  "created_at"     timestamp with time zone default now(),
  "updated_at"     timestamp with time zone default now()
);

alter table "public"."cyber_client_profiles" enable row level security;

create policy "auth_cyber_profiles"
  on "public"."cyber_client_profiles"
  as permissive
  for all
  to authenticated
  using (true)
  with check (true);

-- ── cyber_client_audits ──────────────────────────────────────────────────
create table "public"."cyber_client_audits" (
  "id"          uuid primary key default gen_random_uuid(),
  "contact_id"  uuid not null references public.clients(id) on delete cascade,
  "categorie"   text not null,
  "item_key"    text not null,
  "statut"      text not null default 'non_verifie'
    check (statut in ('conforme','partiel','non_conforme','na','non_verifie')),
  "notes"       text,
  "created_by"  uuid references auth.users(id),
  "created_at"  timestamp with time zone default now(),
  "updated_at"  timestamp with time zone default now(),
  unique (contact_id, item_key)
);

alter table "public"."cyber_client_audits" enable row level security;

-- Fidèle à safecrm : contrairement aux 3 autres tables cyber_client_*,
-- l'accès à l'audit est restreint à son créateur (pas d'accès staff élargi).
create policy "auth_cyber_audits"
  on "public"."cyber_client_audits"
  as permissive
  for all
  to authenticated
  using (auth.uid() = created_by)
  with check (auth.uid() = created_by);

-- ── cyber_client_incidents ───────────────────────────────────────────────
create table "public"."cyber_client_incidents" (
  "id"              uuid primary key default gen_random_uuid(),
  "contact_id"      uuid not null references public.clients(id) on delete cascade,
  "titre"           text not null,
  "description"     text,
  "date_incident"   date not null,
  "type_incident"   text,
  "niveau_gravite"  text default 'modere'
    check (niveau_gravite in ('faible','modere','grave','critique')),
  "statut"          text default 'ouvert'
    check (statut in ('ouvert','en_cours','resolu','cloture')),
  "actions_prises"  text,
  "created_by"      uuid references auth.users(id),
  "created_at"      timestamp with time zone default now(),
  "updated_at"      timestamp with time zone default now()
);

alter table "public"."cyber_client_incidents" enable row level security;

create policy "auth_cyber_incidents"
  on "public"."cyber_client_incidents"
  as permissive
  for all
  to authenticated
  using (true)
  with check (true);

-- ── cyber_client_plan ─────────────────────────────────────────────────────
create table "public"."cyber_client_plan" (
  "id"             uuid primary key default gen_random_uuid(),
  "contact_id"     uuid not null references public.clients(id) on delete cascade,
  "titre"          text not null,
  "description"    text,
  "priorite"       text default 'normale'
    check (priorite in ('critique','haute','normale','basse')),
  "statut"         text default 'a_faire'
    check (statut in ('a_faire','en_cours','fait','abandonne')),
  "categorie"      text,
  "date_echeance"  date,
  "created_by"     uuid references auth.users(id),
  "created_at"     timestamp with time zone default now(),
  "updated_at"     timestamp with time zone default now()
);

alter table "public"."cyber_client_plan" enable row level security;

create policy "auth_cyber_plan"
  on "public"."cyber_client_plan"
  as permissive
  for all
  to authenticated
  using (true)
  with check (true);


-- ══════════════════════════════════════════════════════════════════════
-- 3. JOURNAL RGPD (audit_logs)
-- ══════════════════════════════════════════════════════════════════════
-- Colonnes alignées sur celles utilisées par les Edge Functions
-- (generate-cybervictim-quote/report, update-cybervictim-tasks,
-- purge-cybervictim-data) et par logRgpd() côté client.
create table "public"."audit_logs" (
  "id"                  uuid primary key default gen_random_uuid(),
  "created_at"          timestamp with time zone not null default now(),
  "user_id"             uuid references auth.users(id),
  "action"              text not null,
  "module"              text,
  "entity_type"         text,
  "entity_id"           uuid,
  "donnees_concernees"  text,
  "criticite"           text default 'Info',
  "resultat"            text default 'Succès',
  "details"             jsonb
);

create index audit_logs_entity_type_idx on public.audit_logs (entity_type, created_at);

alter table "public"."audit_logs" enable row level security;

create policy "audit_insert_own"
  on "public"."audit_logs"
  as permissive
  for insert
  to authenticated
  with check (user_id = auth.uid() or user_id is null);

create policy "audit_select_staff"
  on "public"."audit_logs"
  as permissive
  for select
  to authenticated
  using (true);


-- ══════════════════════════════════════════════════════════════════════
-- 4. PURGE RGPD AUTOMATIQUE (pg_cron → Edge Function)
-- ══════════════════════════════════════════════════════════════════════
-- Le secret partagé (PURGE_SECRET) doit être créé manuellement une fois
-- après application de cette migration, avec la même valeur que le secret
-- PURGE_SECRET configuré côté Edge Function purge-cybervictim-data :
--
--   select vault.create_secret('<valeur-purge-secret>', 'purge_secret');
--
-- Remplacer l'URL ci-dessous par l'URL réelle du projet si différente.
create or replace function public.cyberdesk_run_purge()
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_secret text;
begin
  select decrypted_secret into v_secret from vault.decrypted_secrets where name = 'purge_secret';

  perform net.http_post(
    url := 'https://rxxciopqqqpsmyisxtcc.supabase.co/functions/v1/purge-cybervictim-data',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-purge-secret', v_secret),
    body := '{}'::jsonb
  );
end;
$function$;

revoke execute on function public.cyberdesk_run_purge() from public;
revoke execute on function public.cyberdesk_run_purge() from anon;
revoke execute on function public.cyberdesk_run_purge() from authenticated;

select cron.schedule('cyberdesk-purge-rgpd', '0 2 * * *', $$select public.cyberdesk_run_purge()$$);
