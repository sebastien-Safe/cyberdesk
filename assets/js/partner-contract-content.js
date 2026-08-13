/* ============================================================
   S@FE CYBER PILOT — Contenu des documents du tunnel d'onboarding
   partenaire (copie navigateur, affichage uniquement).

   ⚠️ N'est PAS la source de vérité — le hash d'intégrité (doc_hash)
   est calculé côté serveur par cyberdesk-verify-signature à partir
   de supabase/functions/_shared/partner-contract-content.ts, qui
   fait foi. Ce fichier ne sert qu'à afficher le texte avant
   signature — à garder synchronisé avec la copie serveur (même
   patron que cyber-system-prompt.ts / cyber-ai-system-prompt.js).

   ⚠️ TEXTE PLACEHOLDER — pas de valeur juridique en l'état, à faire
   valider par un juriste avant toute activation réelle du parcours
   de signature.

   Piste Mandataire  → 3 documents à signer : NDA, DPA, Clause de
     sous-traitance. Piste Associé SEP → 1 document : Statuts SEP.
   ============================================================ */

function _pcNa(v) { return (v && String(v).trim()) || '[à compléter]'; }

const PARTNER_DOCUMENTS_BY_STATUS = {
  mandataire: [
    {
      key: 'nda', version: 'v1', title: 'Accord de confidentialité (NDA)',
      buildText: (f) => `[PLACEHOLDER — à valider par un juriste avant mise en production]

ACCORD DE CONFIDENTIALITÉ entre S@FE SAS et ${_pcNa(f.first_name)} ${_pcNa(f.last_name)}
(${_pcNa(f.billing_name)}), dans le cadre de la collaboration pour des missions
d'assistance aux victimes de cybermalveillance (référencement S@FE SAS sur
Cybermalveillance.gouv.fr / 17Cyber). Le signataire s'engage à ne divulguer
aucune information confidentielle (données victimes, tarifs, méthodes
d'intervention, informations sur les partenaires) à un tiers, sans l'accord
écrit préalable de S@FE SAS.`,
    },
    {
      key: 'dpa', version: 'v1', title: 'Accord de traitement des données (DPA — Article 28 RGPD)',
      buildText: (f) => `[PLACEHOLDER — à valider par un juriste avant mise en production]

ACCORD DE TRAITEMENT DES DONNÉES conclu conformément à l'article 28 du RGPD
entre S@FE SAS (responsable de traitement) et ${_pcNa(f.first_name)} ${_pcNa(f.last_name)}
(${_pcNa(f.billing_name)}, SIRET ${_pcNa(f.siret)}), agissant en qualité de
sous-traitant, dans le cadre des interventions d'assistance aux victimes de
cybermalveillance. Le sous-traitant ne traite les données personnelles que
sur instruction documentée de S@FE SAS, met en œuvre les mesures de sécurité
appropriées, et notifie toute violation de données dans un délai maximum de
24 heures.`,
    },
    {
      key: 'clause_sous_traitance', version: 'v1', title: 'Clause de sous-traitance (compatible Charte Cybermalveillance.gouv.fr v2.5)',
      buildText: (f) => `[PLACEHOLDER — à valider par un juriste avant mise en production]

Le mandataire ${_pcNa(f.first_name)} ${_pcNa(f.last_name)} (${_pcNa(f.billing_name)},
SIRET ${_pcNa(f.siret)}) perçoit une commission égale à {PCT}% du chiffre
d'affaires Hors Taxes encaissé sur les dossiers dont il est le propriétaire
au sein de S@FE CYBER PILOT, facturée à S@FE selon les modalités habituelles
entre professionnels. Il s'engage à respecter le périmètre d'intervention,
la transparence vis-à-vis du bénéficiaire, les engagements éthiques et
déontologiques et la conservation des traces numériques définis par la
Charte d'engagement des prestataires Cybermalveillance.gouv.fr v2.5.`,
    },
  ],
  associe_sep: [
    {
      key: 'sep_statuts', version: 'v1', title: 'Statuts de la Société en Participation (SEP) S@FE Cyber Pilot',
      buildText: (f, pct) => `[PLACEHOLDER — à valider par un juriste avant mise en production]

STATUTS DE LA SOCIÉTÉ EN PARTICIPATION entre S@FE SAS (Associé Gérant) et
${_pcNa(f.sep_structure_nom)} (${_pcNa(f.sep_structure_forme_juridique)}, SIRET
${_pcNa(f.sep_structure_siret)}, siège ${_pcNa(f.sep_structure_adresse)}),
représentée par ${_pcNa(f.first_name)} ${_pcNa(f.last_name)} (Associé Participant
/ Directeur d'Agence). Répartition des résultats : ${Number(pct).toFixed(2)}% à
l'Associé Participant, solde à l'Associé Gérant. Taux d'apurement du droit
d'entrée choisi : ${f.sep_taux_apurement_pct != null ? f.sep_taux_apurement_pct : '[à compléter]'}%. Zone
d'exclusivité territoriale de 50 km autour du siège de l'établissement
secondaire.`,
    },
  ],
};

function getPartnerDocumentsForStatus(status) {
  return PARTNER_DOCUMENTS_BY_STATUS[status] || [];
}

function getPartnerDocument(status, documentKey) {
  return getPartnerDocumentsForStatus(status).find(d => d.key === documentKey);
}

/** Texte affiché avant signature — doit rester identique au calcul serveur du doc_hash. */
function buildPartnerDocumentText(status, documentKey, fields, pct) {
  const doc = getPartnerDocument(status, documentKey);
  if (!doc) return '';
  const body = doc.buildText(fields || {}, pct).replace('{PCT}', Number(pct).toFixed(2));
  return `${doc.title} (version ${doc.version})\n\n${body}`;
}
