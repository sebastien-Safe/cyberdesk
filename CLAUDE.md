# CLAUDE.md — CyberDesk

Ce fichier est destiné à Claude Code. Il décrit l'architecture,
les conventions et les décisions techniques du projet CyberDesk.
Lis-le intégralement avant toute action.

## Ce qu'est CyberDesk

CyberDesk est une plateforme SaaS de gestion d'incidents cyber,
extraite du CRM safecrm (sebastien-Safe/safecrm).

Elle permet à des prestataires cyber, assureurs, avocats et
collectivités de gérer des dossiers de victimes cyber :
- Kanban de suivi des dossiers (pipeline 17Cyber)
- Arbre de tâches dynamique par type d'incident
- Génération de devis et rapports DOCX
- Module d'audit cybersécurité B2B (checklist, incidents, plan d'action)
- Quiz de diagnostic public (lead-gen)
- Espace client (à venir)
- Qualification IA des incidents (Anthropic Claude)

Le produit est destiné à être revendu en SaaS multi-tenant
(abonnement mensuel) avec option white-label.

## Origine du code

Ce dépôt est une extraction propre du module Cyber de safecrm.
Le dépôt source (sebastien-Safe/safecrm) est en lecture seule —
ne jamais le modifier.

Les fichiers extraits ont été nettoyés de toute dépendance
au CRM parent. Toute référence à safecrm dans le code est
un bug à corriger.

**Important — le "module Cyber" de safecrm n'était pas un bloc
autonome.** Il s'agissait de deux sous-systèmes distincts, chacun
avec ses propres dépendances au cœur de safecrm :

1. **Pipeline victimes17** (`victimes17.js`) — Kanban de dossiers
   individuels (tables `cybervictim_leads` / `cybervictim_products`).
   Autonome, c'est le cœur du produit CyberDesk.
2. **Module Cybersec Clients B2B** (`cyber-*.js`, `modules/Cyber/`) — audit
   de sécurité pour des clients existants. **Hors périmètre CyberDesk
   depuis la migration 008** : ce module a été réimplémenté nativement
   côté safe-crm/Vente (tables `cyber_client_profiles`, `cyber_client_audits`,
   `cyber_client_incidents`, `cyber_client_plan`, `cyber_audits`,
   référençant `contacts.id`, pas une table `clients` séparée). Le code
   sous `modules/Cyber/` dans ce dépôt n'est donc plus branché sur rien —
   à retirer ou reconnecter un jour si le besoin revient côté CyberDesk,
   mais **ne jamais créer de table `clients`/`cyber_client_*` ici**, ça
   collisionnerait avec le module natif de safe-crm.

Dépendances au cœur safecrm qui ont été **retirées** (non portées) :
- Le paiement Stripe (`create-checkout` / lien de paiement 17Cyber)
- Les alertes email d'incident (`send-crm-email`)
- Le système multi-connecteurs IA (`connectors-guard.js`, Edge
  Function `call-ia`, table `safe_connectors`) — remplacé par un
  appel direct à l'API Anthropic (voir plus bas)
- Le module NIS2 interne (`incidents-nis2.html`, table
  `incidents_nis2`) — outil de conformité interne à safecrm, hors
  périmètre CyberDesk

Fichiers ajoutés à l'extraction en cours de route (absents de la
liste initiale mais requis pour que le code fonctionne) :
`assets/js/task-tree.js`, `assets/victimes17/victimes17.css`,
`modules/Cyber/cyber-audit.js`, `modules/Cyber/cyber-clients.css`,
`mission-cyber.html` (quiz diagnostic public), et côté Edge
Functions : `_shared/product-texts.ts`, `_shared/docx-helpers.ts`,
`_shared/cgs-render.ts`, `_shared/cgs-content.ts`, `deno.json`,
`import_map.json`.

## Stack technique

| Couche | Technologie |
|---|---|
| Frontend | Vanilla JS, HTML statique, CSS custom |
| Backend | Supabase (PostgreSQL + Edge Functions Deno) |
| Auth | Supabase Auth (JWT) |
| Génération DOCX | lib `docx` via Edge Function Deno |
| IA | Anthropic Claude API (direct — pas de multi-connecteurs en v1) |
| Déploiement | Vercel (frontend) + Supabase (backend) |
| Paiement | Stripe Checkout, partagé avec Vente via `public.payments` (voir Cohabitation) |

## Projet Supabase

**Projet PARTAGÉ avec safe-crm** depuis la migration 008 (l'ancien projet
dédié `rxxciopqqqpsmyisxtcc`, Frankfurt, a été supprimé — plus aucune
donnée dessus).

- Project URL : https://bgkijldrmdhklkadkeua.supabase.co
- Project Ref : bgkijldrmdhklkadkeua
- Nom du projet : Safe-crm-V2
- Région : Paris (eu-west-3)
- Organisation : S@FE

Les credentials ne sont jamais committés dans le dépôt.
Utiliser les variables d'environnement définies dans .env.example.

⚠️ Ce projet contient aussi toutes les données de safe-crm (contacts,
ventes, autres modules `dpo_*`/`seo_*`/`social_*`/`cc_*`). Voir la section
**Cohabitation avec safe-crm** ci-dessous avant toute migration ou requête
qui ne serait pas strictement limitée aux tables `cybervictim_*`.

## Structure du dépôt

