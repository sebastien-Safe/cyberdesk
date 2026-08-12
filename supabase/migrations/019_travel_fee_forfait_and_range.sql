-- ==========================================================================
-- CyberDesk — Ajuste le modèle de frais de déplacement (migration 016) :
-- montant = forfait (bas/haut, au choix du conseiller à chaque devis) +
-- distance_km × coefficient_eur_km. Auparavant, seul le coefficient
-- existait (pas de forfait de base).
--
-- Ne modifie pas la migration 016 (déjà commitée) — additive uniquement,
-- même discipline que les migrations correctives 012/013/014.
-- ==========================================================================

alter table "public"."cyberdesk_travel_fee_settings"
  add column if not exists "forfait_bas_eur"  numeric(6,2) not null default 10 check (forfait_bas_eur >= 0),
  add column if not exists "forfait_haut_eur" numeric(6,2) not null default 15 check (forfait_haut_eur >= 0);

comment on column public.cyberdesk_travel_fee_settings.forfait_bas_eur
  is 'Forfait de base « bas » du déplacement (€), au choix du conseiller à chaque devis — voir forfait_haut_eur.';
comment on column public.cyberdesk_travel_fee_settings.forfait_haut_eur
  is 'Forfait de base « haut » du déplacement (€), au choix du conseiller à chaque devis — voir forfait_bas_eur.';

-- Le coefficient €/km n'était borné qu'à >= 0 (migration 016) ; resserré
-- à la plage usuelle du barème kilométrique professionnel (0,50-0,70 €/km).
alter table "public"."cyberdesk_travel_fee_settings"
  drop constraint if exists "cyberdesk_travel_fee_settings_coefficient_eur_km_check";
alter table "public"."cyberdesk_travel_fee_settings"
  add constraint "cyberdesk_travel_fee_settings_coefficient_eur_km_check"
  check (coefficient_eur_km between 0.5 and 0.7);

alter table "public"."cyberdesk_travel_fee_settings"
  alter column "coefficient_eur_km" set default 0.51;

-- Réaligne la ligne unique déjà seedée (migration 016, coefficient 1 —
-- hors de la nouvelle plage autorisée) sur le nouveau défaut. Sans risque
-- : ni cette table ni les Edge Functions qui en dépendent n'ont encore
-- été déployées en production (voir Feuille de route, CLAUDE.md).
update "public"."cyberdesk_travel_fee_settings" set coefficient_eur_km = 0.51 where coefficient_eur_km = 1;
