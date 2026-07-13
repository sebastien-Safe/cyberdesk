-- Migration 005 : envoi devis par e-mail (Brevo) + paiement en ligne (Stripe Checkout)

alter table "public"."cybervictim_leads"
  add column if not exists "quote_sent_at"        timestamp with time zone,
  add column if not exists "stripe_session_id"     text,
  add column if not exists "stripe_checkout_url"   text,
  add column if not exists "payment_status"        text
    default 'non_initie'
    check (payment_status in ('non_initie','en_attente','paye','expire','annule')),
  add column if not exists "paid_at"               timestamp with time zone,
  add column if not exists "amount_paid_ttc"       numeric(10,2);

create unique index if not exists cybervictim_leads_stripe_session_id_idx
  on public.cybervictim_leads (stripe_session_id)
  where stripe_session_id is not null;

comment on column public.cybervictim_leads.quote_sent_at
  is 'Horodatage envoi du devis par e-mail (Brevo) — distinct de quote_generated_at (téléchargement local)';
comment on column public.cybervictim_leads.payment_status
  is 'Statut du paiement Stripe Checkout — mis à jour par le webhook stripe-webhook';
