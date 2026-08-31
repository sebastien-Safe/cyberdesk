-- ==========================================================================
-- CyberDesk — Source unique de vérité tarifaire entre le devis Kanban et le
-- document CGS généré depuis "Suivi d'intervention".
--
-- Constat : quote_amount_ht (021) ne persiste qu'un HT plat — send-
-- cybervictim-quote reçoit déjà l'objet `devis` complet (lines, remise,
-- prix_initial, tva, ttc — voir victimes17-quote.js `_quoteBuildDevisObject`)
-- mais n'en garde que le total HT. generate-cybervictim-quote se retrouvait
-- donc contraint de recalculer une TVA à 20 % en dur et de n'afficher qu'un
-- total global, sans jamais pouvoir reproduire le détail ligne à ligne ni la
-- remise du PDF Kanban — et dégradait silencieusement à 0 € si aucun devis
-- n'avait encore été validé (même symptôme que le catalogue mort supprimé en
-- 025, déplacé sur un autre champ).
--
-- quote_breakdown fige donc l'objet `devis` tel quel (source déjà calculée
-- côté client par _quoteComputeHt()/_quoteBuildDevisObject), écrit par
-- l'Edge Function (pas le client) juste avant la création de la session
-- Stripe — c'est cette ligne qui fait foi, pour le paiement comme pour le
-- document CGS. quote_total_ht/quote_total_ttc dupliquent à plat le HT/TTC
-- du breakdown pour un requêtage simple (reporting), sans repasser par le
-- jsonb. quote_amount_ht (021) n'est pas retiré : sync_cybervictim_payment()
-- continue de s'appuyer dessus pour payments.amount_ht, inchangé.
--
-- Migration additive uniquement.
-- ==========================================================================

alter table "public"."cybervictim_leads"
  add column if not exists "quote_breakdown" jsonb,
  add column if not exists "quote_total_ht" numeric(10,2),
  add column if not exists "quote_total_ttc" numeric(10,2),
  add column if not exists "quote_locked_at" timestamptz;

comment on column public.cybervictim_leads.quote_breakdown is
  'Capture exacte de l''objet `devis` composé côté client (victimes17-quote.js _quoteBuildDevisObject) — { prestation_label, lines[], ht, tva, ttc, remise, prix_initial, source, diagnostic_code, observations }. Écrit par send-cybervictim-quote (service_role) avant la création de la session Stripe, jamais par le client directement — source unique de vérité tarifaire pour le paiement Stripe ET le document CGS généré par generate-cybervictim-quote.';

comment on column public.cybervictim_leads.quote_total_ht is
  'Copie à plat de quote_breakdown.ht — pour requêtage/reporting simple sans parser le jsonb.';

comment on column public.cybervictim_leads.quote_total_ttc is
  'Copie à plat de quote_breakdown.ttc — c''est ce montant, une fois écrit, qui est utilisé tel quel pour le montant de la session Stripe Checkout (pas de second calcul).';

comment on column public.cybervictim_leads.quote_locked_at is
  'Horodatage de verrouillage du devis par send-cybervictim-quote — un devis renvoyé au client réécrit ces colonnes (dernier devis validé fait foi), journalisé dans audit_logs (action quote_breakdown_locked) à chaque verrouillage.';
