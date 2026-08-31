-- ==========================================================================
-- CyberDesk — Régime de TVA déclaré par l'agent (franchise en base / réel).
--
-- Préparatoire au futur module de règlement agent (bordereau mensuel des
-- frais de déplacement, cf. Annexe "Frais de déplacement" du tunnel
-- d'onboarding partenaire) : le bordereau devra afficher 0% ou 20% de TVA
-- selon le régime fiscal propre à chaque agent — non déductible d'un champ
-- existant. tva_number (009_settings_dpo_reviews.sql) n'indique qu'un
-- numéro de TVA intracommunautaire à afficher, jamais un régime.
--
-- Pas de valeur par défaut : une valeur erronée par défaut (0% appliqué à
-- un agent en réel, ou l'inverse) est une erreur de facturation, pas un
-- inconvénient mineur — mieux vaut NULL tant que l'agent n'a pas déclaré
-- son régime explicitement. Le module de bordereau (non encore développé)
-- devra bloquer ou alerter sur toute génération pour un agent sans valeur
-- renseignée.
--
-- Même patron que travel_fee_coefficient_eur_km/travel_fee_forfait_eur
-- (024_cyberdesk_travel_fee_per_agent.sql) : colonne sur
-- cyberdesk_user_settings, pas de table dédiée, RLS déjà en place
-- (cyberdesk_user_settings_write_own — l'agent modifie sa propre ligne).
-- ==========================================================================

alter table "public"."cyberdesk_user_settings"
  add column if not exists "regime_tva" text
    check (regime_tva in ('franchise_base', 'reel'));

comment on column public.cyberdesk_user_settings.regime_tva
  is 'Régime de TVA déclaré par l''agent pour sa propre facturation à S@FE (franchise_base = art. 293 B CGI, 0% ; reel = TVA collectée à 20%) — NULL tant que non renseigné. Modifiable librement par l''agent lui-même (Paramétrage → Profil → Facturation), même patron que le barème kilométrique. À consommer par le futur module de bordereau des frais de déplacement, jamais par le devis client (sans rapport).';
