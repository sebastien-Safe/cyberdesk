# CLAUDE.md — CyberDesk

Ce fichier est destiné à Claude Code. Il décrit l'architecture,
les conventions et les décisions techniques du projet CyberDesk.
Lis-le intégralement avant toute action.

## Ce qu'est CyberDesk

CyberDesk est une plateforme SaaS de gestion d'incidents cyber,
extraite du CRM safecrm (sebastien-Safe/safecrm).

Elle permet à des prestataires cyber, assureurs, avocats et
collectivités de gérer des dossiers de victimes cyber :
- Kanban de suivi des dossiers
- Arbre de tâches dynamique par type d'incident
- Génération de devis et rapports DOCX
- Espace client (à venir)
- Qualification IA des incidents (à venir)

Le produit est destiné à être revendu en SaaS multi-tenant
(abonnement mensuel) avec option white-label.

## Origine du code

Ce dépôt est une extraction propre du module Cyber de safecrm.
Le dépôt source (sebastien-Safe/safecrm) est en lecture seule —
ne jamais le modifier.

Les fichiers extraits ont été nettoyés de toute dépendance
au CRM parent. Toute référence à safecrm dans le code est
un bug à corriger.

## Stack technique

| Couche | Technologie |
|---|---|
| Frontend | Vanilla JS, HTML statique, CSS custom |
| Backend | Supabase (PostgreSQL + Edge Functions Deno) |
| Auth | Supabase Auth (JWT) |
| Génération DOCX | lib `docx` via Edge Function Deno |
| IA | Anthropic Claude API (multi-connecteurs : Groq, Mistral, Grok) |
| Déploiement | Vercel (frontend) + Supabase (backend) |
| Paiement | Stripe (à venir) |

## Projet Supabase

- Project URL : https://rxxciopqqqpsmyisxtcc.supabase.co
- Project Ref : rxxciopqqqpsmyisxtcc
- Région : Frankfurt (eu-central-1)
- Organisation : S@FE

Les credentials ne sont jamais committés dans le dépôt.
Utiliser les variables d'environnement définies dans .env.example.

## Structure du dépôt
cyberdesk/
├── index.html                     ← point d'entrée principal
├── assets/
│   ├── victimes17/
│   │   ├── victimes17.js          ← Kanban + arbre de tâches (module principal)
│   │   └── victimes17-pdf.js      ← génération rapport DOCX
│   ├── data/
│   │   └── task_trees.json        ← arbre de décision par type d'incident
│   ├── css/                       ← styles du module cyber
│   └── js/
│       └── supabase.client.js     ← client Supabase cyberdesk
├── modules/
│   └── Cyber/
│       ├── cyber-core.js          ← fonctions partagées du module
│       ├── cyber-incidents.js     ← gestion des incidents B2B
│       ├── cyber-dashboard.js     ← tableau de bord
│       ├── cyber-assistant.js     ← assistant IA multi-connecteurs
│       ├── cyber-plan.js          ← plans et forfaits
│       └── module-cyber-clients.html
├── supabase/
│   ├── functions/
│   │   ├── generate-cybervictim-report/   ← rapport DOCX (214 lignes)
│   │   ├── generate-cybervictim-quote/    ← devis DOCX (175 lignes)
│   │   ├── update-cybervictim-tasks/      ← mise à jour arbre tâches (92 lignes)
│   │   └── purge-cybervictim-data/        ← purge RGPD automatique (104 lignes)
│   └── migrations/
│       └── 001_cyber_schema.sql           ← schema complet cyberdesk
├── .env.example
├── CLAUDE.md                              ← ce fichier
└── README.md

## Base de données

### Tables principales

| Table | Rôle |
|---|---|
| `cybervictim_leads` | Dossiers victimes (table centrale) |
| `cybervictim_products` | Catalogue produits/forfaits |

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

La purge RGPD automatique utilise pg_cron.
Le job tourne chaque nuit et supprime les dossiers
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
SUPABASE_URL
SUPABASE_SERVICE_ROLE_KEY
ANTHROPIC_API_KEY

### Déploiement

```bash
supabase link --project-ref rxxciopqqqpsmyisxtcc
supabase functions deploy generate-cybervictim-report
supabase functions deploy generate-cybervictim-quote
supabase functions deploy update-cybervictim-tasks
supabase functions deploy purge-cybervictim-data
```

### Ordre de déploiement obligatoire

Toujours déployer dans cet ordre (dépendances croissantes) :
1. update-cybervictim-tasks
2. purge-cybervictim-data
3. generate-cybervictim-quote
4. generate-cybervictim-report

## Assistant IA (cyber-assistant.js)

Le module supporte plusieurs connecteurs IA :
- Anthropic Claude (défaut)
- Groq
- Mistral
- Grok (xAI)

Le connecteur actif est configurable par tenant (à venir).
Les prompts système sont dans cyber-assistant.js —
ne pas les modifier sans valider le comportement métier.

## Feuille de route

### MVP (en cours)
- [x] Extraction du module de safecrm
- [x] Schema SQL cyberdesk
- [x] Edge Functions déployées
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