```
cyberdesk/
├── index.html                     ← point d'entrée principal (pipeline victimes17)
├── assets/
│   ├── victimes17/
│   │   ├── victimes17.js          ← Kanban dossiers victimes
│   │   ├── victimes17.css
│   │   └── victimes17-pdf.js      ← génération devis/rapport PDF client-side
│   ├── data/
│   │   └── task_trees.json        ← arbre de décision par type d'incident
│   ├── css/                       ← styles communs
│   └── js/
│       ├── supabase.client.js     ← client Supabase cyberdesk
│       ├── task-tree.js           ← composant arbre de tâches (Suivi d'intervention)
│       ├── settings.js            ← modale Paramétrage (fiche profil, 2FA, demande DPO)
│       └── accounting.js          ← modale Comptable (dashboard KPI, réservée admin)
├── modules/
│   └── Cyber/                     ← module audit B2B (sur table clients propre à CyberDesk)
│       ├── cyber-core.js          ← fonctions partagées, auth, score
│       ├── cyber-audit.js         ← checklist d'audit (23 points ANSSI/CIS)
│       ├── cyber-incidents.js     ← gestion des incidents B2B
│       ├── cyber-dashboard.js     ← tableau de bord
│       ├── cyber-assistant.js     ← assistant IA (Anthropic direct)
│       ├── cyber-plan.js          ← plan d'action correctif
│       ├── cyber-clients.css
│       └── module-cyber-clients.html
├── mission-cyber.html             ← quiz de diagnostic public (lead-gen)
├── avis-client.html               ← formulaire public d'avis client (lien à token, post-clôture)
├── abonnement-confirme.html       ← retour Stripe Checkout, abonnement SaaS tenant (succès)
├── abonnement-annule.html         ← retour Stripe Checkout, abonnement SaaS tenant (annulé)
├── supabase/
│   ├── functions/
│   │   ├── _shared/                        ← docx-helpers, product-texts, cgs-render, cgs-content, cors,
│   │   │                                     lead-access, travel-fee-config
│   │   ├── generate-cybervictim-report/
│   │   ├── generate-cybervictim-quote/
│   │   ├── send-cybervictim-quote/         ← envoi devis par email (Brevo) + lien Stripe
│   │   ├── cyberdesk-stripe-webhook/       ← webhook paiement dossier victime, met à jour
│   │   │                                     cybervictim_leads (nom préfixé cyberdesk- : le slug
│   │   │                                     "stripe-webhook" est déjà pris côté Vente)
│   │   ├── update-cybervictim-tasks/
│   │   ├── purge-cybervictim-data/
│   │   ├── cyber-ia-assistant/             ← appel direct Anthropic
│   │   ├── cyberdesk-send-audit-email/     ← résultats du quiz mission-cyber.html
│   │   │                                     (préfixé : "send-audit-email" déjà pris côté Vente,
│   │   │                                     probablement lié à cyber_audits)
│   │   ├── cyberdesk-forgot-password/      ← mot de passe oublié, envoi via Brevo
│   │   │                                     (contourne le service e-mail intégré Supabase,
│   │   │                                     quota par défaut trop bas — voir section dédiée)
│   │   ├── cyberdesk-dpo-request/          ← demande d'exercice de droits RGPD → email au DPO
│   │   ├── cyberdesk-send-review-request/  ← envoi du lien d'avis client à la clôture du dossier
│   │   ├── cyberdesk-submit-review/        ← soumission publique de l'avis (avis-client.html)
│   │   ├── cyberdesk-billing-webhook/      ← webhook Stripe, cycle de vie abonnement SaaS tenant
│   │   │                                     (endpoint + secret de signature distincts de
│   │   │                                     cyberdesk-stripe-webhook — voir section dédiée)
│   │   ├── cyberdesk-create-tenant-checkout/ ← admin : crée un tenant + lien Stripe Checkout
│   │   ├── cyberdesk-billing-portal/       ← lien portail client Stripe (self-service)
│   │   ├── cyberdesk-compute-travel-fee/   ← frais de déplacement (option O4 devis, itinéraire ORS)
│   │   ├── deno.json
│   │   └── import_map.json
│   └── migrations/
│       ├── 001_cyber_schema.sql … 007_appointment_booking.sql  ← historique projet dédié (supprimé)
│       ├── 008_cyberdesk_on_safecrm.sql   ← schema courant, sur le projet partagé safe-crm
│       ├── 009_settings_dpo_reviews.sql   ← fiche profil, demandes DPO, avis clients
│       ├── 010_accounting_scope.sql       ← fonctions de reporting cloisonné par utilisateur
│       ├── 011_cyberdesk_leads_ownership.sql ← Kanban cloisonné par créateur de dossier
│       ├── 012_fix_reporting_anon_grants.sql ← correctif grant anon (reporting 010)
│       ├── 013_fix_sync_payment_grants.sql   ← correctif grant anon (sync_cybervictim_payment)
│       ├── 014_fix_has_module_access_grants.sql ← correctif grant anon (has_module_access)
│       ├── 015_cyberdesk_tenant_billing.sql  ← facturation SaaS des tenants (voir section dédiée)
│       └── 016_travel_fee_coefficient_setting.sql ← coefficient barème kilométrique ajustable (voir section dédiée)
├── .env.example
├── CLAUDE.md                              ← ce fichier
└── README.md
```

## Base de données

### Tables principales

| Table | Rôle |
|---|---|
| `cybervictim_leads` | Dossiers victimes (table centrale du pipeline 17Cyber) — **propre à CyberDesk** |
| `cybervictim_products` | Catalogue produits/forfaits — **propre à CyberDesk** |
| `staff_module_access` | Droit d'accès par module pour les comptes internes (`user_id`, `module`, ex. `'cyberdesk'`) — **propre à CyberDesk, réutilisable par les autres modules** |
| `payments` | Paiements, source unique **partagée** avec Vente (`module` = `'cyberdesk'`/`'vente'`), alimentée par trigger depuis `cybervictim_leads` |
| `v_payments_reporting` | Vue de reporting agrégé sur `payments`, lue par le module admin Vente |
| `audit_logs` | Journal RGPD **partagé** avec safe-crm (table de safe-crm, pas de CyberDesk) — CyberDesk y écrit avec `module = 'CyberDesk'` |
| `cyberdesk_user_settings` | Fiche profil (facturation, contrat, photo) par utilisateur — **propre à CyberDesk**, jamais une extension de `profiles` (safe-crm) |
| `cyberdesk_dpo_requests` | Demandes d'exercice de droits RGPD — **propre à CyberDesk**, intake V1 (voir section dédiée) |
| `cybervictim_reviews` | Avis clients post-clôture (lien à token, soumission via Edge Function) — **propre à CyberDesk** |
| `cyberdesk_tenants` | Un tenant = un prestataire cyber payant un abonnement SaaS CyberDesk (statut, IDs Stripe) — **propre à CyberDesk**, voir section dédiée |
| `cyberdesk_tenant_invoices` | Détail des factures Stripe d'un tenant, alimente `payments` par trigger — **propre à CyberDesk** |
| `cyberdesk_travel_fee_settings` | Réglage à une seule ligne : coefficient €/km du barème kilométrique (option Déplacement du devis), ajustable par un admin — **propre à CyberDesk** |

