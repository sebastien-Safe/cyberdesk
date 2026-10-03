# Audit de sécurité — S@FE CYBER PILOT

**Date :** 2026-10-04
**Périmètre :** en-têtes de sécurité HTTP, CSP, parcours utilisateur (auth, IDOR, XSS, CSRF)
**Référentiels :** OWASP ASVS 4.0, OWASP Top 10 2021, PCI DSS SAQ A
**Branche de travail :** `security/audit-headers` (PR #1, mergée) puis `security/aide-csp` (PR #2)

> Document de traçabilité de l'audit. Chaque finding = un correctif = un commit.
> Les identifiants `cyberdesk`/`CyberDesk` techniques restent inchangés (cf. CLAUDE.md).

## Règles d'engagement

- Aucune action sur la production sans validation — travail local/dev, puis déploiement explicite par le propriétaire.
- Stripe en mode test uniquement ; aucune clé `sk_live` utilisée (aucune trouvée dans le code ou l'historique).
- Jamais affaiblir une protection existante pour « faire marcher » quelque chose.
- Toujours fournir la preuve (commande + sortie), pas seulement la conclusion.

## Synthèse des findings

| ID | Sujet | Sévérité | Statut |
|----|-------|----------|--------|
| F-001 | CSP : suppression de `unsafe-inline` (+ `unsafe-eval`) | Élevée | Corrigé — app en prod ; pages `aide/` en attente (PR #2) |
| F-002 | Clickjacking : `X-Frame-Options` + `frame-ancestors` absents | Moyenne | Corrigé — déployé (Worker) |
| F-003 | En-têtes HTTP manquants + cache des pages sensibles | Moyenne | Corrigé — déployé (Worker) |
| F-004 | CORS Edge Functions : `*` → liste blanche | Moyenne | Corrigé — TODO pré-prod (retrait localhost) |
| F-005 | XSS : champs du formulaire de diagnostic public non échappés | Faible/Moyenne | Corrigé — déployé |

Parcours audités **sans finding** (défenses jugées solides) : authentification, IDOR, CSRF (voir plus bas).

---

## F-001 — CSP sans `unsafe-inline`

**Problème.** Toutes les pages servaient `script-src 'self' 'unsafe-inline' 'unsafe-eval' https:`, autorisant l'exécution de tout script inline — la CSP n'offrait aucune protection XSS réelle.

**Correctif.**
- Extraction de tout le JS inline de `index.html` vers `assets/js/main.js` + `assets/js/event-bindings.js`.
- Suppression de tous les handlers inline (`onclick=`, `onchange=`, `oninput=`, `onsubmit=`) au profit de `addEventListener` / délégation d'événements.
- Même traitement pour les pages publiques : `mission-cyber.html`, `avis-client.html`, `reserver-creneau.html`, pages de retour paiement, et les 10 fiches `/aide/<slug>/` + le hub (générées par `scripts/build-aide-publique.mjs`).
- CSP resserrée partout : `script-src 'self'` (+ `https://cdn.jsdelivr.net` là où un CDN est réellement utilisé, avec SRI déjà en place). `style-src` conserve `'unsafe-inline'` (feuilles `<style>` inline, risque XSS faible).

**Régression traitée.** Le HTML généré dynamiquement par `victimes17.js`, `accounting.js`, `settings.js` injectait aussi des `onclick=` via `innerHTML` — bloqués par la CSP stricte. Remplacés par de la délégation d'événements avec attributs `data-*` sur les conteneurs (`#v17-board`, `#accounting-commission-list`, etc.).

**Preuve.** Après correctif, `grep -rc "onclick=" assets/…` → 0 ; prod `curl .../index.html | grep onclick=` → 0 ; CSP servie = `script-src 'self' https://cdn.jsdelivr.net`.

## F-002 — Clickjacking

**Problème.** Aucun `X-Frame-Options` ni `frame-ancestors` → la page pouvait être embarquée dans une iframe tierce (détournement de clic). `frame-ancestors` ne peut **pas** passer par une balise `<meta>` (spec CSP niveau 2 §5.7.2) — il faut un en-tête HTTP.

**Correctif.** GitHub Pages ne sert pas d'en-têtes HTTP personnalisés → un **Cloudflare Worker** (`cloudflare/security-headers-worker.js`), déployé sur la route `cyberdesk.safe-digitalisation.fr/*`, injecte sur chaque réponse HTML :
`X-Frame-Options: DENY` + `frame-ancestors 'none'` dans la CSP HTTP.

**Preuve.** `curl -I https://cyberdesk.safe-digitalisation.fr/` → `x-frame-options: DENY` et CSP contenant `frame-ancestors 'none'`.

## F-003 — En-têtes HTTP manquants + cache des pages sensibles

**Correctif (Worker).**
- `Strict-Transport-Security` (HSTS) — *voir note ci-dessous*.
- `X-Content-Type-Options: nosniff`.
- `Referrer-Policy: strict-origin-when-cross-origin`.
- `Permissions-Policy: camera=(), microphone=(), geolocation=(), payment=(self)`.
- `Cross-Origin-Opener-Policy: same-origin`.
- `Cache-Control: no-store` sur les pages à données sensibles (`/`, retours de paiement avec `session_id` dans l'URL, `avis-client.html` avec token).
- Suppression des bannières `X-Powered-By` / `Server`.

**Note HSTS.** La prod renvoie `max-age=15552000` (180 j) et non les `31536000` (1 an) du Worker : un réglage HSTS au **niveau edge Cloudflare** prime sur l'en-tête du Worker. Sans impact fonctionnel. Pour viser la *preload list* (hstspreload.org) un jour : régler côté dashboard Cloudflare `max-age` ≥ 1 an + directive `preload`.

**Preuve.** `curl -I` montre les 8 en-têtes ci-dessus en prod.

## F-004 — CORS des Edge Functions

**Problème.** `Access-Control-Allow-Origin: *` sur les Edge Functions (TODO historique).

**Correctif.** `supabase/functions/_shared/cors.ts` : liste blanche explicite, repli sur l'origine de production si l'`Origin` est inconnue.

**⚠️ TODO pré-prod.** La liste blanche contient encore `http://localhost:3000`, `http://localhost:5173`, `http://127.0.0.1:5500` (développement local). **À retirer avant toute ouverture à un tenant externe** — un script sur ces ports locaux pourrait contourner CORS vers les Edge Functions. Risque accepté en bêta fermée (machine connue, JWT requis), inacceptable en multi-tenant.

## F-005 — XSS formulaire de diagnostic public

**Problème.** `assets/js/mission-cyber.js` (`genPDF()`) interpolait les champs libres `nom`/`email`/`entreprise`/`téléphone` bruts dans un HTML écrit via `document.write()` dans une fenêtre `about:blank` — fenêtre **sans en-tête CSP**, donc un `<script>` ou `<img onerror>` saisi s'y exécutait. Page publique = saisie non fiable.

**Correctif.** Ajout d'un helper `esc()` (mêmes règles que `escapeHtml` de `supabase.client.js`) appliqué aux 4 champs dans le titre, le bloc prospect et la mention de consentement. Le vecteur email était déjà couvert côté serveur (`cyberdesk-send-audit-email` échappe via `esc()`).

**Preuve.** Saisir `<b>test</b>` dans le champ Nom → le PDF affiche le texte littéral.

---

## Parcours audités sans finding

**Authentification.** Lecture synchrone du hash d'URL dans `supabase.client.js` pour éliminer la course sur la session de récupération (sinon accès direct au dashboard sans passer par « nouveau mot de passe »). Magic-link protégé par limite de débit serveur (`cyberdesk_check_rate_limit()`) + garde d'éligibilité module. Mot de passe oublié via Brevo, réponse générique anti-énumération.

**IDOR.** `canAccessLead()` (`_shared/lead-access.ts`) impose créateur-ou-admin côté serveur sur toutes les Edge Functions en `service_role` (qui contournent la RLS). Les RPC de reporting (`010_accounting_scope.sql`) forcent `created_by = auth.uid()` pour un non-admin **quel que soit le `p_user_id` passé** — pas d'escalade par paramètre. `client_token` = UUID non énumérable, jamais exploité en RLS `anon`.

**CSRF.** Neutralisé structurellement : le JWT Supabase est en `localStorage` et envoyé par en-tête `Authorization`/`apikey`, pas par cookie → aucun credential ambiant exploitable. Les endpoints publics `--no-verify-jwt` sont protégés par token (avis) + limite de débit (emails). Aucune mutation d'état en GET.

---

## État de déploiement (2026-10-03/04)

| Composant | État |
|-----------|------|
| Frontend app (F-001, F-003 meta, F-004, F-005) | Mergé `main` → GitHub Pages ✅ |
| Cloudflare Worker (F-002, F-003 en-têtes HTTP) | Déployé + route live ✅ |
| Pages `aide/` strictes (F-001 reliquat) | PR #2 — en attente de merge + rebuild Pages |

**Incident de séquencement (résolu).** Le Worker (CSP HTTP stricte) a été déployé avant le merge du frontend refactorisé : pendant ~5 min, la prod servait l'ancien `index.html` (scripts inline) sous CSP stricte → app cassée. Résolu par le merge + rebuild Pages. **Leçon : déployer le frontend refactorisé AVANT (ou avec) le resserrement de la CSP HTTP correspondante.**

## Reste à faire (non bloquant)

- [ ] Merger PR #2 (pages `aide/`) puis vérifier la prod.
- [ ] **F-004** : retirer les origines `localhost` de `cors.ts` avant tout tenant externe.
- [ ] HSTS preload : régler côté edge Cloudflare (`max-age` ≥ 1 an + `preload`) si visé.
- [ ] Worker : optionnellement étendre la CSP stricte aux chemins `/aide/*` **après** déploiement de PR #2 (éviter le piège de séquencement F-001).
- [ ] Soumettre le domaine à hstspreload.org (dépend du point HSTS ci-dessus).
