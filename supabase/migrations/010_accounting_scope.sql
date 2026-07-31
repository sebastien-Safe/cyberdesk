-- ==========================================================================
-- CyberDesk — Cloisonnement de la modale Comptable par utilisateur.
--
-- Contexte : la RLS de cybervictim_leads/payments/cybervictim_reviews reste
-- volontairement large (has_module_access('cyberdesk') pour les dossiers,
-- admin-only pour payments) — on ne la modifie pas ici, ça casserait le
-- Kanban partagé et le reporting admin existant de Vente sur payments.
--
-- Pour la modale Comptable, un utilisateur standard ne doit voir que SES
-- propres résultats (dossiers où created_by = auth.uid()), un admin voit
-- soit la vue globale soit celle d'un utilisateur choisi. Ce cloisonnement
-- est fait par des fonctions SECURITY DEFINER dédiées au reporting, dont la
-- clause WHERE fait elle-même l'arbitrage — pas une nouvelle policy RLS sur
-- les tables (qui s'appliquerait aussi au Kanban).
--
-- Ne recrée PAS : profiles, contacts, audit_logs, is_admin()/is_super_admin(),
-- has_module_access() (déjà en place). Additive uniquement.
-- ==========================================================================

create or replace function public.cyberdesk_reporting_leads(p_user_id uuid default null)
returns table (
  id                   uuid,
  pipeline_stage       text,
  created_at           timestamp with time zone,
  paid_at              timestamp with time zone,
  closed_at            timestamp with time zone,
  report_generated_at  timestamp with time zone,
  amount_paid_ttc      numeric,
  payment_status       text,
  source               text,
  attack_type          text,
  created_by           uuid
)
language sql stable security definer set search_path to 'public' as $function$
  select l.id, l.pipeline_stage, l.created_at, l.paid_at, l.closed_at, l.report_generated_at,
         l.amount_paid_ttc, l.payment_status, l.source, l.attack_type, l.created_by
  from public.cybervictim_leads l
  where public.has_module_access('cyberdesk')
    and case
      when is_admin() or is_super_admin() then (p_user_id is null or l.created_by = p_user_id)
      else l.created_by = auth.uid()
    end;
$function$;

revoke all on function public.cyberdesk_reporting_leads(uuid) from public;
grant execute on function public.cyberdesk_reporting_leads(uuid) to authenticated;


create or replace function public.cyberdesk_reporting_payments(p_user_id uuid default null)
returns table (
  period       timestamp with time zone,
  status       text,
  amount_ttc   numeric,
  created_by   uuid
)
language sql stable security definer set search_path to 'public' as $function$
  select date_trunc('month', coalesce(p.paid_at, p.created_at)) as period, p.status, p.amount_ttc, p.created_by
  from public.payments p
  where p.module = 'cyberdesk'
    and public.has_module_access('cyberdesk')
    and case
      when is_admin() or is_super_admin() then (p_user_id is null or p.created_by = p_user_id)
      else p.created_by = auth.uid()
    end;
$function$;

revoke all on function public.cyberdesk_reporting_payments(uuid) from public;
grant execute on function public.cyberdesk_reporting_payments(uuid) to authenticated;


create or replace function public.cyberdesk_reporting_reviews(p_user_id uuid default null)
returns table (
  rating        smallint,
  comment       text,
  submitted_at  timestamp with time zone,
  created_by    uuid
)
language sql stable security definer set search_path to 'public' as $function$
  select r.rating, r.comment, r.submitted_at, l.created_by
  from public.cybervictim_reviews r
  join public.cybervictim_leads l on l.id = r.lead_id
  where r.submitted_at is not null
    and public.has_module_access('cyberdesk')
    and case
      when is_admin() or is_super_admin() then (p_user_id is null or l.created_by = p_user_id)
      else l.created_by = auth.uid()
    end;
$function$;

revoke all on function public.cyberdesk_reporting_reviews(uuid) from public;
grant execute on function public.cyberdesk_reporting_reviews(uuid) to authenticated;


-- Liste du staff cyberdesk pour le sélecteur "Vue d'un utilisateur en
-- particulier" — ne renvoie des lignes qu'à un appelant admin (la clause
-- is_admin()/is_super_admin() porte sur l'appelant, pas sur chaque ligne).
create or replace function public.cyberdesk_staff_list()
returns table (user_id uuid, email text)
language sql stable security definer set search_path to 'public' as $function$
  select u.id, u.email
  from auth.users u
  join public.staff_module_access sma on sma.user_id = u.id and sma.module = 'cyberdesk'
  where is_admin() or is_super_admin()
  order by u.email;
$function$;

revoke all on function public.cyberdesk_staff_list() from public;
grant execute on function public.cyberdesk_staff_list() to authenticated;