Tables du module B2B (`clients`, `cyber_client_profiles`, `cyber_client_audits`,
`cyber_client_incidents`, `cyber_client_plan`, `cyber_audits`) : **hors
périmètre CyberDesk**, gérées nativement côté safe-crm/Vente avec un schéma
différent (`contact_id`, colonnes en français) — ne jamais les recréer ni
les modifier depuis une migration CyberDesk.

**Note sur `cybervictim_leads`/`cybervictim_products` :** ces tables
n'existaient dans aucune migration versionnée de safecrm (créées à la
main en production). Le schéma a été **reconstruit par déduction du code
JS**, pas copié depuis une source faisant autorité — vérifier avant mise
en production réelle.

### Champs importants sur cybervictim_leads

```sql
id UUID PRIMARY KEY
tenant_id UUID                    -- multi-tenant (à activer)
source TEXT DEFAULT '17cyber'     -- canal d'entrée du dossier
CHECK (source IN ('17cyber','formulaire_web','csv','email','api','manuel'))
client_token UUID                 -- accès espace client sans auth
client_token_expires_at TIMESTAMPTZ
created_at TIMESTAMPTZ
```

### Cloisonnement du Kanban par utilisateur

Depuis la migration `011_cyberdesk_leads_ownership.sql`, le Kanban
**n'est plus un espace partagé** : la policy `cyberdesk_leads_access` sur
`cybervictim_leads` restreint chaque utilisateur standard à ses propres
dossiers (`created_by = auth.uid()`) ; un admin (`is_admin()`/
`is_super_admin()`) continue de tout voir/modifier, y compris pour
réattribuer un dossier.

- `created_by` est renseigné automatiquement à la création par le trigger
  `trg_cybervictim_set_created_by` (jamais côté client) — aucun code
  applicatif ne doit l'écrire directement à l'insertion.
- **Dossiers antérieurs à cette migration** : `created_by` n'a jamais été
  renseigné avant, ils ont donc tous `created_by = NULL` — invisibles pour
  le staff standard, visibles uniquement par un admin jusqu'à
  réattribution manuelle.
- **Réattribution** : un admin éditant un dossier voit une barre
  "Propriétaire du dossier" dans la modale (`index.html` #vl-owner-bar,
  `victimes17.js` `_vlPopulateOwnerBar()`/`reassignLeadOwner()`), peuplée
  via la fonction `cyberdesk_staff_list()` (migration 010).
