// ==========================================================================
// S@FE CYBER PILOT — Pseudonymisation du texte libre avant envoi à Anthropic
// Masque par expressions régulières les motifs identifiables (email,
// téléphone, IBAN, numéro de sécurité sociale, numéro de carte) et
// substitue le nom connu de la victime par "la victime".
//
// Limite documentée (registre de traitement S@FE CYBER PILOT) : un tiers non
// identifié mentionné nommément dans un champ libre (ex. l'agresseur,
// un témoin) n'est pas détecté — cela nécessiterait une détection
// d'entités nommées, hors périmètre de cette implémentation.
// ==========================================================================

const EMAIL_RE = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
// \b ne fonctionne pas juste avant "+" (ni "+" ni l'espace qui précède ne
// sont des caractères de mot, donc pas de frontière détectée) — la
// variante "0..." garde \b (0 est un caractère de mot), la variante
// "+33..." s'appuie sur le littéral distinctif à la place.
const PHONE_RE = /(?:\+33[\s.-]?|\b0)[1-9](?:[\s.-]?\d{2}){4}\b/g;
const IBAN_RE = /\bFR\d{2}(?:[ ]?[0-9A-Z]{4}){5}[ ]?[0-9A-Z]{3}\b/gi;
const CARD_RE = /\b\d{4}[ -]?\d{4}[ -]?\d{4}[ -]?\d{1,4}\b/g;
const NIR_RE = /\b[12]\d{2}(?:0[1-9]|1[0-2])(?:\d{2}|2[AB])\d{3}\d{3}(?:\d{2})?\b/gi;

/** Masque les motifs de données identifiables (regex, best effort). */
export function redactPii(text: string | null | undefined): string {
  if (!text) return "";
  return text
    .replace(IBAN_RE, "[IBAN masqué]")
    .replace(NIR_RE, "[numéro de sécurité sociale masqué]")
    .replace(CARD_RE, "[numéro de carte masqué]")
    .replace(EMAIL_RE, "[email masqué]")
    .replace(PHONE_RE, "[téléphone masqué]");
}

/** Remplace le nom connu de la victime (prénom/nom du dossier) par "la victime". */
export function redactKnownName(
  text: string | null | undefined,
  firstName?: string | null,
  lastName?: string | null,
): string {
  if (!text) return "";
  let out = text;
  const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const first = (firstName || "").trim();
  const last = (lastName || "").trim();

  if (first && last) {
    out = out.replace(new RegExp(`\\b${esc(first)}\\s+${esc(last)}\\b`, "gi"), "la victime");
    out = out.replace(new RegExp(`\\b${esc(last)}\\s+${esc(first)}\\b`, "gi"), "la victime");
  }
  if (first) out = out.replace(new RegExp(`\\b${esc(first)}\\b`, "gi"), "la victime");
  if (last) out = out.replace(new RegExp(`\\b${esc(last)}\\b`, "gi"), "la victime");

  return out;
}

/**
 * Applique les deux passes de pseudonymisation à un champ de texte libre.
 * Ordre important : les motifs structurés (email, téléphone...) sont
 * masqués AVANT la substitution du nom — sinon un nom de famille présent
 * dans une adresse email (ex. "jean.dupont@gmail.com") est fragmenté par
 * le remplacement et casse la détection de l'email par la regex suivante.
 */
export function pseudonymize(
  text: string | null | undefined,
  firstName?: string | null,
  lastName?: string | null,
): string {
  const afterPii = redactPii(text);
  const afterName = redactKnownName(afterPii, firstName, lastName);
  // "Mme la victime" / "M. la victime" → "la victime" (lisibilité, la
  // civilité seule ne réidentifie pas mais alourdit inutilement le texte).
  return afterName.replace(/\b(?:Mme|Mlle|M\.|Monsieur|Madame)\s+la victime\b/gi, "la victime");
}
