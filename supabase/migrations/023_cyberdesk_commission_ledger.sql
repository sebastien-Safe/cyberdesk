-- ==========================================================================
-- CyberDesk — Ledger de commission (rémunération partenaires).
--
-- Une ligne par paiement de dossier victime encaissé, calculée
-- automatiquement (trigger sur payments) à partir du statut/taux signé du
-- propriétaire du dossier (cyberdesk_partner_contracts, 018) et du CA HT
-- (payments.amount_ht, alimenté depuis 017). Deux mécaniques :
--   - mandataire   : à_facturer → facturee → payee (facture collectée)
--   - associe_sep  : à_verser → verse (versement automatique, pas de facture)
--
-- Additive uniquement.
-- ==========================================================================


-- ══════════════════════════════════════════════════════════════════════
-- 1. TABLE
-- ══════════════════════════════════════════════════════════════════════

create table "public"."cyberdesk_commission_ledger" (
  "id"                    uuid primary key default gen_random_uuid(),
  "lead_id"               uuid not null references public.cybervictim_leads(id) on delete cascade,
  "payment_id"            uuid not null references public.payments(id) on delete cascade,
  "beneficiary_user_id"   uuid not null references auth.users(id),
  "remuneration_status"   text not null check (remuneration_status in ('mandataire','associe_sep')),
  "pct_applied"           numeric(5,2) not null,
  "amount_ht"             numeric(10,2) not null,
  "amount_due"            numeric(10,2) not null,
  "status"                text not null check (status in ('a_facturer','facturee','payee','a_verser','verse')),
  "invoice_reference"     text,
  "paid_at"               timestamp with time zone,
  "created_at"            timestamp with time zone not null default now(),
  "updated_at"            timestamp with time zone not null default now(),
  unique ("payment_id")
);

create index cyberdesk_commission_ledger_beneficiary_idx
  on public.cyberdesk_commission_ledger (beneficiary_user_id);

alter table "public"."cyberdesk_commission_ledger" enable row level security;

create policy "cyberdesk_commission_ledger_select_own_or_admin"
  on "public"."cyberdesk_commission_ledger" as permissive for select to authenticated
  using (beneficiary_user_id = auth.uid() or is_admin() or is_super_admin());
-- Pas de policy insert/update/delete pour authenticated : écriture
-- exclusivement via le trigger ci-dessous (insert) et
-- cyberdesk_update_commission_status (update, admin uniquement), tous deux
-- security definer.

comment on table public.cyberdesk_commission_ledger
  is 'Une ligne par paiement de dossier victime encaissé, calculée automatiquement depuis cyberdesk_partner_contracts (statut/taux signé du propriétaire du dossier) et payments.amount_ht. Alimentée uniquement par sync_cyberdesk_commission_ledger() (trigger) et cyberdesk_update_commission_status() (admin).';


-- ══════════════════════════════════════════════════════════════════════
-- 2. TRIGGER — calcul automatique à l'encaissement
-- ══════════════════════════════════════════════════════════════════════

create function public.sync_cyberdesk_commission_ledger()
returns trigger language plpgsql security definer set search_path to 'public' as $function$
declare
  v_created_by uuid;
  v_status text;
  v_pct numeric;
  v_ledger_status text;
begin
  -- Ne concerne que les paiements de dossiers victimes, pas les factures
  -- d'abonnement tenant (source_type = 'tenant_subscription_invoice', 015).
  if new.source_type <> 'cybervictim_lead' then
    return new;
  end if;

  -- Pas de CA HT connu (ex. paiement manuel sans devis composé, voir 017)
  -- → pas de ligne de commission automatique, à traiter manuellement.
  if new.amount_ht is null then
    return new;
  end if;

  select created_by into v_created_by
  from public.cybervictim_leads
  where id = new.source_id;

  if v_created_by is null then
    return new;
  end if;

  select remuneration_status, remuneration_pct into v_status, v_pct
  from public.cyberdesk_partner_contracts
  where user_id = v_created_by
  order by signed_at desc
  limit 1;

  -- Le propriétaire du dossier n'a jamais signé de contrat partenaire →
  -- pas de commission due.
  if v_status is null then
    return new;
  end if;

  v_ledger_status := case when v_status = 'mandataire' then 'a_facturer' else 'a_verser' end;

  insert into public.cyberdesk_commission_ledger (
    lead_id, payment_id, beneficiary_user_id, remuneration_status, pct_applied,
    amount_ht, amount_due, status
  )
  values (
    new.source_id, new.id, v_created_by, v_status, v_pct,
    new.amount_ht, round(new.amount_ht * v_pct / 100, 2), v_ledger_status
  )
  on conflict (payment_id) do update set
    remuneration_status = excluded.remuneration_status,
    pct_applied         = excluded.pct_applied,
    amount_ht            = excluded.amount_ht,
    amount_due            = excluded.amount_due,
    updated_at             = now();
  -- Ne touche jamais `status` en cas de re-sync : ne doit pas écraser une
  -- progression déjà faite par un admin (facturee/payee/verse).

  return new;
