-- ==========================================================================
-- CyberDesk — Bordereau mensuel de commission (partenaires).
--
-- Synthétise cyberdesk_commission_ledger (022/023) en UN document PDF par
-- agent par mois calendaire, généré automatiquement (pg_cron, même patron
-- que cyberdesk_run_purge() / 008_cyberdesk_on_safecrm.sql). Document de
-- calcul et de contrôle uniquement — ne modifie JAMAIS
-- cyberdesk_commission_ledger.status (toujours piloté à la main par un
-- admin via cyberdesk_update_commission_status, 023) ; reprend TOUTES les
-- lignes du mois quel que soit leur statut, pas seulement les lignes en
-- attente.
--
-- Distinct du bordereau de remboursement des frais de déplacement promis
-- par l'Annexe "Frais de déplacement" (Article 3, piste Mandataire) : ce
-- second bordereau reste hors périmètre ici (voir CLAUDE.md, section
-- Commissionnement partenaire, pour ses prérequis non encore réunis).
--
-- Additive uniquement.
-- ==========================================================================


-- ══════════════════════════════════════════════════════════════════════
-- 1. TABLE — un bordereau par (bénéficiaire, période)
-- ══════════════════════════════════════════════════════════════════════

create table "public"."cyberdesk_commission_bordereaux" (
  "id"                    uuid primary key default gen_random_uuid(),
  "beneficiary_user_id"   uuid not null references auth.users(id) on delete cascade,
  "period"                text not null check (period ~ '^\d{4}-(0[1-9]|1[0-2])$'),
  "remuneration_status"   text not null check (remuneration_status in ('mandataire','associe_sep')),
  "line_count"            integer not null,
  "total_amount_due"      numeric(10,2) not null,
  "regime_tva_snapshot"   text,
  "total_tva"             numeric(10,2),
  "total_ttc"             numeric(10,2),
  "display_reference"     text not null,
  "file_path"             text not null,
  "generation_warning"    text,
  "created_at"            timestamp with time zone not null default now(),
  unique ("beneficiary_user_id", "period")
);

create index cyberdesk_commission_bordereaux_beneficiary_idx
  on public.cyberdesk_commission_bordereaux (beneficiary_user_id);

alter table "public"."cyberdesk_commission_bordereaux" enable row level security;

create policy "cyberdesk_commission_bordereaux_select_own_or_admin"
  on "public"."cyberdesk_commission_bordereaux" as permissive for select to authenticated
  using (beneficiary_user_id = auth.uid() or is_admin() or is_super_admin());
-- Pas de policy insert/update/delete pour authenticated : écriture
-- exclusivement via le service_role de l'Edge Function
-- cyberdesk-generate-commission-bordereaux (même patron que
-- cyberdesk_commission_ledger, 023).

comment on table public.cyberdesk_commission_bordereaux
  is 'Un bordereau PDF par agent par mois calendaire, récapitulant cyberdesk_commission_ledger sur la période — document de calcul et de contrôle, jamais une facture, ne mute jamais cyberdesk_commission_ledger.status. Généré par cyberdesk-generate-commission-bordereaux (cron mensuel), jamais par le client.';


-- ══════════════════════════════════════════════════════════════════════
-- 2. LIEN LEDGER → BORDEREAU
-- ══════════════════════════════════════════════════════════════════════

alter table "public"."cyberdesk_commission_ledger"
  add column if not exists "bordereau_id" uuid references public.cyberdesk_commission_bordereaux(id);

create index if not exists cyberdesk_commission_ledger_bordereau_idx
  on public.cyberdesk_commission_ledger (bordereau_id);


-- ══════════════════════════════════════════════════════════════════════
-- 3. STOCKAGE — bucket privé, un dossier par bénéficiaire
-- ══════════════════════════════════════════════════════════════════════

insert into storage.buckets (id, name, public)
values ('cyberdesk-commission-bordereaux', 'cyberdesk-commission-bordereaux', false)
on conflict (id) do nothing;

