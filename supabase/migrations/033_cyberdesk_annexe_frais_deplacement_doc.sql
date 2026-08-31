-- ==========================================================================
-- CyberDesk — Autorise le nouveau document "annexe_frais_deplacement" (piste
-- Mandataire) dans cyberdesk_partner_contracts.
--
-- Ajout du 4e document de la piste Mandataire (_shared/partner-contract-
-- content.ts / assets/js/partner-contract-content.js) : sans cette
-- migration, toute tentative de signature de cette annexe échoue en
-- silence à l'insertion (violation des deux CHECK ci-dessous), constatée
-- via cyberdesk_partner_contracts_doc_matches_status_check et
-- cyberdesk_partner_contracts_document_key_check (contraintes d'origine,
-- migration créant cyberdesk_partner_contracts).
--
-- Piste Associé SEP non concernée (hors périmètre, décision actée) :
-- son unique document reste sep_statuts.
-- ==========================================================================

alter table "public"."cyberdesk_partner_contracts"
  drop constraint "cyberdesk_partner_contracts_document_key_check";

alter table "public"."cyberdesk_partner_contracts"
  add constraint "cyberdesk_partner_contracts_document_key_check"
    check (document_key = any (array['nda'::text, 'dpa'::text, 'clause_sous_traitance'::text, 'annexe_frais_deplacement'::text, 'sep_statuts'::text]));

alter table "public"."cyberdesk_partner_contracts"
  drop constraint "cyberdesk_partner_contracts_doc_matches_status_check";

alter table "public"."cyberdesk_partner_contracts"
  add constraint "cyberdesk_partner_contracts_doc_matches_status_check"
    check (
      ((remuneration_status = 'mandataire'::text) and (document_key = any (array['nda'::text, 'dpa'::text, 'clause_sous_traitance'::text, 'annexe_frais_deplacement'::text])))
      or ((remuneration_status = 'associe_sep'::text) and (document_key = 'sep_statuts'::text))
    );
