-- ==========================================================================
-- CyberDesk — Coordonnées bancaires dans la fiche profil.
--
-- Même patron que billing_name/siret/tva_number (009_settings_dpo_reviews.sql) :
-- colonnes ajoutées à cyberdesk_user_settings, couvertes par les policies RLS
-- existantes (select own-or-admin, write own) — aucun changement RLS requis.
-- ==========================================================================

alter table "public"."cyberdesk_user_settings"
  add column if not exists "bank_iban" text,
  add column if not exists "bank_account_holder" text;