-- Lecture seule pour authenticated, scopée par dossier propriétaire
-- ((storage.foldername(name))[1] = auth.uid()::text) — délibérément plus
-- stricte que la policy existante sur cyberdesk-avatars (009), qui n'est
-- scopée que par has_module_access() et laisse n'importe quel utilisateur
-- du module lire/écrire l'avatar de n'importe quel autre. Écriture
-- réservée au service_role (aucune policy insert/update/delete ici).
drop policy if exists "cyberdesk_commission_bordereaux_select_own_or_admin" on storage.objects;
create policy "cyberdesk_commission_bordereaux_select_own_or_admin"
  on storage.objects as permissive for select to authenticated
  using (
    bucket_id = 'cyberdesk-commission-bordereaux'
    and ((storage.foldername(name))[1] = auth.uid()::text or is_admin() or is_super_admin())
  );


-- ══════════════════════════════════════════════════════════════════════
-- 4. CRON — génération mensuelle (même patron que cyberdesk_run_purge(),
--    008_cyberdesk_on_safecrm.sql)
-- ══════════════════════════════════════════════════════════════════════

-- Étape manuelle requise après cette migration :
--   select vault.create_secret('<valeur aléatoire>', 'cyberdesk_bordereau_cron_secret');
-- puis créer le secret Edge Function BORDEREAU_CRON_SECRET (Dashboard,
-- même valeur) avant le premier déclenchement du cron.

create or replace function public.cyberdesk_run_generate_commission_bordereaux()
returns void language plpgsql security definer set search_path to 'public' as $function$
declare v_secret text;
begin
  select decrypted_secret into v_secret from vault.decrypted_secrets where name = 'cyberdesk_bordereau_cron_secret';
  perform net.http_post(
    url := 'https://bgkijldrmdhklkadkeua.supabase.co/functions/v1/cyberdesk-generate-commission-bordereaux',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-bordereau-secret', v_secret),
    body := '{}'::jsonb
  );
end;
$function$;

revoke execute on function public.cyberdesk_run_generate_commission_bordereaux() from public, anon, authenticated;

select cron.unschedule('cyberdesk-generate-commission-bordereaux')
where exists (select 1 from cron.job where jobname = 'cyberdesk-generate-commission-bordereaux');

-- 1er de chaque mois à 3h (après la purge RGPD de 2h) : génère le
-- bordereau du mois calendaire précédent, calculé côté Edge Function.
select cron.schedule('cyberdesk-generate-commission-bordereaux', '0 3 1 * *',
  $$select public.cyberdesk_run_generate_commission_bordereaux()$$);


-- ══════════════════════════════════════════════════════════════════════
-- 5. RPC — reporting (même patron que cyberdesk_reporting_commission, 023)
-- ══════════════════════════════════════════════════════════════════════

create function public.cyberdesk_reporting_commission_bordereaux(p_user_id uuid default null)
returns table (
  id                    uuid,
  period                text,
  remuneration_status   text,
  line_count            integer,
  total_amount_due      numeric,
  total_tva             numeric,
  total_ttc             numeric,
  display_reference     text,
  file_path             text,
  generation_warning    text,
  created_at            timestamp with time zone
)
language sql stable security definer set search_path to 'public' as $function$
  select b.id, b.period, b.remuneration_status, b.line_count, b.total_amount_due,
         b.total_tva, b.total_ttc, b.display_reference, b.file_path, b.generation_warning, b.created_at
  from public.cyberdesk_commission_bordereaux b
  where public.has_module_access('cyberdesk')
    and case
      when is_admin() or is_super_admin() then (p_user_id is null or b.beneficiary_user_id = p_user_id)
      else b.beneficiary_user_id = auth.uid()
    end
  order by b.period desc;
$function$;

-- Sur ce projet, `revoke ... from public` seul ne suffit pas : anon a un
-- accès EXECUTE direct par défaut sur les fonctions nouvellement créées
-- (constaté en 012/017) — toujours lister anon explicitement.
revoke all on function public.cyberdesk_reporting_commission_bordereaux(uuid) from public, anon;
grant execute on function public.cyberdesk_reporting_commission_bordereaux(uuid) to authenticated;
