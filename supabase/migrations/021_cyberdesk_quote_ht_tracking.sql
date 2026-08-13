-- ==========================================================================
-- CyberDesk — Persistance du CA HT du devis jusqu'au paiement.
--
-- Constat : payments.amount_ht existe dans le schéma (008) mais n'a jamais
-- été alimenté — seul amount_ttc survit du devis composé côté client
-- (victimes17-quote.js) jusqu'au paiement encaissé. Sans ça, "x% du CA HT"
-- (rémunération partenaires) n'a pas de base fiable.
--
-- send-cybervictim-quote persiste désormais devis.ht sur
-- cybervictim_leads.quote_amount_ht au moment de l'envoi du devis (le
-- montant Stripe collecté est exactement celui du devis composé, donc ce
-- HT reste valable jusqu'au paiement — pas de recalcul nécessaire côté
-- webhook). sync_cybervictim_payment() le propage dans payments.amount_ht,
-- même patron que sync_cyberdesk_tenant_invoice (015).
--
-- Limite assumée : un paiement manuel (sans devis composé via ce flux)
-- n'aura pas de quote_amount_ht → payments.amount_ht restera NULL pour ce
-- paiement. Documenté comme cas à traiter manuellement si besoin.
--
-- Migration additive uniquement — 008 et 010 non modifiées, leurs fonctions
-- sont recréées ici (create or replace).
-- ==========================================================================

alter table "public"."cybervictim_leads"
  add column if not exists "quote_amount_ht" numeric(10,2);

comment on column public.cybervictim_leads.quote_amount_ht
  is 'Montant HT du devis composé côté client (victimes17-quote.js), persisté par send-cybervictim-quote au moment de l''envoi — propagé dans payments.amount_ht par sync_cybervictim_payment().';


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
    updated_at          = now();
  return new;
end;
$function$;


-- create or replace ne peut pas changer la signature de retour (colonnes
-- OUT) d'une fonction existante — il faut la supprimer avant de la recréer.
drop function if exists public.cyberdesk_reporting_payments(uuid);

create function public.cyberdesk_reporting_payments(p_user_id uuid default null)
returns table (
  period       timestamp with time zone,
  status       text,
  amount_ht    numeric,
  amount_ttc   numeric,
  created_by   uuid
)
language sql stable security definer set search_path to 'public' as $function$
  select date_trunc('month', coalesce(p.paid_at, p.created_at)) as period, p.status, p.amount_ht, p.amount_ttc, p.created_by
  from public.payments p
  where p.module = 'cyberdesk'
    and public.has_module_access('cyberdesk')
    and case
      when is_admin() or is_super_admin() then (p_user_id is null or p.created_by = p_user_id)
      else p.created_by = auth.uid()
    end;
$function$;

revoke all on function public.cyberdesk_reporting_payments(uuid) from public, anon;
grant execute on function public.cyberdesk_reporting_payments(uuid) to authenticated;