- **Edge Functions** : toutes celles qui agissent sur un `lead_id` précis
  via un client `service_role` (donc hors RLS) revérifient l'appartenance
  côté serveur via `_shared/lead-access.ts` (`canAccessLead()`) :
  `generate-cybervictim-quote`, `generate-cybervictim-report`,
  `update-cybervictim-tasks`, `cyber-ia-assistant`, `send-cybervictim-quote`,
  `cyberdesk-send-review-request`. Non concernées (pas de notion de
  propriétaire applicable) : `cyberdesk-stripe-webhook` (déclenchée par
  Stripe, aucun JWT utilisateur), `purge-cybervictim-data` (job RGPD
  s'appliquant à tous les dossiers éligibles, pas à un utilisateur),
  `cyberdesk-dpo-request`/`cyberdesk-submit-review` (pas liées à un
  `lead_id`).
- La modale Comptable (`cyberdesk_reporting_*`, migration 010) reste le
  bon endroit pour une vue agrégée/globale par un admin — le cloisonnement
  du Kanban ne la remplace pas, il s'agit de deux mécanismes
  complémentaires (RLS directe sur la table vs fonctions dédiées au
  reporting qui lisent aussi `payments`, RLS admin-only par ailleurs).

### Conventions SQL

- RLS activé sur toutes les tables — ne jamais désactiver
- Toujours utiliser `gen_random_uuid()` pour les UUID
- Toujours ajouter `created_at TIMESTAMPTZ DEFAULT now()`
- Les migrations sont numérotées : 001_, 002_, 003_...
- Une migration ne modifie jamais une migration précédente

### pg_cron

La purge RGPD automatique utilise pg_cron (job `cyberdesk-purge-rgpd`,
créé dans `008_cyberdesk_on_safecrm.sql`, appelle l'Edge Function
`purge-cybervictim-data` via `pg_net`). Le job tourne chaque nuit et
supprime/anonymise les dossiers au-delà de la durée de conservation
légale. `pg_cron`/`pg_net`/`pgcrypto` sont actifs sur le projet partagé
(vérifié).

## Cohabitation avec safe-crm

Depuis la migration `008_cyberdesk_on_safecrm.sql`, CyberDesk et le
module Vente de safe-crm partagent le même projet Supabase. Trois
principes structurent cette cohabitation :

**1. Connexions séparées, même `auth.users`.** Un compte qui peut se
connecter à Vente n'a pas accès à CyberDesk automatiquement, et
inversement. Le garde-fou est la fonction `has_module_access(p_module
text)` (SECURITY DEFINER), vraie si `is_super_admin()` ou si une ligne
existe dans `staff_module_access(user_id, module)`. `index.html` appelle
`hasCyberdeskAccess()` juste après toute session valide (login ou reprise
de session) et déconnecte si l'accès est refusé. `is_admin()` seul ne
suffit pas — l'accès à un module n'est jamais implicite. Ce mécanisme est
générique et destiné à être réutilisé pour les futurs modules loués
séparément (vision produit : louer chaque module — Paiement, CyberDesk,
Vente, DPO, SEO, Social... — indépendamment à des clients externes).
Voir aussi `client_module_settings` (déjà existante côté safe-crm),
prévue pour gérer l'activation d'un module et son branding pour un
client externe loueur — **écartée comme point d'accroche pour la
facturation SaaS des tenants** (voir section dédiée) après inspection de
son schéma réel : elle est indexée sur `contacts.id` (un contact Vente),
pas sur un compte `auth.users` qui se connecte à CyberDesk, et ne porte
aucune colonne de facturation. Reste un palier futur pour un usage
différent (louer un module à un client externe géré par Vente).

**2. Paiement : une source unique, deux vues.** La table `public.payments`
(polymorphe : `module`, `source_type`, `source_id`) est la seule source de
vérité, alimentée automatiquement par un trigger (`sync_cybervictim_payment`)
depuis `cybervictim_leads` — aucun changement dans la logique Stripe
existante (`cyberdesk-stripe-webhook`, `send-cybervictim-quote`) ni dans le
paiement manuel. L'espace client CyberDesk continue de lire
`cybervictim_leads` directement (jamais `payments`). Le rapport financier
admin de Vente lit `v_payments_reporting` (réservée à
`is_admin()`/`is_super_admin()`). Depuis la migration `015_cyberdesk_
tenant_billing.sql`, un second trigger (`sync_cyberdesk_tenant_invoice`)
alimente la même table depuis `cyberdesk_tenant_invoices` avec
`source_type = 'tenant_subscription_invoice'` — même patron, aucun
changement de structure ni côté Vente.

**Secrets Stripe/Brevo/Anthropic — deux espaces de stockage distincts, pas
de collision, mais attention à la valeur.** Vente utilise déjà des secrets
Edge Function classiques (`Deno.env.get(...)`) : `STRIPE_SECRET_KEY`,
`STRIPE_WEBHOOK_SECRET`, `ANTHROPIC_API_KEY`, `BREVO`. CyberDesk utilise le
Vault Postgres (`vault.create_secret` + `get_edge_secret()`), noms en
minuscules : `stripe_secret_key`, `stripe_webhook_secret`,
`stripe_billing_webhook_secret`, `stripe_price_id_cyberdesk`,
`brevo_api_key`, `anthropic_api_key`, `purge_secret` — namespace différent,
vérifié qu'aucun nom ne collisionne (seul `purge_alert_secret` existait déjà
dans le Vault, sans rapport). `stripe_secret_key` peut recevoir la **même
valeur** que le `STRIPE_SECRET_KEY` de Vente (même compte Stripe, cohérent
avec "un seul système de paiement" — y compris pour l'abonnement SaaS
tenant, voir section dédiée : pas de Stripe Connect, un seul compte
plateforme). En revanche `stripe_webhook_secret` **doit être une valeur
différente** : Stripe génère un secret de signature par endpoint webhook,
et `cyberdesk-stripe-webhook` est un endpoint distinct de celui de Vente —
le secret de Vente ne fonctionnera pas ici. Même règle entre
`stripe_webhook_secret` et `stripe_billing_webhook_secret` : deux endpoints
webhook CyberDesk distincts (paiement dossier victime vs. abonnement
tenant), donc deux secrets de signature distincts, jamais le même.
Quand Vente aura son propre flux de vente, il insérera dans `payments`
avec `module='vente'` — pas de nouvelle migration de structure nécessaire.

**3. RGPD : un seul journal.** `audit_logs` est une table de safe-crm,
pas de CyberDesk — ne jamais la recréer. CyberDesk y écrit avec
`module: "CyberDesk"` (`logRgpd()` dans `supabase.client.js`, appels
serveur dans les Edge Functions). Les policies RLS existantes de
safe-crm (`audit_insert_auth`, `audit_select_admin`, `audit_select_own`)
couvrent déjà tous les besoins de CyberDesk — ne rien ajouter dessus sauf
besoin nouveau vérifié.

**Ce qui reste hors périmètre CyberDesk** : le module d'audit sécurité
entreprise (`clients`, `cyber_client_*`, `cyber_audits`) est géré
nativement côté Vente, avec un schéma différent. Ne jamais y toucher
depuis une migration CyberDesk.

## Edge Functions

### Conventions Deno

- Runtime : Deno (pas Node.js)
- Imports : depuis deno.land/x ou esm.sh
- Secrets : via `Deno.env.get('NOM_SECRET')`
- Ne jamais hardcoder de credentials

### Secrets à configurer dans Supabase Dashboard
(Settings → Edge Functions → Secrets)

`SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` sont
**auto-injectées** par Supabase dans toutes les Edge Functions — ne pas
essayer de les créer manuellement (l'API Management refuse tout secret
préfixé `SUPABASE_`). Seuls ceux-ci sont à créer :
```
PURGE_SECRET
```
Secrets Vault (via `select vault.create_secret(valeur, nom)`, lus par
`public.get_edge_secret(name)`, réservé à `service_role`) — namespace
distinct des secrets Edge Function ci-dessus, voir section Cohabitation :
```
purge_secret
stripe_secret_key
stripe_webhook_secret            -- valeur propre à cyberdesk-stripe-webhook, pas celle de Vente
stripe_billing_webhook_secret    -- valeur propre à cyberdesk-billing-webhook, distincte de stripe_webhook_secret
stripe_price_id_cyberdesk        -- id du Price Stripe de l'abonnement SaaS CyberDesk (un seul plan en v1)
openrouteservice_api_key         -- géocodage + itinéraire, calcul frais de déplacement (option O4 devis)
brevo_api_key
anthropic_api_key
```

### Déploiement

