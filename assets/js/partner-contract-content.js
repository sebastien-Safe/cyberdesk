/* ============================================================
   CyberDesk — Contenu du document contractuel "Rémunération
   partenaires" (copie navigateur, affichage uniquement).

   ⚠️ N'est PAS la source de vérité — le hash d'intégrité (doc_hash)
   est calculé côté serveur par cyberdesk-verify-signature à partir
   de supabase/functions/_shared/partner-contract-content.ts, qui
   fait foi. Ce fichier ne sert qu'à afficher le texte avant
   signature — à garder synchronisé avec la copie serveur (même
   patron que cyber-system-prompt.ts / cyber-ai-system-prompt.js).

   ⚠️ TEXTE PLACEHOLDER — pas de valeur juridique en l'état, à faire
   valider par un juriste avant toute activation réelle du parcours
   de signature.
   ============================================================ */

const PARTNER_CONTRACT_VERSION = 'v1';

const PARTNER_CONTRACT_TITLES = {
  mandataire: "Contrat de mandat commercial — rémunération à la commission",
  associe_sep: "Convention de société en participation — répartition du résultat",
};

const PARTNER_CONTRACT_BODIES = {
  mandataire:
    "[PLACEHOLDER — à valider par un juriste avant mise en production]\n\n" +
    "Le mandataire perçoit une commission égale à {PCT}% du chiffre d'affaires " +
    "Hors Taxes encaissé sur les dossiers dont il est le propriétaire au sein de " +
    "CyberDesk. Cette commission fait l'objet d'une facturation par le mandataire " +
    "à S@FE, selon les modalités habituelles de facturation entre professionnels.",
  associe_sep:
    "[PLACEHOLDER — à valider par un juriste avant mise en production]\n\n" +
    "Dans le cadre de la société en participation, l'associé perçoit une quote-part " +
    "du résultat égale à {PCT}% du chiffre d'affaires Hors Taxes encaissé sur les " +
    "dossiers dont il est le propriétaire au sein de CyberDesk. Cette quote-part " +
    "est calculée et versée automatiquement, sans émission de facture par l'associé.",
};

/** Texte affiché avant signature — doit rester identique au calcul serveur du doc_hash. */
function buildPartnerContractText(status, pct) {
  const body = PARTNER_CONTRACT_BODIES[status].replace('{PCT}', Number(pct).toFixed(2));
  return `${PARTNER_CONTRACT_TITLES[status]} (version ${PARTNER_CONTRACT_VERSION})\n\n${body}`;
}
