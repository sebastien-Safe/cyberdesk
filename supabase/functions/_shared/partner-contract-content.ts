// ==========================================================================
// S@FE CYBER PILOT — Contenu du document contractuel "Rémunération partenaires"
// (statut Mandataire ou Associé SEP), signé électroniquement lors de
// l'intégration (cyberdesk-verify-signature).
//
// ⚠️ TEXTE PLACEHOLDER — PAS DE VALEUR JURIDIQUE EN L'ÉTAT. Structure
// technique uniquement (insertion du statut/taux), à faire relire et
// valider par un juriste avant toute activation réelle du parcours de
// signature (cyberdesk_feature_flags.contract_gate). Les clauses de mandat
// commercial et de société en participation engagent l'entreprise et ne
// doivent pas être rédigées par un outil de développement.
//
// Copie miroir de _shared/cyber-system-prompt.ts / cyber-ai-system-prompt.js :
// un seul fichier ici, pas de copie navigateur (le texte n'est utilisé que
// côté serveur, pour le hash et l'e-mail de confirmation — le client
// l'affiche en le récupérant, voir partner-contract.js).
// ==========================================================================

export const PARTNER_CONTRACT_VERSION = "v1";

export type RemunerationStatus = "mandataire" | "associe_sep";

const TITLES: Record<RemunerationStatus, string> = {
  mandataire: "Contrat de mandat commercial — rémunération à la commission",
  associe_sep: "Convention de société en participation — répartition du résultat",
};

const BODIES: Record<RemunerationStatus, string> = {
  mandataire: `
[PLACEHOLDER — à valider par un juriste avant mise en production]

Le mandataire perçoit une commission égale à {PCT}% du chiffre d'affaires
Hors Taxes encaissé sur les dossiers dont il est le propriétaire au sein de
S@FE CYBER PILOT. Cette commission fait l'objet d'une facturation par le
mandataire à S@FE, selon les modalités habituelles de facturation entre
professionnels.
`.trim(),
  associe_sep: `
[PLACEHOLDER — à valider par un juriste avant mise en production]

Dans le cadre de la société en participation, l'associé perçoit une
quote-part du résultat égale à {PCT}% du chiffre d'affaires Hors Taxes
encaissé sur les dossiers dont il est le propriétaire au sein de S@FE CYBER PILOT.
Cette quote-part est calculée et versée automatiquement, sans émission de
facture par l'associé.
`.trim(),
};

/** Texte canonique signé — sert à la fois d'affichage et de base du hash d'intégrité (doc_hash). */
export function buildContractText(status: RemunerationStatus, pct: number): string {
  const body = BODIES[status].replace("{PCT}", pct.toFixed(2));
  return `${TITLES[status]} (version ${PARTNER_CONTRACT_VERSION})\n\n${body}`;
}
