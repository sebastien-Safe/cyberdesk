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
2. **Module Cybersec Clients B2B** (`cyber-*.js`) — audit de sécurité
   pour des clients existants. Dans safecrm il auditait la table
   `contacts` du CRM parent ; **CyberDesk a sa propre table `clients`**,
   indépendante, créée pour ce dépôt (aucune donnée réelle de safecrm
   n'a été copiée — uniquement le schéma).

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
| Paiement | Aucun en v1 (Stripe non porté, à réévaluer plus tard) |

## Projet Supabase

- Project URL : https://rxxciopqqqpsmyisxtcc.supabase.co
- Project Ref : rxxciopqqqpsmyisxtcc
- Région : Frankfurt (eu-central-1)
- Organisation : S@FE

Les credentials ne sont jamais committés dans le dépôt.
Utiliser les variables d'environnement définies dans .env.example.

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
│       └── task-tree.js           ← composant arbre de tâches (Suivi d'intervention)
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
├── supabase/
│   ├── functions/
│   │   ├── _shared/                        ← docx-helpers, product-texts, cgs-render, cgs-content
│   │   ├── generate-cybervictim-report/
│   │   ├── generate-cybervictim-quote/
│   │   ├── update-cybervictim-tasks/
│   │   ├── purge-cybervictim-data/
│   │   ├── cyber-ia-assistant/             ← nouvelle fonction, appel direct Anthropic
│   │   ├── send-audit-email/               ← résultats du quiz mission-cyber.html
│   │   ├── deno.json
│   │   └── import_map.json
│   └── migrations/
│       └── 001_cyber_schema.sql           ← schema complet cyberdesk
├── .env.example
├── CLAUDE.md                              ← ce fichier
└── README.md
```

## Base de données

### Tables principales

| Table | Rôle |
|---|---|
| `cybervictim_leads` | Dossiers victimes (table centrale du pipeline 17Cyber) |
| `cybervictim_products` | Catalogue produits/forfaits |
| `clients` | Clients audités par le module B2B (propre à CyberDesk, ne vient pas de safecrm) |
| `cyber_client_profiles` | Score de sécurité par client |
| `cyber_client_audits` | Réponses à la checklist d'audit |
| `cyber_client_incidents` | Incidents de sécurité déclarés côté client B2B |
| `cyber_client_plan` | Plan d'action correctif par client |
| `audit_logs` | Journal RGPD minimal propre à CyberDesk (remplace `logRgpd()` de safecrm) |

**Note sur `cybervictim_leads`/`cybervictim_products` :** ces tables
n'existaient dans aucune migration versionnée de safecrm (créées à la
main en production). Le schéma ci-dessous a donc été **reconstruit
par déduction du code JS**, pas copié depuis une source faisant
autorité — vérifier avant mise en production réelle.

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

### Conventions SQL

- RLS activé sur toutes les tables — ne jamais désactiver
- Toujours utiliser `gen_random_uuid()` pour les UUID
- Toujours ajouter `created_at TIMESTAMPTZ DEFAULT now()`
- Les migrations sont numérotées : 001_, 002_, 003_...
- Une migration ne modifie jamais une migration précédente

### pg_cron

La purge RGPD automatique utilise pg_cron. Contrairement à ce que
suggérait le code source (commentaire référençant une migration
`cybervictim_purge_cron` qui n'a jamais existé dans safecrm), le job
est créé de zéro dans `001_cyber_schema.sql` pour CyberDesk.
Le job tourne chaque nuit et supprime/anonymise les dossiers
au-delà de la durée de conservation légale.
Vérifier que l'extension pg_cron est activée dans
Supabase Dashboard → Database → Extensions.

## Edge Functions

### Conventions Deno

- Runtime : Deno (pas Node.js)
- Imports : depuis deno.land/x ou esm.sh
- Secrets : via `Deno.env.get('NOM_SECRET')`
- Ne jamais hardcoder de credentials

### Secrets à configurer dans Supabase Dashboard
(Settings → Edge Functions → Secrets)
```
SUPABASE_URL
SUPABASE_SERVICE_ROLE_KEY
ANTHROPIC_API_KEY
PURGE_SECRET
```

### Déploiement

```bash
supabase link --project-ref rxxciopqqqpsmyisxtcc
supabase functions deploy update-cybervictim-tasks
supabase functions deploy purge-cybervictim-data
supabase functions deploy generate-cybervictim-quote
supabase functions deploy generate-cybervictim-report
supabase functions deploy cyber-ia-assistant
supabase functions deploy send-audit-email
```

### Ordre de déploiement obligatoire

Toujours déployer dans cet ordre (dépendances croissantes) :
1. update-cybervictim-tasks
2. purge-cybervictim-data
3. generate-cybervictim-quote
4. generate-cybervictim-report
5. cyber-ia-assistant
6. send-audit-email

## Assistant IA (cyber-assistant.js)

v1 : appel direct à l'API Anthropic Claude via l'Edge Function
`cyber-ia-assistant`, pas de multi-connecteurs (le système
`connectors-guard`/`call-ia`/`safe_connectors` de safecrm n'a pas
été porté — trop couplé au CRM parent).

Multi-connecteurs (Groq, Mistral, Grok) reste une piste V2/V3,
pas un pré-requis MVP.

Les prompts système sont dans cyber-assistant.js —
ne pas les modifier sans valider le comportement métier.

## Documents générés (devis / rapports)

Le prestataire mentionné dans les PDF/DOCX générés est **"S@FE"**
(sans la mention légale "SASU" — à la différence de safecrm).
Les autres coordonnées (adresse, SIRET, email, référencement
17Cyber) restent inchangées par défaut ; à reconfirmer avant tout
usage commercial réel.

## Feuille de route

### MVP (en cours)
- [x] Extraction du module de safecrm
- [ ] Schema SQL cyberdesk
- [ ] Edge Functions déployées
- [ ] Multi-tenant (table tenants + tenant_id + RLS)
- [ ] Espace client (client_token + page publique)
- [ ] Formulaire web d'entrée (source: formulaire_web)
- [ ] Onboarding tenant (inscription → trial → Stripe)

### V2
- [ ] Qualification IA automatique à la création du dossier
- [ ] Timeline live dans l'interface
- [ ] Coffre de preuves (upload + SHA256)
- [ ] Tableau de bord KPIs (CA, délais, taux récupération)
- [ ] Playbooks dynamiques (arbre conditionnel)
- [ ] Multi-connecteurs IA (Groq, Mistral, Grok)
- [ ] Paiement Stripe (lien de paiement dossiers victimes)

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

- Modifier sebastien-Safe/safecrm (lecture seule)
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