end;
$function$;

drop trigger if exists trg_sync_cyberdesk_commission_ledger on public.payments;
create trigger trg_sync_cyberdesk_commission_ledger
  after insert or update of status, amount_ht
  on public.payments
  for each row
  when (new.module = 'cyberdesk' and new.status = 'paye')
  execute function public.sync_cyberdesk_commission_ledger();

-- Trigger SECURITY DEFINER (returns trigger), jamais destiné à être appelé
-- directement (PostgreSQL refuse toute invocation hors trigger — risque nul
-- en pratique) — revoke par hygiène, même pattern que sync_cybervictim_payment
-- (013_fix_sync_payment_grants.sql).
revoke all on function public.sync_cyberdesk_commission_ledger() from public, anon, authenticated;


-- ══════════════════════════════════════════════════════════════════════
-- 3. RPC — reporting (même patron que cyberdesk_reporting_payments, 010/017)
-- ══════════════════════════════════════════════════════════════════════

create function public.cyberdesk_reporting_commission(p_user_id uuid default null)
returns table (
  id                    uuid,
  lead_id               uuid,
  beneficiary_user_id   uuid,
  remuneration_status   text,
  pct_applied           numeric,
  amount_ht             numeric,
  amount_due            numeric,
  status                text,
  invoice_reference     text,
  paid_at               timestamp with time zone,
  created_at            timestamp with time zone
)
language sql stable security definer set search_path to 'public' as $function$
  select l.id, l.lead_id, l.beneficiary_user_id, l.remuneration_status, l.pct_applied,
         l.amount_ht, l.amount_due, l.status, l.invoice_reference, l.paid_at, l.created_at
  from public.cyberdesk_commission_ledger l
  where public.has_module_access('cyberdesk')
    and case
      when is_admin() or is_super_admin() then (p_user_id is null or l.beneficiary_user_id = p_user_id)
      else l.beneficiary_user_id = auth.uid()
    end;
$function$;

revoke all on function public.cyberdesk_reporting_commission(uuid) from public, anon;
grant execute on function public.cyberdesk_reporting_commission(uuid) to authenticated;


-- ══════════════════════════════════════════════════════════════════════
-- 4. RPC ADMIN — progression de statut (à facturer→facturée→payée / à verser→versé)
-- ══════════════════════════════════════════════════════════════════════

create function public.cyberdesk_update_commission_status(
  p_id uuid,
  p_status text,
  p_invoice_reference text default null
)
returns void
language plpgsql security definer set search_path to 'public' as $function$
declare
  v_row public.cyberdesk_commission_ledger;
  v_valid text[];
begin
  if not (is_admin() or is_super_admin()) then
    raise exception 'forbidden';
  end if;

  select * into v_row from public.cyberdesk_commission_ledger where id = p_id;
  if not found then
    raise exception 'not_found';
  end if;

  v_valid := case when v_row.remuneration_status = 'mandataire'
    then array['a_facturer','facturee','payee']
    else array['a_verser','verse']
  end;

  if not (p_status = any(v_valid)) then
    raise exception 'invalid_status_for_type';
  end if;

  update public.cyberdesk_commission_ledger
  set status             = p_status,
      invoice_reference  = coalesce(p_invoice_reference, invoice_reference),
      paid_at            = case when p_status in ('payee','verse') then now() else paid_at end,
      updated_at         = now()
  where id = p_id;
end;
$function$;

revoke all on function public.cyberdesk_update_commission_status(uuid, text, text) from public, anon;
grant execute on function public.cyberdesk_update_commission_status(uuid, text, text) to authenticated;
