-- ==========================================================================
-- CyberDesk — Fiche profil utilisateur (paramétrage), demandes d'exercice
-- de droits RGPD (DPO) et avis clients post-clôture.
--
-- Ne recrée PAS : profiles, contacts, audit_logs, client_module_settings,
-- is_admin()/is_super_admin()/get_team_ids()/my_contact_id() (déjà en place
-- côté safe-crm). La fiche profil est donc une table propre à CyberDesk
-- (cyberdesk_user_settings), jamais une extension de `profiles`.
--
-- Additive uniquement : create table if not exists, aucun DROP de données.
-- ==========================================================================

create extension if not exists "pgcrypto";


-- ══════════════════════════════════════════════════════════════════════
-- 1. FICHE PROFIL UTILISATEUR (facturation, contrat, photo)
-- ══════════════════════════════════════════════════════════════════════

create table if not exists "public"."cyberdesk_user_settings" (
  "user_id"            uuid primary key references auth.users(id) on delete cascade,
  "billing_name"       text,
  "billing_address"    text,
  "siret"              text,
  "tva_number"         text,
  "legal_accepted_at"  timestamp with time zone,
  "photo_path"         text,
  "updated_at"         timestamp with time zone not null default now(),
  "created_at"         timestamp with time zone not null default now()
);

alter table "public"."cyberdesk_user_settings" enable row level security;

drop policy if exists "cyberdesk_user_settings_select_own_or_admin" on "public"."cyberdesk_user_settings";
create policy "cyberdesk_user_settings_select_own_or_admin"
  on "public"."cyberdesk_user_settings" as permissive for select to authenticated
  using (user_id = auth.uid() or is_admin() or is_super_admin());

drop policy if exists "cyberdesk_user_settings_write_own" on "public"."cyberdesk_user_settings";
create policy "cyberdesk_user_settings_write_own"
  on "public"."cyberdesk_user_settings" as permissive for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());


-- ══════════════════════════════════════════════════════════════════════
-- 2. DEMANDES D'EXERCICE DE DROITS RGPD (module DPO — préparation)
-- ══════════════════════════════════════════════════════════════════════

create table if not exists "public"."cyberdesk_dpo_requests" (
  "id"             uuid primary key default gen_random_uuid(),
  "user_id"        uuid not null references auth.users(id) on delete cascade,
  "request_type"   text not null
    check (request_type in ('acces','rectification','effacement','opposition','portabilite','limitation')),
  "message"        text,
  "status"         text not null default 'nouvelle'
    check (status in ('nouvelle','en_cours','traitee','rejetee')),
  "created_at"     timestamp with time zone not null default now(),
  "processed_at"   timestamp with time zone,
  "processed_by"   uuid references auth.users(id)
);

create index if not exists cyberdesk_dpo_requests_user_id_idx on public.cyberdesk_dpo_requests (user_id);

alter table "public"."cyberdesk_dpo_requests" enable row level security;

drop policy if exists "cyberdesk_dpo_requests_select_own_or_admin" on "public"."cyberdesk_dpo_requests";
create policy "cyberdesk_dpo_requests_select_own_or_admin"
  on "public"."cyberdesk_dpo_requests" as permissive for select to authenticated
  using (user_id = auth.uid() or is_admin() or is_super_admin());

drop policy if exists "cyberdesk_dpo_requests_insert_own" on "public"."cyberdesk_dpo_requests";
create policy "cyberdesk_dpo_requests_insert_own"
  on "public"."cyberdesk_dpo_requests" as permissive for insert to authenticated
  with check (user_id = auth.uid());

drop policy if exists "cyberdesk_dpo_requests_admin_update" on "public"."cyberdesk_dpo_requests";
create policy "cyberdesk_dpo_requests_admin_update"
  on "public"."cyberdesk_dpo_requests" as permissive for update to authenticated
  using (is_admin() or is_super_admin())
  with check (is_admin() or is_super_admin());

comment on table public.cyberdesk_dpo_requests
  is 'Intake des demandes d''exercice de droits RGPD — V1 : enregistrement + notification e-mail au DPO (cyberdesk-dpo-request). Traitement/suivi par le staff : V2 (pas d''UI admin dédiée pour l''instant).';


-- ══════════════════════════════════════════════════════════════════════
-- 3. AVIS CLIENTS (envoyés à la clôture du dossier)
-- ══════════════════════════════════════════════════════════════════════

create table if not exists "public"."cybervictim_reviews" (
  "id"             uuid primary key default gen_random_uuid(),
  "lead_id"        uuid not null references public.cybervictim_leads(id) on delete cascade,
  "review_token"   uuid not null default gen_random_uuid(),
  "rating"         smallint check (rating between 1 and 5),
  "comment"        text,
  "requested_at"   timestamp with time zone not null default now(),
  "expires_at"     timestamp with time zone not null,
  "submitted_at"   timestamp with time zone,
  "created_at"     timestamp with time zone not null default now()
);

create unique index if not exists cybervictim_reviews_token_idx on public.cybervictim_reviews (review_token);
create index if not exists cybervictim_reviews_lead_id_idx on public.cybervictim_reviews (lead_id);

alter table "public"."cybervictim_reviews" enable row level security;

-- Pas de policy anon : la soumission de l'avis (utilisateur non connecté,
-- lien reçu par e-mail) passe exclusivement par l'Edge Function service_role
-- cyberdesk-submit-review — cohérent avec le fait qu'aucune policy RLS anon
-- fonctionnelle n'existe ailleurs dans ce projet (cf. client_token, jamais
-- exploité en RLS anon).
drop policy if exists "cyberdesk_reviews_access" on "public"."cybervictim_reviews";
create policy "cyberdesk_reviews_access"
  on "public"."cybervictim_reviews" as permissive for all to authenticated
  using (public.has_module_access('cyberdesk'))
  with check (public.has_module_access('cyberdesk'));


-- ══════════════════════════════════════════════════════════════════════
-- 4. STOCKAGE — bucket photos de profil
-- ══════════════════════════════════════════════════════════════════════

insert into storage.buckets (id, name, public)
values ('cyberdesk-avatars', 'cyberdesk-avatars', false)
on conflict (id) do nothing;

drop policy if exists "cyberdesk_avatars_access" on storage.objects;
create policy "cyberdesk_avatars_access"
  on storage.objects as permissive for all to authenticated
  using (bucket_id = 'cyberdesk-avatars' and public.has_module_access('cyberdesk'))
  with check (bucket_id = 'cyberdesk-avatars' and public.has_module_access('cyberdesk'));
