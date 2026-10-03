/**
 * S@FE CYBER PILOT — Cloudflare Worker : en-têtes de sécurité HTTP
 *
 * GitHub Pages ne permet pas de servir des en-têtes HTTP personnalisés.
 * Ce Worker est déployé en route Cloudflare sur le domaine
 * cyberdesk.safe-digitalisation.fr/* et injecte les en-têtes de sécurité
 * manquants sur chaque réponse HTML.
 *
 * Déploiement :
 *   1. wrangler login
 *   2. wrangler deploy  (depuis le dossier cloudflare/)
 *   3. Dans le Dashboard Cloudflare → Workers & Pages → cyberdesk-security-headers
 *      → Settings → Routes : ajouter cyberdesk.safe-digitalisation.fr/*
 *
 * À CHAQUE MODIFICATION du fichier : incrémenter la version de déploiement
 * dans wrangler.toml et redéployer.
 */

// CSP sans unsafe-inline pour index.html (le script inline a été migré vers
// assets/js/main.js + assets/js/event-bindings.js). Les autres pages gardent
// unsafe-inline via leur propre <meta CSP> tant que leurs scripts inline
// n'ont pas été extraits — l'en-tête HTTP ici est le plus strict commun.
const CSP_INDEX = [
  "default-src 'self'",
  "script-src 'self' https://cdn.jsdelivr.net",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  "connect-src 'self' https://bgkijldrmdhklkadkeua.supabase.co wss://bgkijldrmdhklkadkeua.supabase.co",
  "frame-src 'none'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  "upgrade-insecure-requests",
].join('; ');

// CSP pour les autres pages HTML (encore avec unsafe-inline côté meta,
// mais l'en-tête HTTP restreint le wildcard https: et ajoute les directives
// manquantes).
const CSP_GENERIC = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  "connect-src 'self' https://bgkijldrmdhklkadkeua.supabase.co wss://bgkijldrmdhklkadkeua.supabase.co",
  "frame-src 'none'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  "upgrade-insecure-requests",
].join('; ');

export default {
  async fetch(request) {
    const response = await fetch(request);
    const url = new URL(request.url);
    const path = url.pathname;

    // N'injecte des en-têtes que sur les réponses HTML (pas les assets JS/CSS/images).
    const ct = response.headers.get('content-type') || '';
    if (!ct.includes('text/html')) return response;

    const headers = new Headers(response.headers);

    // CSP stricte pour index.html (le script inline y a été retiré).
    const isIndex = path === '/' || path === '/index.html';
    headers.set('Content-Security-Policy', isIndex ? CSP_INDEX : CSP_GENERIC);

    // Protection clickjacking — complémentaire à frame-ancestors dans la CSP
    // (XFO reste utile pour les navigateurs anciens qui ne supportent pas CSP).
    headers.set('X-Frame-Options', 'DENY');

    // Prévient le MIME-sniffing (lecture d'un fichier JS comme HTML).
    headers.set('X-Content-Type-Options', 'nosniff');

    // Ne transmet pas le Referer complet en cross-origin ; garde le chemin
    // complet en same-origin pour les analytics internes.
    headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');

    // Désactive les fonctionnalités navigateur inutiles ; autorise payment
    // uniquement sur l'origine self (Stripe Checkout redirige, pas d'iframe).
    headers.set(
      'Permissions-Policy',
      'camera=(), microphone=(), geolocation=(), payment=(self)',
    );

    // Isole le contexte de navigation ; empêche les attaques Spectre
    // cross-origin (requis pour SharedArrayBuffer, non utilisé ici,
    // mais bonne hygiène).
    headers.set('Cross-Origin-Opener-Policy', 'same-origin');

    // HSTS : force HTTPS pour 1 an y compris les sous-domaines.
    // À activer dès que le domaine est servi exclusivement en HTTPS
    // (déjà le cas via Cloudflare). Prévoir la soumission à la HSTS
    // preload list (hstspreload.org) pour une protection complète.
    headers.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');

    // Supprime les bannières de version des serveurs intermédiaires.
    headers.delete('X-Powered-By');
    headers.delete('Server');

    // Les pages authentifiées ne doivent pas être mises en cache.
    if (isIndex) {
      headers.set('Cache-Control', 'no-store');
    }

    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers,
    });
  },
};
