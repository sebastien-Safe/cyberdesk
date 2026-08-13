-- ==========================================================================
-- CyberDesk — Statut contractuel (Mandataire / Associé SEP) et signature
-- électronique lors de l'intégration.
--
-- Réplique le mécanisme "signature qualifiée" déjà utilisé côté Vente
-- (mandats/mandat_otp/send-mandat-otp : signature SVG + OTP e-mail + hash +
-- horodatage/IP/user-agent) mais avec des tables/fonctions propres à
-- CyberDesk — jamais en touchant au schéma Vente (interdit, et le code de
-- ces Edge Functions vit dans le dépôt safe-crm en lecture seule).
--
-- Choix de conception important : remuneration_status/remuneration_pct ne
-- sont PAS des colonnes librement éditables par le client (contrairement à
-- billing_name/siret/... sur cyberdesk_user_settings) — elles sont dérivées
-- de la dernière ligne de cyberdesk_partner_contracts, alimentée
-- exclusivement par l'Edge Function cyberdesk-verify-signature (service_role,
-- après vérification OTP). Sinon la "signature" n'aurait aucune valeur
-- probante : n'importe quel utilisateur pourrait s'attribuer un statut/taux
-- sans jamais passer par la signature. Le collaborateur "modifie" donc bien
-- son statut lui-même — mais en repassant par le parcours de signature à
-- chaque changement.
--
-- Additive uniquement. Ne recrée pas has_module_access()/is_admin()/
-- is_super_admin() (déjà en place, migrations 008/015).
-- ==========================================================================


-- ══════════════════════════════════════════════════════════════════════
-- 1. BARÈME PAR STATUT — admin-éditable
-- ══════════════════════════════════════════════════════════════════════

create table "public"."cyberdesk_remuneration_rates" (
  "status"      text primary key check (status in ('mandataire','associe_sep')),
  "pct"         numeric(5,2) not null default 0,
  "updated_at"  timestamp with time zone not null default now()
);

-- pct=0 par défaut — à définir par un admin (section Comptable) avant
-- d'activer le parcours de signature en conditions réelles.
insert into public.cyberdesk_remuneration_rates (status) values ('mandataire'), ('associe_sep')
  on conflict (status) do nothing;

alter table "public"."cyberdesk_remuneration_rates" enable row level security;

create policy "cyberdesk_remuneration_rates_select"
  on "public"."cyberdesk_remuneration_rates" as permissive for select to authenticated
  using (public.has_module_access('cyberdesk'));

create policy "cyberdesk_remuneration_rates_admin_write"
  on "public"."cyberdesk_remuneration_rates" as permissive for all to authenticated
  using (is_admin() or is_super_admin())
  with check (is_admin() or is_super_admin());


-- ══════════════════════════════════════════════════════════════════════
-- 2. OTP DE SIGNATURE — écriture/lecture service_role uniquement
-- ══════════════════════════════════════════════════════════════════════

create table "public"."cyberdesk_signature_otp" (
  "id"          uuid primary key default gen_random_uuid(),
  "user_id"     uuid not null references auth.users(id) on delete cascade,
  "code"        text not null,
  "contexte"    text not null default 'contrat_partenaire',
  "expires_at"  timestamp with time zone not null,
  "used"        boolean not null default false,
  "created_at"  timestamp with time zone not null default now()
);

create index cyberdesk_signature_otp_user_id_idx on public.cyberdesk_signature_otp (user_id);

alter table "public"."cyberdesk_signature_otp" enable row level security;
-- Aucune policy authenticated/anon : lecture/écriture exclusivement via
-- service_role (Edge Functions cyberdesk-send-signature-otp /
-- cyberdesk-verify-signature), même logique que l'absence de policy anon
-- sur cybervictim_reviews (009).


-- ══════════════════════════════════════════════════════════════════════
-- 3. CONTRATS SIGNÉS — append-only, service_role uniquement en écriture
-- ══════════════════════════════════════════════════════════════════════