```bash
supabase link --project-ref bgkijldrmdhklkadkeua
supabase functions deploy update-cybervictim-tasks
supabase functions deploy purge-cybervictim-data
supabase functions deploy generate-cybervictim-quote
supabase functions deploy generate-cybervictim-report
supabase functions deploy send-cybervictim-quote
supabase functions deploy cyberdesk-stripe-webhook --no-verify-jwt
supabase functions deploy cyber-ia-assistant
supabase functions deploy cyberdesk-send-audit-email
supabase functions deploy cyberdesk-forgot-password --no-verify-jwt
supabase functions deploy cyberdesk-dpo-request
supabase functions deploy cyberdesk-send-review-request
supabase functions deploy cyberdesk-submit-review --no-verify-jwt
supabase functions deploy cyberdesk-billing-webhook --no-verify-jwt
supabase functions deploy cyberdesk-create-tenant-checkout
supabase functions deploy cyberdesk-billing-portal
supabase functions deploy cyberdesk-compute-travel-fee
```

⚠️ Les slugs `stripe-webhook` et `send-audit-email` (sans préfixe) sont
**déjà pris par des fonctions Vente actives** sur ce projet partagé — ne
jamais déployer sous ces noms, toujours `cyberdesk-stripe-webhook` /
`cyberdesk-send-audit-email`. Avant de créer toute nouvelle Edge Function,
vérifier la liste existante (`list_edge_functions` ou Dashboard) pour
éviter d'écraser une fonction de Vente.

### Ordre de déploiement obligatoire

Toujours déployer dans cet ordre (dépendances croissantes) :
1. update-cybervictim-tasks
2. purge-cybervictim-data
3. generate-cybervictim-quote
4. generate-cybervictim-report
5. send-cybervictim-quote
6. cyberdesk-stripe-webhook (`--no-verify-jwt` — appelée par Stripe sans JWT utilisateur)
7. cyber-ia-assistant
8. cyberdesk-send-audit-email
9. cyberdesk-forgot-password (`--no-verify-jwt` — appelée avant toute connexion, aucun JWT utilisateur)
10. cyberdesk-dpo-request (JWT utilisateur normal)
11. cyberdesk-send-review-request (JWT utilisateur normal)
12. cyberdesk-submit-review (`--no-verify-jwt` — soumission publique via `avis-client.html`)
13. cyberdesk-billing-webhook (`--no-verify-jwt` — appelée par Stripe sans JWT utilisateur)
14. cyberdesk-create-tenant-checkout (JWT utilisateur, `is_super_admin()` vérifié en interne)
15. cyberdesk-billing-portal (JWT utilisateur normal)
16. cyberdesk-compute-travel-fee (JWT utilisateur normal)

## Facturation SaaS des tenants (cyberdesk-billing-*)

