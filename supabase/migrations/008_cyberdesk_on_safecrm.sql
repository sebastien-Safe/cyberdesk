-- ==========================================================================
-- CyberDesk sur Safe-crm-V2 (bgkijldrmdhklkadkeua) — remise en place après
-- suppression de l'ancien projet dédié rxxciopqqqpsmyisxtcc.
--
-- Ne recrée PAS : profiles, contacts, audit_logs, client_module_settings,
-- is_admin()/is_super_admin()/get_team_ids()/my_contact_id() (déjà en place
-- côté safe-crm, vérifié). Ne recrée PAS le module B2B (clients,
-- cyber_client_*) : reste dans safe-crm/Vente, hors périmètre CyberDesk.
--
-- Additive uniquement : create table if not exists, add column if not
-- exists, aucun DROP. Sûr sur une base contenant déjà des données safe-crm.
-- ==========================================================================

create extension if not exists "pgcrypto";
create extension if not exists "pg_cron";
create extension if not exists "pg_net";


-- ══════════════════════════════════════════════════════════════════════
-- 1. CONTRÔLE D'ACCÈS PAR MODULE (staff interne)
-- ══════════════════════════════════════════════════════════════════════

create table if not exists "public"."staff_module_access" (
  "id"          uuid primary key default gen_random_uuid(),
  "user_id"     uuid not null references auth.users(id) on delete cascade,
  "module"      text not null,
  "granted_by"  uuid references auth.users(id),
  "created_at"  timestamp with time zone not null default now(),
  unique ("user_id", "module")
);

alter table "public"."staff_module_access" enable row level security;

drop policy if exists "staff_module_access_select_own_or_admin" on "public"."staff_module_access";
create policy "staff_module_access_select_own_or_admin"
  on "public"."staff_module_access" as permissive for select to authenticated
  using (user_id = auth.uid() or is_admin() or is_super_admin());

drop policy if exists "staff_module_access_admin_write" on "public"."staff_module_access";
create policy "staff_module_access_admin_write"
  on "public"."staff_module_access" as permissive for all to authenticated
  using (is_super_admin()) with check (is_super_admin());

create or replace function public.has_module_access(p_module text)
returns boolean language sql stable security definer set search_path to 'public'
as $function$
  select
    coalesce(is_super_admin(), false)
    or exists (
      select 1 from public.staff_module_access
      where user_id = auth.uid() and module = p_module
    );
$function$;

revoke all on function public.has_module_access(text) from public;
grant execute on function public.has_module_access(text) to authenticated;


-- ══════════════════════════════════════════════════════════════════════
-- 2. PIPELINE VICTIMES 17CYBER
-- ══════════════════════════════════════════════════════════════════════

create table if not exists "public"."cybervictim_products" (
  "id"           uuid primary key default gen_random_uuid(),
  "code"         text not null unique,
  "alert_type"   text not null,
  "price_ht"     numeric(10,2) not null default 0,
  "price_ttc"    numeric(10,2) not null default 0,
  "pricing_note" text,
  "created_at"   timestamp with time zone not null default now()
);

alter table "public"."cybervictim_products" enable row level security;

drop policy if exists "cyberdesk_products_access" on "public"."cybervictim_products";
create policy "cyberdesk_products_access"
  on "public"."cybervictim_products" as permissive for all to authenticated
  using (public.has_module_access('cyberdesk'))
  with check (public.has_module_access('cyberdesk'));

create table if not exists "public"."cybervictim_leads" (
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

  "source"                    text not null default '17cyber'
    check (source in ('17cyber','formulaire_web','csv','email','api','manuel')),

  "client_token"               uuid not null default gen_random_uuid(),
  "client_token_expires_at"    timestamp with time zone,

  "victim_type" text check (victim_type in ('particulier','entreprise_association','collectivite')),
  "city" text,
  "attack_type" text check (attack_type in (
      'hameconnage','ransomware','violation_compte','arnaque_virement',
      'fraude_telephonique','usurpation_identite','intrusion_reseau',
      'deni_de_service','autre'
    )),
  "attack_description" text,
  "severity" text default 'moderee' check (severity in ('faible','moderee','elevee','critique')),
  "targeted_services" text,
  "impacted_systems" text[],
  "financial_loss" text,
  "activity_impacted" text check (activity_impacted in ('non','partiellement','totalement')),
  "third_party_data_exposed" text default 'non' check (third_party_data_exposed in ('oui_cnil','non','inconnu')),
  "attack_date" date,
  "attack_time" time,
  "discovery_date" date,
  "timeline_events" jsonb default '[]'::jsonb,
  "complaint_status" text default 'non_envisage' check (complaint_status in ('effectue','a_effectuer','non_envisage')),
  "available_proofs" jsonb default '[]'::jsonb,
  "main_proof_ref" text,
  "remontee_cybermalveillance" boolean default true,
  "internal_notes" text,

  "birth_year" integer check (birth_year is null or (birth_year >= 1900 and birth_year <= extract(year from now())::int)),

  "quote_sent_at"        timestamp with time zone,
  "stripe_session_id"     text,
  "stripe_checkout_url"   text,
  "payment_status"        text default 'non_initie'
    check (payment_status in ('non_initie','en_attente','paye','expire','annule')),
  "paid_at"               timestamp with time zone,
  "amount_paid_ttc"       numeric(10,2),

  "quote_prestation_id"          text,
  "appointment_duration_minutes"  integer
);

