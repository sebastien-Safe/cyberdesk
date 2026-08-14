-- ==========================================================================
-- CyberDesk — Correctif : les triggers de synchronisation paiement/commission
-- ne propageaient jamais le changement de propriétaire d'un dossier
-- (réattribution, migration 011), et sync_cybervictim_payment() ne se
-- redéclenchait pas quand seul quote_amount_ht (021) était modifié après
-- coup.
--
-- Bug 1 — sync_cybervictim_payment() (008, recréée par 021) : la clause
-- ON CONFLICT DO UPDATE SET omettait created_by. Après réattribution d'un
-- dossier (A → B) puis un resync quelconque (ex. correction du montant),
-- payments.created_by restait bloqué sur A — le paiement devenait invisible
-- dans le dashboard Comptable (cyberdesk_reporting_payments, 021, qui
-- filtre directement sur payments.created_by) pour le nouveau propriétaire
-- B, alors que le dossier apparaît bien dans son Kanban. Bug déjà actif en
-- production (indépendant de contract_gate/commission).
--
-- Bug 2 — le trigger trg_sync_cybervictim_payment ne surveillait que
-- (payment_status, amount_paid_ttc, paid_at, stripe_session_id). Une
-- réattribution (created_by) ou une correction de quote_amount_ht après le
-- premier passage du trigger ne le redéclenchait donc jamais.
--
-- Bug 3 — sync_cyberdesk_commission_ledger() (023) : même défaut, sur
-- beneficiary_user_id. Dormant tant que contract_gate est désactivé et les
-- taux à 0 %, mais réel dès activation (voir CLAUDE.md, Onboarding
-- partenaire).
--
-- Bug 4 — trg_sync_cyberdesk_commission_ledger (sur payments) ne surveillait
-- que (status, amount_ht) : même en corrigeant le bug 1/2, le nouveau
-- created_by propagé dans payments ne redéclenchait pas le recalcul de la
-- ligne de commission. Ajout de created_by à la liste surveillée.
--
-- Migration additive : recrée les deux fonctions (create or replace) et
-- les deux triggers (drop + create, seule façon de changer la liste de
-- colonnes surveillées d'un trigger), puis backfill ponctuel des lignes
-- déjà désynchronisées par une réattribution passée.
-- ==========================================================================


-- ══════════════════════════════════════════════════════════════════════
-- 1. sync_cybervictim_payment() — ajout de created_by au SET
-- ══════════════════════════════════════════════════════════════════════

create or replace function public.sync_cybervictim_payment()
returns trigger language plpgsql security definer set search_path to 'public' as $function$
begin
  insert into public.payments (
    module, source_type, source_id, provider, stripe_session_id,
    amount_ht, amount_ttc, status, paid_at, created_by
  )
  values (
    'cyberdesk', 'cybervictim_lead', new.id,
    case when new.stripe_session_id is not null then 'stripe' else 'manuel' end,
    new.stripe_session_id,
    new.quote_amount_ht,
    coalesce(new.amount_paid_ttc, 0),
    coalesce(new.payment_status, 'non_initie'),
    new.paid_at,
    new.created_by
  )
  on conflict (module, source_type, source_id) do update set
    provider           = excluded.provider,
    stripe_session_id  = excluded.stripe_session_id,
    amount_ht          = excluded.amount_ht,
    amount_ttc         = excluded.amount_ttc,
    status              = excluded.status,
    paid_at             = excluded.paid_at,
    created_by           = excluded.created_by,
    updated_at            = now();
  return new;
end;
$function$;

revoke all on function public.sync_cybervictim_payment() from public, anon;

drop trigger if exists trg_sync_cybervictim_payment on public.cybervictim_leads;
create trigger trg_sync_cybervictim_payment
  after insert or update of
    payment_status, amount_paid_ttc, paid_at, stripe_session_id,
    quote_amount_ht, created_by
  on public.cybervictim_leads
  for each row execute function public.sync_cybervictim_payment();


-- ══════════════════════════════════════════════════════════════════════
-- 2. sync_cyberdesk_commission_ledger() — ajout de beneficiary_user_id au SET
-- ══════════════════════════════════════════════════════════════════════

create or replace function public.sync_cyberdesk_commission_ledger()
returns trigger language plpgsql security definer set search_path to 'public' as $function$
declare
  v_created_by uuid;
  v_status text;
  v_pct numeric;
  v_ledger_status text;
begin
  if new.source_type <> 'cybervictim_lead' then
    return new;
  end if;

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
    beneficiary_user_id  = excluded.beneficiary_user_id,
    remuneration_status  = excluded.remuneration_status,
    pct_applied           = excluded.pct_applied,
    amount_ht              = excluded.amount_ht,
    amount_due              = excluded.amount_due,
    updated_at                = now();
  -- Ne touche toujours pas `status` en cas de re-sync : ne doit pas écraser
  -- une progression déjà faite par un admin (facturee/payee/verse).

  return new;
end;
$function$;

revoke all on function public.sync_cyberdesk_commission_ledger() from public, anon;

drop trigger if exists trg_sync_cyberdesk_commission_ledger on public.payments;
create trigger trg_sync_cyberdesk_commission_ledger
  after insert or update of status, amount_ht, created_by
  on public.payments
  for each row
  when (new.module = 'cyberdesk' and new.status = 'paye')
  execute function public.sync_cyberdesk_commission_ledger();


-- ══════════════════════════════════════════════════════════════════════
-- 3. BACKFILL — rattrape les lignes déjà désynchronisées par une
--    réattribution passée (avant ce correctif)
-- ══════════════════════════════════════════════════════════════════════

update public.payments p
set created_by = l.created_by,
    updated_at = now()
from public.cybervictim_leads l
where p.module = 'cyberdesk'
  and p.source_type = 'cybervictim_lead'
  and p.source_id = l.id
  and p.created_by is distinct from l.created_by;

update public.cyberdesk_commission_ledger cl
set beneficiary_user_id = l.created_by,
    updated_at = now()
from public.cybervictim_leads l
where cl.lead_id = l.id
  and l.created_by is not null
  and cl.beneficiary_user_id is distinct from l.created_by;