Distinct du paiement des dossiers victimes (`cyberdesk-stripe-webhook` /
`send-cybervictim-quote`, qui existe depuis la migration 005 et n'est pas
touché ici) : c'est l'abonnement mensuel que paie le prestataire cyber
pour utiliser CyberDesk lui-même — vide complet avant la migration
`015_cyberdesk_tenant_billing.sql` (aucune table `tenants`, aucune
notion d'essai/abonnement dans le code avant cette migration).

**Modèle Stripe : un seul compte plateforme**, pas de Stripe Connect —
CyberDesk facture chaque tenant directement, comme le paiement victime
le fait déjà. `stripe_secret_key` (Vault) est réutilisé tel quel.

**Schéma** : `cyberdesk_tenants` (statut d'abonnement, IDs Stripe, dates
d'essai/renouvellement) + `cyberdesk_tenant_invoices` (détail des
factures, synchronisées vers `payments` par trigger, voir Cohabitation).
`staff_module_access` gagne une colonne `tenant_id` nullable — un accès
à `tenant_id = NULL` reste un accès hors facturation SaaS (comportement
historique inchangé). Cardinalité tenant ↔ utilisateur volontairement
simple en v1 (pas de table de membership séparée) : un seul vrai client
aujourd'hui, l'auto-invitation de collègues reste un ajout manuel par un
admin (`staff_module_access` avec le bon `tenant_id`).

**Accès** : `has_module_access()` intègre désormais le statut
d'abonnement — un accès rattaché à un tenant `canceled`/`unpaid` ne
passe plus la garde (propagé partout : RLS, guards des Edge Functions,
`hasCyberdeskAccess()`). `past_due` ne bloque volontairement rien
(fenêtre de grâce — Stripe relance déjà une carte refusée). `index.html`
(`checkSession()`) affiche un message distinct (« abonnement suspendu »)
plutôt que le message générique dans ce cas précis.

**Limite assumée** : un utilisateur dont le tenant passe à
`canceled`/`unpaid` est déconnecté par `index.html` avant d'atteindre
Paramétrage — il n'a donc plus, en v1, de bouton dans l'app menant au
portail Stripe (`cyberdesk-billing-portal`) pour régulariser lui-même.
La fonction elle-même reste joignable (elle ne vérifie pas
`has_module_access`, seulement l'existence d'un `tenant_id`), donc un
lien envoyé à la main par un admin fonctionne — pas d'écran de reprise
dédié en v1, un contact direct de l'équipe couvre ce cas (un seul client
aujourd'hui). À revoir si le nombre de tenants augmente.

**Flux v1 (pas d'auto-inscription)** : un admin crée d'abord le compte
`auth.users` du client (processus manuel inchangé), puis appelle
`cyberdesk-create-tenant-checkout` (réservée à `is_super_admin()`) qui
crée le tenant, l'accès `trialing` immédiat, et une Checkout Session
Stripe (`mode: 'subscription'`) — le lien est transmis à la main au
client, pas d'envoi automatisé (créer un tenant payant est rare,
contrairement à l'envoi de devis par dossier victime). Retour Stripe sur
`abonnement-confirme.html` / `abonnement-annule.html` (pages dédiées,
copie différente de `paiement-confirme.html`/`paiement-annule.html` qui
restent spécifiques au paiement dossier victime). `cyberdesk-billing-
webhook` (secret `stripe_billing_webhook_secret`, distinct de celui de
`cyberdesk-stripe-webhook`) tient à jour le statut sur tout le cycle de
vie (essai, paiement, échec, résiliation). Auto-inscription publique et
invitation self-service de collègues restent hors périmètre v1 (voir
Feuille de route).

**Vue admin** : section « Abonnements » dans la modale Comptable
(`assets/js/accounting.js`), alimentée par `cyberdesk_reporting_tenants()`
— compteurs de tenants par statut, pas un MRR en €
(`cyberdesk_tenants.stripe_price_id` ne stocke qu'un identifiant Stripe,
pas un montant ; calculer un MRR fiable demanderait de le dupliquer en
base ou un appel serveur à l'API Stripe, non fait en v1).

## Assistant IA (cyber-ia-assistant)

v1 : appel direct à l'API Anthropic Claude (`claude-sonnet-5`) via l'Edge
Function `cyber-ia-assistant`, pas de multi-connecteurs (le système
`connectors-guard`/`call-ia`/`safe_connectors` de safecrm n'a pas
été porté — trop couplé au CRM parent ; `call-ia` existe bien côté
Vente sur le projet partagé, mais c'est un système distinct, non
réutilisé par CyberDesk).

Multi-connecteurs (Groq, Mistral, Grok) reste une piste V2/V3,
pas un pré-requis MVP.

**Le prompt système fait foi en deux endroits, à garder synchronisés :**
`supabase/functions/_shared/cyber-system-prompt.ts` (source de vérité,
utilisée par la fonction) et `assets/js/cyber-ai-system-prompt.js` (copie
navigateur, uniquement utilisée par le module B2B déconnecté). Ne pas
modifier le contenu sans valider le comportement métier.

**Contrat de l'Edge Function : `POST { lead_id, question }` (pas de
`system` ni de `message` pré-assemblé accepté depuis le client)** — le
contexte du dossier est assemblé et pseudonymisé côté serveur, jamais
dans le navigateur :
- Garde d'accès : vérifie `has_module_access('cyberdesk')` via RPC avant
  toute lecture (indispensable sur le projet partagé — un compte Vente
  authentifié ne doit pas pouvoir interroger un dossier victime).
- Pseudonymisation (`_shared/pii-redact.ts`) appliquée aux champs texte
  libre (`attack_description`, `targeted_services`, `financial_loss`,
  `timeline_events[].description`, `notes`, `internal_notes`, et la
  question elle-même) avant l'appel à Anthropic : masquage par regex des
  emails/téléphones/IBAN/numéro de sécurité sociale/numéro de carte, et
  substitution du nom connu de la victime par « la victime ». **Limite
  assumée** : un tiers non identifié mentionné nommément dans un champ
  libre n'est pas détecté (nécessiterait une détection d'entités nommées,
  hors périmètre v1) — documenté comme risque résiduel dans le registre
  de traitement CyberDesk (module DPO).
- Chaque appel est journalisé dans `audit_logs`
  (`action: 'ia_assistant_appel'`, `module: 'CyberDesk'`).
- Anthropic est déclaré comme sous-traitant dans les CGS
  (`_shared/cgs-content.ts`, section 10.5).

## Mot de passe oublié (cyberdesk-forgot-password)

Le lien « Mot de passe oublié ? » de l'écran de connexion (`index.html`)
ne passe **pas** par `sb.auth.resetPasswordForEmail()` mais par l'Edge
Function `cyberdesk-forgot-password` : le service e-mail intégré de
Supabase a un quota par défaut très bas (constaté en test réel — "email
rate limit exceeded" après quelques envois), et changer le SMTP du projet
dans le Dashboard (Authentication → URL Configuration) l'aurait modifié
pour **tout** le projet partagé, y compris les e-mails d'auth de
Vente/safe-crm. Ce contournement reste scopé au seul flux mot de passe
oublié.

**Contrat de l'Edge Function : `POST { email }` → toujours
`{ success: true }`**, y compris si le compte n'existe pas (pas
d'énumération de comptes possible) :
- Déployée avec `--no-verify-jwt` (appelée avant toute connexion, aucun
  JWT utilisateur disponible — comme `cyberdesk-stripe-webhook`).
- Génère le lien via `auth.admin.generateLink({ type: 'recovery' })`
  (service_role, ne déclenche aucun envoi Supabase) puis l'envoie
  elle-même par e-mail via Brevo (`brevo_api_key` du Vault), expéditeur
  `noreply@safe-digitalisation.fr` (identique à `send-cybervictim-quote`).
- Chaque envoi réussi (ou tentative échouée côté Brevo) est journalisé
  dans `audit_logs` (`action: 'mot_de_passe_oublie_email_envoye'`,
  `module: 'CyberDesk'`, `entity_type: 'auth_user'`) — preuve d'envoi
  pour le registre de traitement du module DPO. Aucun log si le compte
  n'existe pas (aucun e-mail n'est réellement envoyé dans ce cas).
- **Limite assumée** : endpoint public sans limitation de débit dédiée
  (au-delà de celle de Brevo) — acceptable en l'état vu le nombre de
  comptes actuel (un seul, voir `profiles`), à revoir si le nombre de
  comptes CyberDesk augmente.

Le reste du parcours (redirection vers `index.html`, détection de
l'événement `PASSWORD_RECOVERY` côté client, saisie du nouveau mot de
passe via `sb.auth.updateUser()`) est géré directement dans `index.html`,
inchangé par rapport à un lien Supabase natif.

## Paramétrage, RGPD (DPO) et avis clients

**Modale Paramétrage** (`assets/js/settings.js`) : fiche profil par
utilisateur (`cyberdesk_user_settings`, une ligne par `user_id`, jamais une
extension de `profiles` — table safe-crm hors périmètre), photo de profil
(bucket privé `cyberdesk-avatars`, URL signée), et activation de la double
authentification via le MFA natif de Supabase Auth (`sb.auth.mfa.enroll/
challenge/verify/unenroll` — pas de table ni de logique custom, l'état 2FA
n'est jamais dupliqué côté CyberDesk).

**Demande d'exercice de droits RGPD** (bouton dans Paramétrage → Edge
Function `cyberdesk-dpo-request`, JWT utilisateur normal) : préparation du
futur module DPO, sans automatisation complète en V1. Enregistre la
demande dans `cyberdesk_dpo_requests` **et** notifie immédiatement
`dpo@safe-digitalisation.fr` par e-mail (Brevo) — le délai légal de
réponse est de 1 mois, une demande invisible tant qu'aucun panneau admin
dédié n'existe serait trop risquée à manquer. Chaque appel réussi est
journalisé dans `audit_logs` (`action: 'dpo_demande_exercice_droits'`,
`module: 'CyberDesk'`).

**Avis clients** (`cybervictim_reviews`) : à la clôture d'un dossier
(`victimes17.js`, transition vers `pipeline_stage = 'cloture'`), un appel
best-effort à l'Edge Function `cyberdesk-send-review-request` (JWT
utilisateur normal) crée une ligne avec un `review_token` valable 60 jours
et envoie au client un e-mail Brevo contenant le lien
`avis-client.html?token=...`. La page `avis-client.html` est publique,
sans authentification, et poste directement (fetch + clé anon) vers
l'Edge Function `cyberdesk-submit-review` (`--no-verify-jwt`), qui vérifie
le token côté serveur (service_role) et répond de façon générique en cas
de token invalide/expiré/déjà utilisé — même logique anti-énumération que
`cyberdesk-forgot-password`. **Aucune policy RLS `anon`** n'a été ajoutée
sur `cybervictim_reviews` : contrairement à `client_token` (jamais
exploité en RLS anon dans ce projet), la soumission passe exclusivement
par cette Edge Function service_role.