create index if not exists cybervictim_leads_product_id_idx on public.cybervictim_leads (product_id);
create index if not exists cybervictim_leads_pipeline_stage_idx on public.cybervictim_leads (pipeline_stage);
create unique index if not exists cybervictim_leads_client_token_idx on public.cybervictim_leads (client_token);
create index if not exists cybervictim_leads_attack_type_idx on public.cybervictim_leads (attack_type);
create index if not exists cybervictim_leads_severity_idx on public.cybervictim_leads (severity);
create index if not exists cybervictim_leads_attack_date_idx on public.cybervictim_leads (attack_date);
create unique index if not exists cybervictim_leads_stripe_session_id_idx
  on public.cybervictim_leads (stripe_session_id) where stripe_session_id is not null;

alter table "public"."cybervictim_leads" enable row level security;

drop policy if exists "cyberdesk_leads_access" on "public"."cybervictim_leads";
create policy "cyberdesk_leads_access"
  on "public"."cybervictim_leads" as permissive for all to authenticated
  using (public.has_module_access('cyberdesk'))
  with check (public.has_module_access('cyberdesk'));

comment on column public.cybervictim_leads.attack_description
  is 'Diagnostic obligatoire avant prestation — Charte Cybermalveillance art. 3a';
comment on column public.cybervictim_leads.internal_notes
  is 'Notes internes conseiller — non communiquées à la victime, non incluses dans le rapport';
comment on column public.cybervictim_leads.payment_status
  is 'Statut du paiement — mis à jour par stripe-webhook (Stripe) ou manuellement (victimes17.js). Répliqué automatiquement dans public.payments par trg_sync_cybervictim_payment.';

create or replace function public.cybervictim_set_purge_dates()
returns trigger language plpgsql set search_path to 'public' as $function$
begin
  if new.pipeline_stage = 'cloture' and (old.pipeline_stage is distinct from 'cloture') then
    new.closed_at := now();
    new.purge_due_at := now() + interval '5 years';
    new.documents_purge_due_at := now() + interval '10 years';
  end if;
  return new;
end;
$function$;

drop trigger if exists trg_cybervictim_set_purge_dates on public.cybervictim_leads;
create trigger trg_cybervictim_set_purge_dates
  before update on public.cybervictim_leads
  for each row execute function public.cybervictim_set_purge_dates();


-- ══════════════════════════════════════════════════════════════════════
-- 3. PAIEMENTS — SOURCE UNIQUE PARTAGÉE (CyberDesk ↔ Vente)
-- ══════════════════════════════════════════════════════════════════════

create table if not exists "public"."payments" (
  "id"              uuid primary key default gen_random_uuid(),
  "module"          text not null default 'cyberdesk',
  "source_type"     text not null,
  "source_id"       uuid not null,
  "provider"        text not null default 'stripe',
  "stripe_session_id" text,
  "amount_ht"       numeric(10,2),
  "amount_ttc"      numeric(10,2) not null default 0,
  "currency"        text not null default 'eur',
  "status"          text not null default 'non_initie'
    check (status in ('non_initie','en_attente','paye','expire','annule','rembourse')),
  "paid_at"         timestamp with time zone,
  "created_by"      uuid references auth.users(id),
  "created_at"      timestamp with time zone not null default now(),
  "updated_at"      timestamp with time zone not null default now(),
  unique ("module", "source_type", "source_id")
);

create unique index if not exists payments_stripe_session_id_idx
  on public.payments (stripe_session_id) where stripe_session_id is not null;
create index if not exists payments_module_status_idx on public.payments (module, status);

