-- ==========================================================================
-- CyberDesk — Modèle de données du tunnel d'onboarding partenaire.
--
-- 1. Identité + champs spécifiques à la piste "Associé SEP" sur
--    cyberdesk_user_settings — même patron additif que bank_iban/
--    bank_account_holder (020) et travel_fee_* (024) : RLS déjà en place
--    (cyberdesk_user_settings_write_own), aucun changement de policy requis.
--
--    first_name/last_name sont dupliqués ici plutôt que lus depuis
--    auth.users.raw_user_meta_data : ce champ est générique à tout le
--    projet partagé (Vente + CyberDesk), pas garanti renseigné pour un
--    compte créé à la main par un admin (flux d'onboarding actuel, voir
--    CLAUDE.md § Facturation SaaS des tenants) — même raisonnement que
--    "jamais une extension de profiles" déjà appliqué à cette table (009).
--
-- 2. cyberdesk_partner_contracts (022) passe d'"une ligne = un contrat" à
--    "une ligne = un document signé" (document_key) : la piste Mandataire
--    fait signer 3 documents distincts (NDA, DPA, Clause de sous-traitance),
--    la piste Associé SEP en fait signer 1 (Statuts SEP, dont l'article 11
--    couvre déjà secret professionnel/RGPD pour cette piste — décision
--    produit actée, pas de NDA/DPA/Clause redondants pour les associés).
--    Reste append-only et écrit exclusivement par cyberdesk-verify-signature
--    (service_role) — aucun changement de policy requis, seulement le
--    schéma et une contrainte croisée document_key ↔ remuneration_status.
--
-- Additive uniquement (table vide à ce jour, vérifié : 0 ligne dans
-- cyberdesk_partner_contracts — jamais utilisée en conditions réelles,
-- gate toujours désactivé).
-- ==========================================================================


-- ══════════════════════════════════════════════════════════════════════
-- 1. IDENTITÉ + CHAMPS PISTE "ASSOCIÉ SEP"
-- ══════════════════════════════════════════════════════════════════════

alter table "public"."cyberdesk_user_settings"
  add column if not exists "first_name" text,
  add column if not exists "last_name" text,
  add column if not exists "casier_judiciaire_atteste_at" timestamp with time zone,
  add column if not exists "chosen_remuneration_status" text
    check (chosen_remuneration_status is null or chosen_remuneration_status in ('mandataire', 'associe_sep')),
  add column if not exists "sep_structure_nom" text,
  add column if not exists "sep_structure_forme_juridique" text,
  add column if not exists "sep_structure_siret" text,
  add column if not exists "sep_structure_adresse" text,
  add column if not exists "sep_taux_apurement_pct" numeric(4,1)
    check (sep_taux_apurement_pct is null or sep_taux_apurement_pct between 10 and 30);

comment on column public.cyberdesk_user_settings.casier_judiciaire_atteste_at
  is 'Date de l''attestation sur l''honneur "bulletin n°3 vierge" cochée par le candidat lors du tunnel d''onboarding — aucun fichier téléversé (décision produit : éviter un traitement de donnée judiciaire côté Supabase). Le justificatif physique reste vérifié manuellement par un admin, hors app.';
comment on column public.cyberdesk_user_settings.chosen_remuneration_status
  is 'Piste choisie par le candidat à l''étape 2 du tunnel d''onboarding (avant signature) — permet de reprendre le tunnel là où il a été laissé (ex. NDA signé, DPA restant) sans redemander le choix de statut. Distinct de cyberdesk_partner_contracts.remuneration_status qui n''existe qu''une fois un document effectivement signé.';
comment on column public.cyberdesk_user_settings.sep_taux_apurement_pct
  is 'Taux d''apurement du droit d''entrée choisi par le Directeur d''Agence (Statuts SEP, Article 9.3.1) — 10 à 30 % de sa quote-part de 80 %. Pertinent uniquement piste Associé SEP.';


-- ══════════════════════════════════════════════════════════════════════
-- 2. cyberdesk_partner_contracts — un document signé par ligne
-- ══════════════════════════════════════════════════════════════════════

alter table "public"."cyberdesk_partner_contracts"
  add column if not exists "document_key" text;

update public.cyberdesk_partner_contracts set document_key = 'legacy' where document_key is null;
-- Table vide à ce jour (vérifié) : la ligne ci-dessus est un filet de
-- sécurité, pas une vraie migration de données.

alter table "public"."cyberdesk_partner_contracts"
  alter column "document_key" set not null;

alter table "public"."cyberdesk_partner_contracts"
  drop constraint if exists "cyberdesk_partner_contracts_document_key_check";
alter table "public"."cyberdesk_partner_contracts"
  add constraint "cyberdesk_partner_contracts_document_key_check"
  check (document_key in ('nda', 'dpa', 'clause_sous_traitance', 'sep_statuts'));

alter table "public"."cyberdesk_partner_contracts"
  drop constraint if exists "cyberdesk_partner_contracts_doc_matches_status_check";
alter table "public"."cyberdesk_partner_contracts"
  add constraint "cyberdesk_partner_contracts_doc_matches_status_check"
  check (
    (remuneration_status = 'mandataire' and document_key in ('nda', 'dpa', 'clause_sous_traitance'))
    or
    (remuneration_status = 'associe_sep' and document_key = 'sep_statuts')
  );

create index if not exists cyberdesk_partner_contracts_user_doc_idx
  on public.cyberdesk_partner_contracts (user_id, document_key, signed_at desc);

comment on table public.cyberdesk_partner_contracts
  is 'Historique append-only des signatures de documents partenaire — une ligne par document signé (document_key), plusieurs lignes par utilisateur pour la piste Mandataire (NDA + DPA + Clause de sous-traitance). Écrit uniquement par cyberdesk-verify-signature (service_role, après vérification OTP) — jamais par le client directement, pour préserver la valeur probante de la signature.';
comment on column public.cyberdesk_partner_contracts.document_key
  is 'Document signé par cette ligne : nda/dpa/clause_sous_traitance (piste mandataire) ou sep_statuts (piste associe_sep, document unique).';