create table "public"."cyberdesk_partner_contracts" (
  "id"                   uuid primary key default gen_random_uuid(),
  "user_id"              uuid not null references auth.users(id) on delete cascade,
  "remuneration_status"  text not null check (remuneration_status in ('mandataire','associe_sep')),
  "remuneration_pct"     numeric(5,2) not null,
  "doc_version"          text not null,
  "doc_hash"             text not null,
  "signature_svg"        text not null,
  "signed_at"            timestamp with time zone not null default now(),
  "signed_ip"            text,
  "signed_user_agent"    text,
  "created_at"           timestamp with time zone not null default now()
);

create index cyberdesk_partner_contracts_user_signed_idx
  on public.cyberdesk_partner_contracts (user_id, signed_at desc);

alter table "public"."cyberdesk_partner_contracts" enable row level security;

create policy "cyberdesk_partner_contracts_select_own_or_admin"
  on "public"."cyberdesk_partner_contracts" as permissive for select to authenticated
  using (user_id = auth.uid() or is_admin() or is_super_admin());
-- Pas de policy insert/update/delete pour authenticated : écriture
-- exclusivement via service_role (cyberdesk-verify-signature) — la dernière
-- ligne (order by signed_at desc) fait foi pour le statut/taux courant.

comment on table public.cyberdesk_partner_contracts
  is 'Historique append-only des signatures de contrat partenaire (Mandataire/Associé SEP). Écrit uniquement par cyberdesk-verify-signature (service_role, après vérification OTP) — jamais par le client directement, pour préserver la valeur probante de la signature.';


-- ══════════════════════════════════════════════════════════════════════
-- 4. FEATURE FLAG — bascule du blocage d'accès (voir Phase 4 / index.html)
-- ══════════════════════════════════════════════════════════════════════

create table "public"."cyberdesk_feature_flags" (
  "key"         text primary key,
  "enabled"     boolean not null default false,
  "updated_at"  timestamp with time zone not null default now()
);

-- Désactivé par défaut — activé manuellement par un admin (section
-- Comptable) une fois le parcours de signature testé de bout en bout.
insert into public.cyberdesk_feature_flags (key, enabled) values ('contract_gate', false)
  on conflict (key) do nothing;

alter table "public"."cyberdesk_feature_flags" enable row level security;

create policy "cyberdesk_feature_flags_select"
  on "public"."cyberdesk_feature_flags" as permissive for select to authenticated
  using (public.has_module_access('cyberdesk'));

create policy "cyberdesk_feature_flags_admin_write"
  on "public"."cyberdesk_feature_flags" as permissive for all to authenticated
  using (is_admin() or is_super_admin())
  with check (is_admin() or is_super_admin());


-- ══════════════════════════════════════════════════════════════════════
-- 5. RPC — statut contractuel courant de l'appelant
-- ══════════════════════════════════════════════════════════════════════

create function public.cyberdesk_my_contract_status()
returns table (
  remuneration_status  text,
  remuneration_pct     numeric,
  doc_version          text,
  signed_at            timestamp with time zone,
  gate_enabled         boolean
)
language sql stable security definer set search_path to 'public' as $function$
  select
    c.remuneration_status,
    c.remuneration_pct,
    c.doc_version,
    c.signed_at,
    coalesce((select enabled from public.cyberdesk_feature_flags where key = 'contract_gate'), false) as gate_enabled
  from (select 1) as _dummy
  left join lateral (
    select remuneration_status, remuneration_pct, doc_version, signed_at
    from public.cyberdesk_partner_contracts
    where user_id = auth.uid()
    order by signed_at desc
    limit 1
  ) c on true;
$function$;

-- Sur ce projet, `revoke ... from public` seul ne suffit pas : anon a un
-- accès EXECUTE direct par défaut sur les fonctions nouvellement créées
-- (constaté en 017, déjà corrigé une fois en 012 pour d'autres fonctions
-- de reporting) — toujours lister anon explicitement.
revoke all on function public.cyberdesk_my_contract_status() from public, anon;
grant execute on function public.cyberdesk_my_contract_status() to authenticated;