alter table "public"."payments" enable row level security;

drop policy if exists "payments_admin_select" on "public"."payments";
create policy "payments_admin_select"
  on "public"."payments" as permissive for select to authenticated
  using (is_admin() or is_super_admin());

create or replace view public.v_payments_reporting
with (security_invoker = on) as
select
  module,
  date_trunc('month', coalesce(paid_at, created_at)) as period,
  status,
  count(*) as nb_dossiers,
  sum(amount_ttc) filter (where status = 'paye') as ca_encaisse_ttc
from public.payments
group by module, date_trunc('month', coalesce(paid_at, created_at)), status;

revoke all on public.v_payments_reporting from public, anon;
grant select on public.v_payments_reporting to authenticated;

create or replace function public.sync_cybervictim_payment()
returns trigger language plpgsql security definer set search_path to 'public' as $function$
begin
  insert into public.payments (
    module, source_type, source_id, provider, stripe_session_id,
    amount_ttc, status, paid_at, created_by
  )
  values (
    'cyberdesk', 'cybervictim_lead', new.id,
    case when new.stripe_session_id is not null then 'stripe' else 'manuel' end,
    new.stripe_session_id,
    coalesce(new.amount_paid_ttc, 0),
    coalesce(new.payment_status, 'non_initie'),
    new.paid_at,
    new.created_by
  )
  on conflict (module, source_type, source_id) do update set
    provider           = excluded.provider,
    stripe_session_id  = excluded.stripe_session_id,
    amount_ttc         = excluded.amount_ttc,
    status              = excluded.status,
    paid_at             = excluded.paid_at,
    updated_at          = now();
  return new;
end;
$function$;

drop trigger if exists trg_sync_cybervictim_payment on public.cybervictim_leads;
create trigger trg_sync_cybervictim_payment
  after insert or update of payment_status, amount_paid_ttc, paid_at, stripe_session_id
  on public.cybervictim_leads
  for each row execute function public.sync_cybervictim_payment();


-- ══════════════════════════════════════════════════════════════════════
-- 4. STOCKAGE — bucket preuves (captures d'écran)
-- ══════════════════════════════════════════════════════════════════════

insert into storage.buckets (id, name, public)
values ('cybervictim-proofs', 'cybervictim-proofs', false)
on conflict (id) do nothing;

drop policy if exists "cyberdesk_proofs_access" on storage.objects;
create policy "cyberdesk_proofs_access"
  on storage.objects as permissive for all to authenticated
  using (bucket_id = 'cybervictim-proofs' and public.has_module_access('cyberdesk'))
  with check (bucket_id = 'cybervictim-proofs' and public.has_module_access('cyberdesk'));


-- ══════════════════════════════════════════════════════════════════════
-- 5. HELPER VAULT (secrets Edge Functions) — n'existe pas encore, à créer
-- ══════════════════════════════════════════════════════════════════════

create or replace function public.get_edge_secret(secret_name text)
returns text language plpgsql security definer set search_path to 'public' as $function$
declare v text;
begin
  select decrypted_secret into v from vault.decrypted_secrets where name = secret_name;
  return v;
end;
$function$;

revoke execute on function public.get_edge_secret(text) from public, anon, authenticated;
grant execute on function public.get_edge_secret(text) to service_role;


-- ══════════════════════════════════════════════════════════════════════
-- 6. PURGE RGPD AUTOMATIQUE (pg_cron → Edge Function)
-- ══════════════════════════════════════════════════════════════════════
-- Nécessite après cette migration :
--   select vault.create_secret('<valeur>', 'purge_secret');
-- (même valeur que le secret PURGE_SECRET de l'Edge Function purge-cybervictim-data)

create or replace function public.cyberdesk_run_purge()
returns void language plpgsql security definer set search_path to 'public' as $function$
declare v_secret text;
begin
  select decrypted_secret into v_secret from vault.decrypted_secrets where name = 'purge_secret';
  perform net.http_post(
    url := 'https://bgkijldrmdhklkadkeua.supabase.co/functions/v1/purge-cybervictim-data',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-purge-secret', v_secret),
    body := '{}'::jsonb
  );
end;
$function$;

revoke execute on function public.cyberdesk_run_purge() from public, anon, authenticated;

select cron.unschedule('cyberdesk-purge-rgpd')
where exists (select 1 from cron.job where jobname = 'cyberdesk-purge-rgpd');

select cron.schedule('cyberdesk-purge-rgpd', '0 2 * * *', $$select public.cyberdesk_run_purge()$$);
