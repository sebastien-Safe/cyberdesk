-- ==========================================================================
-- CyberDesk — Facturation SaaS des tenants (abonnement mensuel payé par
-- le prestataire cyber pour utiliser CyberDesk lui-même).
--
-- À ne pas confondre avec le paiement des dossiers victimes
-- (cyberdesk-stripe-webhook / send-cybervictim-quote, migration 005),
-- qui existe déjà et fonctionne — cette migration n'y touche pas.
--
-- Piste écartée après vérification du schéma réel : client_module_settings
-- (table safe-crm existante, contact_id -> contacts, 0 ligne, aucune colonne
-- de facturation) n'est pas le bon point d'accroche — c'est pensé pour
-- l'activation/branding d'un module pour un contact Vente, pas pour un
-- compte auth.users qui se connecte directement à CyberDesk et paie un
-- abonnement. Hors périmètre CyberDesk de toute façon (table Vente).
--
-- Cardinalité tenant <-> utilisateur en v1 : volontairement simple. Un
-- tenant_id nullable est ajouté directement sur staff_module_access
-- (déjà "une ligne = un accès (utilisateur, module)", générique par
-- conception) plutôt qu'une table de membership séparée — un seul vrai
-- client aujourd'hui, l'auto-invitation multi-siège reste un ajout manuel
-- par un admin pour l'instant.
--
-- payments reste un journal de charges déjà réalisées, comme aujourd'hui
-- (sync_cybervictim_payment, migration 008) — l'état vivant d'un
-- abonnement (statut, IDs Stripe, dates d'essai/renouvellement) va dans
-- cyberdesk_tenants, pas dans payments. Chaque facture Stripe payée
-- alimente quand même payments via un trigger de sync (même patron que
-- sync_cybervictim_payment), donc v_payments_reporting (reporting admin
-- Vente) récupère le CA d'abonnement sans aucun changement de son côté.
--
-- Ne recrée PAS : profiles, contacts, audit_logs, is_admin()/is_super_admin()
-- (déjà en place). Additive uniquement.
-- ==========================================================================

-- ══════════════════════════════════════════════════════════════════════
-- 1. TENANTS
-- ══════════════════════════════════════════════════════════════════════

create table "public"."cyberdesk_tenants" (
  "id"                      uuid primary key default gen_random_uuid(),
  "name"                    text not null,
  "stripe_customer_id"      text unique,
  "stripe_subscription_id"  text unique,
  "stripe_price_id"         text,
  "subscription_status"     text not null default 'trialing'
    check (subscription_status in ('trialing','active','past_due','canceled','unpaid','incomplete')),
  "trial_ends_at"           timestamptz,
  "current_period_end"      timestamptz,
  "created_by"              uuid references auth.users(id),
  "created_at"              timestamptz not null default now(),
  "updated_at"              timestamptz not null default now()
);

comment on table public.cyberdesk_tenants
  is 'Un tenant = un prestataire cyber qui paie un abonnement CyberDesk. subscription_status piloté par cyberdesk-billing-webhook (Stripe). past_due ne coupe pas l''accès (voir has_module_access) — seuls canceled/unpaid le font.';

alter table "public"."cyberdesk_tenants" enable row level security;

create policy "cyberdesk_tenants_select_member_or_admin"
  on "public"."cyberdesk_tenants" as permissive for select to authenticated
  using (
    is_admin() or is_super_admin()
    or exists (
      select 1 from public.staff_module_access sma
      where sma.tenant_id = cyberdesk_tenants.id and sma.user_id = auth.uid()
    )
  );

create policy "cyberdesk_tenants_admin_write"
  on "public"."cyberdesk_tenants" as permissive for all to authenticated
  using (is_super_admin())
  with check (is_super_admin());

-- ── Détail des factures Stripe (alimente payments par trigger, § 3) ──

create table "public"."cyberdesk_tenant_invoices" (
  "id"                 uuid primary key default gen_random_uuid(),
  "tenant_id"          uuid not null references public.cyberdesk_tenants(id) on delete cascade,
  "stripe_invoice_id"  text not null unique,
  "amount_ht"          numeric(10,2),
  "amount_ttc"         numeric(10,2) not null default 0,
  "currency"           text not null default 'eur',
  "status"             text not null default 'en_attente'
    check (status in ('en_attente','paye','echoue','rembourse')),
  "period_start"       timestamptz,
  "period_end"         timestamptz,
  "hosted_invoice_url" text,
  "paid_at"            timestamptz,
  "created_at"         timestamptz not null default now(),
  "updated_at"         timestamptz not null default now()
);

alter table "public"."cyberdesk_tenant_invoices" enable row level security;

create policy "cyberdesk_tenant_invoices_select_member_or_admin"
  on "public"."cyberdesk_tenant_invoices" as permissive for select to authenticated
  using (
    is_admin() or is_super_admin()
    or exists (
      select 1 from public.staff_module_access sma
      where sma.tenant_id = cyberdesk_tenant_invoices.tenant_id and sma.user_id = auth.uid()
    )
  );
-- Pas de policy insert/update/delete pour authenticated : seul le webhook
-- Stripe (service_role, hors RLS) écrit dans cette table.

-- ══════════════════════════════════════════════════════════════════════
-- 2. RATTACHEMENT staff_module_access -> TENANT
-- ══════════════════════════════════════════════════════════════════════

alter table "public"."staff_module_access"
  add column if not exists "tenant_id" uuid references public.cyberdesk_tenants(id) on delete set null;

create index if not exists staff_module_access_tenant_id_idx
  on public.staff_module_access (tenant_id);

comment on column public.staff_module_access.tenant_id
  is 'Tenant facturé pour cet accès module (nullable). NULL = accès accordé hors facturation SaaS (comportement historique inchangé, ex. les accès accordés avant ce module) — has_module_access() ne bloque jamais un accès à tenant_id NULL.';

-- Les lignes existantes gardent tenant_id = NULL (comportement inchangé).
-- Le rattachement du client actuel au premier tenant créé est une
-- correction de donnée ponctuelle faite à la main après cette migration,
-- pas un changement de schéma.

-- ══════════════════════════════════════════════════════════════════════
-- 3. SYNCHRONISATION FACTURES -> payments (même patron que
--    sync_cybervictim_payment, migration 008)
-- ══════════════════════════════════════════════════════════════════════

create or replace function public.sync_cyberdesk_tenant_invoice()
returns trigger language plpgsql security definer set search_path to 'public' as $function$
begin
  insert into public.payments (
    module, source_type, source_id, provider, stripe_session_id,
    amount_ht, amount_ttc, status, paid_at, created_by
  )
  select
    'cyberdesk', 'tenant_subscription_invoice', new.id, 'stripe', new.stripe_invoice_id,
    new.amount_ht, new.amount_ttc,
    case new.status when 'paye' then 'paye' when 'echoue' then 'en_attente' else new.status end,
    new.paid_at, t.created_by
  from public.cyberdesk_tenants t where t.id = new.tenant_id
  on conflict (module, source_type, source_id) do update set
    stripe_session_id = excluded.stripe_session_id,
    amount_ttc         = excluded.amount_ttc,
    status              = excluded.status,
    paid_at             = excluded.paid_at,
    updated_at          = now();
  return new;
end;
$function$;

-- Fonction trigger : aucune invocation directe possible (PostgreSQL
-- refuse tout appel hors mécanisme de trigger), pas de grant EXECUTE à
-- ajouter — même hygiène que sync_cybervictim_payment (corrigée en 013).
revoke all on function public.sync_cyberdesk_tenant_invoice() from public, anon, authenticated;

drop trigger if exists trg_sync_cyberdesk_tenant_invoice on public.cyberdesk_tenant_invoices;
create trigger trg_sync_cyberdesk_tenant_invoice
  after insert or update of status, amount_ttc, paid_at
  on public.cyberdesk_tenant_invoices
  for each row execute function public.sync_cyberdesk_tenant_invoice();

-- payments.stripe_session_id stocke ici l'id de facture Stripe (préfixe
-- in_..., jamais cs_... comme les sessions Checkout existantes) — aucune
-- collision possible avec l'index unique payments_stripe_session_id_idx.