**Modale Comptable** (`assets/js/accounting.js`) : dashboard KPI (Chart.js
via CDN) **accessible à tout utilisateur connecté**, avec un cloisonnement
par créateur de dossier (`created_by`) :
- Un utilisateur standard ne voit que ses propres résultats (dossiers
  qu'il a créés) — pas de sélecteur affiché.
- Un admin (`is_admin()`/`is_super_admin()`) voit un sélecteur pour
  basculer entre "Vue globale" et la vue d'un utilisateur en particulier
  (liste peuplée via `cyberdesk_staff_list()`).

Le cloisonnement est fait **côté serveur**, par 4 fonctions
`SECURITY DEFINER` dédiées au reporting (`010_accounting_scope.sql`) :
`cyberdesk_reporting_leads`, `cyberdesk_reporting_payments`,
`cyberdesk_reporting_reviews` (chacune `(p_user_id uuid default null)` —
un non-admin voit toujours `created_by = auth.uid()` quel que soit le
paramètre passé, seul un admin peut filtrer sur un tiers ou passer `null`
pour la vue globale) et `cyberdesk_staff_list()` (liste des comptes ayant
accès au module, admin uniquement). **Volontairement pas une nouvelle
policy RLS** sur `cybervictim_leads`/`payments`/`cybervictim_reviews` : la
RLS de ces tables reste large (Kanban partagé, reporting admin Vente sur
`payments`/`v_payments_reporting` inchangé) — un simple filtre JS aurait
été contournable puisque ces tables restent lisibles par tout le staff
`cyberdesk` par ailleurs. `v_payments_reporting` n'est donc plus utilisée
par la modale Comptable (elle reste réservée au reporting admin de
Vente) ; l'agrégation par mois du CA se fait désormais côté client à
partir des lignes brutes renvoyées par `cyberdesk_reporting_payments`.
Avis clients (`cybervictim_reviews`) rattachés au créateur du dossier via
une jointure sur `cybervictim_leads.created_by` (la table des avis n'a pas
de colonne utilisateur propre).

## Grille tarifaire et devis 17Cyber

`assets/data/tarifs-cyberdesk.json` est la **source unique de vérité
tarifaire** pour la modale devis à 3 étapes (`victimes17-quote.js`,
chargée en `fetch()` côté client) : 4 niveaux de prestations (N1-N4),
des packs, des options, un tarif horaire pour les cas complexes, la
TVA, et la politique (devis gratuit, garantie de reprise 7 jours). Le
conseiller peut toujours modifier manuellement le montant HT final
(`quote-ht-override`) quel que soit le calcul automatique en amont.

**À ne pas confondre avec** `cybervictim_products` (`price_ht`/
`price_ttc`, un forfait unique par type d'alerte) : cette seconde table
sert de repli pour les Edge Functions qui régénèrent un devis .docx
côté serveur sans repasser par la modale (`generate-cybervictim-quote`)
et alimente le tableau tarifaire des CGS (`cgs-render.ts`). Les deux
systèmes ne sont pas synchronisés entre eux — un changement de prix
dans l'un ne se répercute pas sur l'autre.

**Frais de déplacement (option O4) : calcul automatique.** Contrairement
aux autres options, O4 n'a pas de montant fixe — historiquement une
case à chiffrer à la main. Depuis l'Edge Function
`cyberdesk-compute-travel-fee`, cocher O4 déclenche un calcul
automatique : géocodage de l'adresse S@FE et de la ville du dossier
(champ `cybervictim_leads.city`) via l'API OpenRouteService, distance
routière aller-retour, multipliée par un coefficient €/km. **Jamais
bloquant** : sans ville renseignée, ville non géolocalisée, ou service
indisponible, la case retombe sur la saisie manuelle d'origine (champ
texte + montant ajouté à la main dans `quote-ht-override`).

**Coefficient du barème kilométrique — ajustable en base, pas dans le
code.** Contrairement à l'adresse d'origine et à l'aller-retour
(statiques, `deplacement` dans `tarifs-cyberdesk.json` +
`_shared/travel-fee-config.ts`, même patron que `product-texts.ts`), le
coefficient €/km vit dans une table dédiée à une seule ligne,
`cyberdesk_travel_fee_settings` (migration `016_travel_fee_coefficient_
setting.sql`) — défaut `1` tant qu'aucun admin ne l'a modifié. Un admin
(`is_admin()`/`is_super_admin()`, RLS sur la table) le modifie
directement depuis la modale devis, dans le bloc de l'option Déplacement
(`quote-o4-admin-coef`, `victimes17-quote.js` : `_quoteLoadTravelCoefficient()`/
`_quoteSaveTravelCoefficient()`) — sans déploiement, puisque ce barème
est republié chaque année (impôts/URSSAF). Chaque modification est
journalisée dans `audit_logs` (`action: 'tarif_deplacement_coefficient_
modifie'`). `cyberdesk-compute-travel-fee` lit systématiquement la
valeur en base (repli sur `TRAVEL_FEE_CONFIG.coefficientEurKm = 1`
uniquement si la table est vide, ce qui ne devrait pas arriver — la
migration seede une ligne).

**Limites assumées** :
- Précision **ville à ville**, pas porte-à-porte — `cybervictim_leads`
  n'a qu'un champ `city` (texte libre, migration 003), pas d'adresse
  complète. Approximation jugée suffisante pour une indemnité
  kilométrique, à revoir si une précision plus fine devient nécessaire.
- Origine fixe (adresse S@FE), pas de point de départ configurable —
  cohérent avec un seul lieu d'intervention type aujourd'hui. Seul le
  coefficient est ajustable en base ; adresse et aller-retour resteraient
  à changer dans le code si besoin.
- Réponse de l'API Directions ORS lue de façon défensive (deux formes
  de payload possibles selon la configuration du compte) — à vérifier
  avec un appel réel avant mise en production, comme le reste de la
  grille tarifaire reconstruite par déduction (voir note sur
  `cybervictim_leads`/`cybervictim_products` plus haut).

