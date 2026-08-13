-- ==========================================================================
-- CyberDesk — Coefficient kilométrique + forfait de déplacement PAR AGENT.
--
-- Remplace le réglage global unique porté par cyberdesk_travel_fee_settings
-- (migrations 016_travel_fee_coefficient_setting.sql / 019_travel_fee_
-- forfait_and_range.sql, committées sur main mais jamais appliquées en
-- base — vérifié via information_schema.columns avant d'écrire cette
-- migration : la table n'existe pas côté Supabase). Décision produit :
-- chaque agent facture son propre barème IK, pas un barème unique fixé
-- par un admin.
--
-- cyberdesk_travel_fee_settings n'est donc jamais créée : ces deux
-- migrations restent dans l'historique git (jamais réécrire une migration
-- déjà committée) mais deviennent lettre morte — documenté dans
-- CLAUDE.md, pas supprimé.
--
-- Choix d'implémentation : nouvelles colonnes sur cyberdesk_user_settings
-- plutôt qu'une table dédiée — même patron que bank_iban/bank_account_
-- holder (016_cyberdesk_bank_info.sql/020 renumérotée), RLS déjà en place
-- (cyberdesk_user_settings_write_own : chaque agent modifie sa propre
-- ligne librement, pas de garde admin — cohérent avec "vraiment par
-- agent").
--
-- L'adresse de départ du calcul IK devient elle aussi celle de l'agent
-- (cyberdesk_user_settings.billing_address, colonne existante depuis
-- 009_settings_dpo_reviews.sql), à la place de l'adresse fixe S@FE —
-- voir cyberdesk-compute-travel-fee, mis à jour dans le même lot.
-- ==========================================================================

alter table "public"."cyberdesk_user_settings"
  add column if not exists "travel_fee_coefficient_eur_km" numeric(4,2) not null default 0.51
    check (travel_fee_coefficient_eur_km between 0.50 and 0.79),
  add column if not exists "travel_fee_forfait_eur" numeric(6,2) not null default 10
    check (travel_fee_forfait_eur in (10, 15));

comment on column public.cyberdesk_user_settings.travel_fee_coefficient_eur_km
  is 'Coefficient €/km du barème kilométrique propre à cet agent (0,50-0,79) — utilisé par cyberdesk-compute-travel-fee pour ses propres devis, modifiable librement par l''agent lui-même (Paramétrage → Profil → Facturation).';
comment on column public.cyberdesk_user_settings.travel_fee_forfait_eur
  is 'Forfait de base du déplacement propre à cet agent (10€ ou 15€) — utilisé par cyberdesk-compute-travel-fee pour ses propres devis.';
