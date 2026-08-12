-- ==========================================================================
-- CyberDesk — Coefficient du barème kilométrique (option O4 du devis,
-- migration 015 pour le calcul lui-même) rendu ajustable depuis l'app par
-- un admin, plutôt qu'en dur dans le code.
--
-- Avant cette migration, la valeur vivait uniquement dans
-- assets/data/tarifs-cyberdesk.json + supabase/functions/_shared/
-- travel-fee-config.ts (duplication statique) — changer un barème qui
-- est republié chaque année aurait nécessité un déploiement à chaque
-- fois. Table à une seule ligne (singleton) : pas besoin d'un système de
-- config générique pour un unique réglage.
--
-- Ne recrée PAS : has_module_access(), is_admin()/is_super_admin()
-- (déjà en place). Additive uniquement.
-- ==========================================================================

create table "public"."cyberdesk_travel_fee_settings" (
  "id"                 uuid primary key default gen_random_uuid(),
  "coefficient_eur_km" numeric(6,3) not null default 1 check (coefficient_eur_km >= 0),
  "updated_by"         uuid references auth.users(id),
  "updated_at"         timestamptz not null default now()
);

comment on table public.cyberdesk_travel_fee_settings
  is 'Réglage à une seule ligne : coefficient €/km du barème kilométrique, lu par cyberdesk-compute-travel-fee, éditable par un admin depuis la modale devis (option Déplacement). Défaut 1 tant qu''aucun admin ne l''a renseigné avec le barème réel en vigueur.';

insert into "public"."cyberdesk_travel_fee_settings" (coefficient_eur_km) values (1);

alter table "public"."cyberdesk_travel_fee_settings" enable row level security;

create policy "cyberdesk_travel_fee_settings_select"
  on "public"."cyberdesk_travel_fee_settings" as permissive for select to authenticated
  using (has_module_access('cyberdesk'));

create policy "cyberdesk_travel_fee_settings_admin_write"
  on "public"."cyberdesk_travel_fee_settings" as permissive for update to authenticated
  using (is_admin() or is_super_admin())
  with check (is_admin() or is_super_admin());
-- Pas de policy insert/delete pour authenticated : la ligne unique est
-- seedée par cette migration (service_role), jamais recréée par l'app.