-- ══════════════════════════════════════════════════════════════════════
-- 4. GATE D'ACCÈS — has_module_access() étendue à l'état d'abonnement
-- ══════════════════════════════════════════════════════════════════════

create or replace function public.has_module_access(p_module text)
returns boolean language sql stable security definer set search_path to 'public'
as $function$
  select
    coalesce(is_super_admin(), false)
    or exists (
      select 1 from public.staff_module_access sma
      left join public.cyberdesk_tenants t on t.id = sma.tenant_id
      where sma.user_id = auth.uid() and sma.module = p_module
        and (sma.tenant_id is null or t.subscription_status not in ('canceled','unpaid'))
    );
$function$;

-- Point de vigilance déjà rencontré 3 fois sur ce projet (migrations
-- 012, 013, 014) : `revoke all ... from public` seul ne retire PAS un
-- grant EXECUTE déjà accordé à anon — il faut le lister explicitement.
revoke all on function public.has_module_access(text) from public, anon;
grant execute on function public.has_module_access(text) to authenticated;

-- ══════════════════════════════════════════════════════════════════════
-- 5. REPORTING (même patron que migration 010 — SECURITY DEFINER,
--    jamais une nouvelle policy RLS large)
-- ══════════════════════════════════════════════════════════════════════

create or replace function public.cyberdesk_reporting_tenants()
returns table (
  id                    uuid,
  name                  text,
  subscription_status   text,
  stripe_price_id       text,
  trial_ends_at         timestamptz,
  current_period_end    timestamptz,
  member_count          bigint,
  created_at            timestamptz
)
language sql stable security definer set search_path to 'public' as $function$
  select t.id, t.name, t.subscription_status, t.stripe_price_id, t.trial_ends_at, t.current_period_end,
    (select count(*) from public.staff_module_access sma where sma.tenant_id = t.id),
    t.created_at
  from public.cyberdesk_tenants t
  where is_admin() or is_super_admin();
$function$;

revoke all on function public.cyberdesk_reporting_tenants() from public, anon;
grant execute on function public.cyberdesk_reporting_tenants() to authenticated;

-- Utilisée côté client (Paramétrage + message de blocage index.html) pour
-- qu'un utilisateur standard connaisse le statut de SON tenant, sans accès
-- à la liste globale (réservée aux admins par cyberdesk_reporting_tenants).
create or replace function public.cyberdesk_my_tenant_status()
returns table (
  subscription_status  text,
  trial_ends_at        timestamptz,
  current_period_end   timestamptz
)
language sql stable security definer set search_path to 'public' as $function$
  select t.subscription_status, t.trial_ends_at, t.current_period_end
  from public.staff_module_access sma
  join public.cyberdesk_tenants t on t.id = sma.tenant_id
  where sma.user_id = auth.uid() and sma.module = 'cyberdesk'
  limit 1;
$function$;

revoke all on function public.cyberdesk_my_tenant_status() from public, anon;
grant execute on function public.cyberdesk_my_tenant_status() to authenticated;