## Documents générés (devis / rapports)

Le prestataire mentionné dans les PDF/DOCX générés est **"S@FE"**
(sans la mention légale "SASU" — à la différence de safecrm).
Les autres coordonnées (adresse, SIRET, email, référencement
17Cyber) restent inchangées par défaut ; à reconfirmer avant tout
usage commercial réel.

## Feuille de route

### MVP (en cours)
- [x] Extraction du module de safecrm
- [x] Schema SQL cyberdesk (migration 008, sur le projet partagé safe-crm)
- [x] Cohabitation multi-module (`staff_module_access`, `payments` partagé)
- [ ] Edge Functions déployées (sur le nouveau projet bgkijldrmdhklkadkeua)
- [ ] Multi-tenant (table `tenants` + `tenant_id` + RLS **sur `cybervictim_leads`** — isolation des
      dossiers par tenant). Distinct de `cyberdesk_tenants` (migration 015, voir section dédiée) :
      celui-ci ne couvre que la facturation/l'accès (`staff_module_access.tenant_id`), pas
      l'isolation des données du Kanban — les dossiers restent cloisonnés par `created_by`
      (migration 011), pas par tenant, tant que cet item reste ouvert.
- [ ] Espace client (client_token + page publique)
- [ ] Formulaire web d'entrée (source: formulaire_web)
- [ ] Location de module à un client externe via `client_module_settings` (cas d'usage différent de
      la facturation SaaS tenant ci-dessous — un client géré par Vente, pas un compte auth.users
      CyberDesk direct)
- [x] Facturation SaaS des tenants — abonnement Stripe (migration `015_cyberdesk_tenant_billing.sql`,
      voir section dédiée). Onboarding encore manuel côté admin (pas d'auto-inscription publique).

### V2
- [ ] Qualification IA automatique à la création du dossier
- [ ] Timeline live dans l'interface
- [ ] Coffre de preuves (upload + SHA256)
- [x] Tableau de bord KPIs (CA, délais, taux de transformation, avis clients) — modale Comptable, voir section dédiée
- [ ] Playbooks dynamiques (arbre conditionnel)
- [ ] Multi-connecteurs IA (Groq, Mistral, Grok)
- [x] Paiement Stripe (lien de paiement dossiers victimes) — déjà en place depuis la migration 005
      (`cyberdesk-stripe-webhook`, `send-cybervictim-quote`) : case cochée à tort par le passé,
      corrigée après vérification directe du code (ne pas confondre avec la facturation SaaS
      tenant ci-dessus, qui est un flux Stripe distinct).
- [ ] Panneau admin de traitement des demandes DPO (`cyberdesk_dpo_requests` — intake déjà en place, pas de suivi/statut dans l'UI)

### V3
- [ ] Génération courriers (plainte, CNIL, banque, Meta...)
- [ ] Base de connaissance auto-enrichie
- [ ] Connecteurs externes (Microsoft, Google, Meta)
- [ ] White-label (domaine custom, logo, couleurs)

## Conventions de code

- Vanilla JS uniquement — pas de framework, pas de bundler
- ES Modules natifs (import/export)
- Pas de dépendances npm côté frontend
- Nommage : snake_case pour SQL, camelCase pour JS
- Commentaires en français (c'est un produit français)
- Toute fonction publique doit avoir un commentaire JSDoc

## Ce qu'il ne faut jamais faire

- Modifier le dépôt git sebastien-Safe/safe-crm (lecture seule)
- Créer, modifier ou supprimer une table/colonne du module Vente/B2B
  (`contacts`, `clients`, `cyber_client_*`, `cyber_audits`,
  `client_module_settings`, `profiles`...) depuis une migration
  CyberDesk — le projet Supabase est partagé, mais le schéma de Vente
  ne l'est pas
- Recréer `audit_logs`, `profiles`, ou toute fonction RLS déjà existante
  côté safe-crm (`is_admin`, `is_super_admin`, `my_contact_id`,
  `get_team_ids`) — toujours vérifier l'existant avant d'ajouter
- Déployer une Edge Function sans vérifier d'abord la liste des fonctions
  déjà présentes sur le projet partagé — `stripe-webhook` et
  `send-audit-email` (sans préfixe) appartiennent à Vente ; les écraser
  casserait son système de paiement/abonnement en production
- Committer des credentials ou clés API
- Désactiver RLS sur une table
- Mélanger la logique multi-tenant et mono-tenant
- Déployer en production sans avoir testé les Edge Functions
- Modifier une migration déjà appliquée en production
  (créer une nouvelle migration à la place)

## En cas de doute

Si une décision d'architecture n'est pas couverte par ce fichier,
ne pas improviser : poser la question avant d'agir.
Ce projet gère des données de victimes cyber — la rigueur
sur la sécurité et la conformité RGPD est non négociable.
