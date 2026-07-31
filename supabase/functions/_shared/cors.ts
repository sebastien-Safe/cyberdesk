// ==========================================================================
// CyberDesk — CORS restreint aux origines connues du frontend.
// Remplace le précédent "Access-Control-Allow-Origin: *" (TODO historique
// présent dans chaque fonction) par une liste blanche, avec repli sur
// l'origine de production si l'en-tête Origin de la requête ne correspond
// à rien de connu (comportement le plus restrictif possible par défaut).
// ==========================================================================

const ALLOWED_ORIGINS = [
  "https://cyberdesk.safe-digitalisation.fr",
  "http://localhost:3000",
  "http://localhost:5173",
  "http://127.0.0.1:5500",
];

export function corsHeaders(req: Request): Record<string, string> {
  const origin = req.headers.get("origin");
  const allowOrigin = origin && ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    "Access-Control-Allow-Origin": allowOrigin,
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Vary": "Origin",
  };
}
