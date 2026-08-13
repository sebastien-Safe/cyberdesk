-- ==========================================================================
-- CyberDesk — Suppression du catalogue produits mort (cybervictim_products)
--
-- Constat : cette table (un prix forfaitaire par grand type d'alerte
-- 17Cyber, 9 codes) n'a jamais été peuplée en production (0 ligne,
-- vérifié). Le flux de devis réellement utilisé (bouton 📋 sur une carte
-- Kanban → modale 3 étapes victimes17-quote.js → Edge Function
-- send-cybervictim-quote) est déjà entièrement piloté par
-- assets/data/tarifs-cyberdesk.json et ne l'a jamais lue.
--
-- Les deux seuls autres lecteurs (generate-cybervictim-quote,
-- generate-cybervictim-report — déclenchés depuis la modale "Suivi
-- d'intervention") se dégradaient déjà silencieusement (prix à 0 €,
-- libellés vides) faute de données — ils sont rebranchés dans le même
-- lot de commits sur cybervictim_leads.attack_type/quote_amount_ht et sur
-- une petite copie serveur de tarifs-cyberdesk.json
-- (supabase/functions/_shared/product-texts.ts), plutôt que sur ce
-- catalogue séparé. Objectif : une seule référence tarifaire éditée à la
-- main.
--
-- Aucune vue, trigger ou fonction ne référence cybervictim_products ou
-- cybervictim_leads.product_id ailleurs dans les migrations (vérifié :
-- sync_cybervictim_payment, v_payments_reporting, cyberdesk_reporting_*
-- n'y touchent pas) — suppression sans impact sur le reste du schéma.
-- ==========================================================================

-- Supprimer d'abord la colonne fait tomber automatiquement sa contrainte
-- FK et son index (cybervictim_leads_product_id_idx) ; la table n'a alors
-- plus aucun dépendant.
alter table "public"."cybervictim_leads" drop column if exists "product_id";

drop table if exists "public"."cybervictim_products";
