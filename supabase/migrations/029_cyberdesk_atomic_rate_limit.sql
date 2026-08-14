-- ==========================================================================
-- CyberDesk — Correctif : incrémentation atomique du compteur rate_limits.
--
-- cyberdesk-send-audit-email/index.ts (checkRateLimit()) lisait `count` par
-- un SELECT puis l'écrivait par un UPDATE séparé (deux allers-retours).
-- Sous une rafale de requêtes concurrentes sur cet endpoint public (aucun
-- compte visiteur), plusieurs requêtes peuvent lire la même valeur avant
-- que l'une d'elles n'écrive : le compteur sous-compte les appels et la
-- limite de 30/heure peut être dépassée.
--
-- Correctif : la logique lecture-vérification-incrémentation est déplacée
-- dans une fonction SQL security definer qui fait tout en une seule
-- instruction INSERT ... ON CONFLICT DO UPDATE ... RETURNING — le verrou de
-- ligne pris par cette instruction sérialise les appels concurrents,
-- contrairement à un SELECT puis UPDATE séparés.
--
-- rate_limits existait déjà en production, RLS activée avec ses propres
-- policies (partagée avec au moins un autre module du projet — une policy
-- rate_limits_read existante indexe déjà des lignes par auth.uid() dans
-- action, signe d'un usage par ailleurs) : create table if not exists et le
-- enable row level security ci-dessous sont des no-op défensifs, ils ne
-- créent ni ne modifient rien ici, et ne touchent à aucune policy
-- existante.
--
-- Réservée à service_role (revoke explicite de public/anon/authenticated,
-- cf. piège documenté dans CLAUDE.md : un revoke non explicite sur anon
-- laisse l'EXECUTE en place) : aucune vérification d'appartenance n'est
-- faite à l'intérieur de la fonction sur p_action, elle ne doit donc
-- jamais être appelable par un utilisateur authentifié (qui pourrait sinon
-- épuiser/manipuler le budget d'une action arbitraire).
-- ==========================================================================

create table if not exists "public"."rate_limits" (
  "action"    text primary key,
  "count"     integer not null default 0,
  "window_at" timestamp with time zone not null default now()
);

alter table "public"."rate_limits" enable row level security;
-- Aucune policy : accédée uniquement via cyberdesk_check_rate_limit()
-- (security definer) et le client service_role des Edge Functions, qui
-- contournent RLS par nature — pas d'accès authenticated/anon voulu ici.

create or replace function public.cyberdesk_check_rate_limit(
  p_action text,
  p_max integer,
  p_window_ms bigint
)
returns boolean
language plpgsql security definer set search_path to 'public' as $function$
declare
  v_count integer;
  v_now timestamptz := now();
  v_window interval := (p_window_ms::text || ' milliseconds')::interval;
begin
  insert into public.rate_limits (action, count, window_at)
  values (p_action, 1, v_now)
  on conflict (action) do update set
    count = case
      when public.rate_limits.window_at < v_now - v_window then 1
      else public.rate_limits.count + 1
    end,
    window_at = case
      when public.rate_limits.window_at < v_now - v_window then v_now
      else public.rate_limits.window_at
    end
  returning count into v_count;

  return v_count <= p_max;
end;
$function$;

revoke all on function public.cyberdesk_check_rate_limit(text, integer, bigint) from public, anon, authenticated;
grant execute on function public.cyberdesk_check_rate_limit(text, integer, bigint) to service_role;

comment on function public.cyberdesk_check_rate_limit(text, integer, bigint)
  is 'Vérifie et incrémente atomiquement un compteur de rate_limits (fenêtre glissante par action). Réservée à service_role — voir cyberdesk-send-audit-email pour l''appelant actuel.';
