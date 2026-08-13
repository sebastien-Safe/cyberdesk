-- ==========================================================================
-- CyberDesk — RPC de statut du tunnel d'onboarding partenaire.
--
-- Remplace cyberdesk_my_contract_status() (022) : ce dernier ne rendait
-- compte que d'UN contrat signé (ancien modèle "une ligne = un statut
-- complet"). Le tunnel multi-étapes (026) doit pouvoir reprendre là où le
-- candidat l'a laissé (identité déjà saisie ? statut déjà choisi ? quels
-- documents déjà signés parmi ceux de sa piste ?) — d'où une RPC plus
-- large, à un seul appel, plutôt qu'une série de petites requêtes RLS
-- éparpillées côté client.
--
-- Retourne toujours exactement une ligne (LEFT JOIN depuis une ligne
-- fictive) même si l'utilisateur n'a encore aucune ligne dans
-- cyberdesk_user_settings (première connexion, jamais ouvert Paramétrage)
-- — même précaution que cyberdesk_my_contract_status() à l'origine.
--
-- signed_documents : dernière signature par document_key (pas tout
-- l'historique append-only) — c'est au client de comparer doc_version à
-- la version courante connue (assets/js/partner-contract-content.js),
-- pour ne jamais figer un numéro de version dans une migration.
--
-- Additive uniquement. Ne recrée pas les tables (026).
-- ==========================================================================

drop function if exists public.cyberdesk_my_contract_status();

create function public.cyberdesk_my_onboarding_status()
returns table (
  chosen_remuneration_status     text,
  first_name                     text,
  last_name                      text,
  billing_name                   text,
  siret                          text,
  billing_address                text,
  casier_judiciaire_atteste_at   timestamp with time zone,
  sep_structure_nom              text,
  sep_structure_forme_juridique  text,
  sep_structure_siret            text,
  sep_structure_adresse          text,
  sep_taux_apurement_pct         numeric,
  gate_enabled                   boolean,
  signed_documents               jsonb
)
language sql stable security definer set search_path to 'public' as $function$
  select
    s.chosen_remuneration_status,
    s.first_name, s.last_name, s.billing_name, s.siret, s.billing_address,
    s.casier_judiciaire_atteste_at,
    s.sep_structure_nom, s.sep_structure_forme_juridique, s.sep_structure_siret,
    s.sep_structure_adresse, s.sep_taux_apurement_pct,
    coalesce(flag.enabled, false) as gate_enabled,
    coalesce(docs.signed_documents, '[]'::jsonb) as signed_documents
  from (select 1) as _dummy
  left join public.cyberdesk_user_settings s on s.user_id = auth.uid()
  left join lateral (
    select enabled from public.cyberdesk_feature_flags where key = 'contract_gate'
  ) flag on true
  left join lateral (
    select jsonb_agg(jsonb_build_object(
      'document_key', dd.document_key, 'doc_version', dd.doc_version, 'signed_at', dd.signed_at
    )) as signed_documents
    from (
      select distinct on (document_key) document_key, doc_version, signed_at
      from public.cyberdesk_partner_contracts
      where user_id = auth.uid()
      order by document_key, signed_at desc
    ) dd
  ) docs on true;
$function$;

-- Sur ce projet, `revoke ... from public` seul ne suffit pas : anon a un
-- accès EXECUTE direct par défaut sur les fonctions nouvellement créées
-- (constaté en 012/017) — toujours lister anon explicitement.
revoke all on function public.cyberdesk_my_onboarding_status() from public, anon;
grant execute on function public.cyberdesk_my_onboarding_status() to authenticated;
