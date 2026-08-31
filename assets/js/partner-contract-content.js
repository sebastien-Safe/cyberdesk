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

   Piste Mandataire  → 4 documents à signer : NDA, DPA, Clause de
     sous-traitance, Annexe "Frais de déplacement". Piste Associé SEP →
     1 document : Statuts SEP.
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
Charte d'engagement des prestataires Cybermalveillance.gouv.fr v2.5.

Les modalités de prise en charge et de reversement des frais de déplacement
engagés par le mandataire dans le cadre de ses interventions sur site sont
régies par l'Annexe "Frais de déplacement", qui fait partie intégrante du
présent accord.`,
    },
    {
      key: 'annexe_frais_deplacement', version: 'v1', title: 'Annexe — Frais de déplacement',
      buildText: (f) => `[PLACEHOLDER — à valider par un juriste avant mise en production]

La présente Annexe est conclue en application et en complément de la Clause
de sous-traitance liant les Parties. Elle a pour objet exclusif de définir
les conditions de prise en charge, de facturation et de règlement des frais
de déplacement engagés par le mandataire ${_pcNa(f.first_name)} ${_pcNa(f.last_name)}
(${_pcNa(f.billing_name)}, SIRET ${_pcNa(f.siret)}) dans le cadre de ses
interventions sur site pour le compte des clients de la plateforme
S@FE CYBER PILOT. Les modalités relatives à la commission sur chiffre
d'affaires demeurent régies exclusivement par la Clause de sous-traitance.

Article 1 — Absence d'avance de trésorerie et barème. Le mandataire n'a
aucune avance de trésorerie à faire au titre de ses frais de déplacement.
Il détermine et met à jour librement son propre barème (forfait de base et
coefficient kilométrique) depuis son espace personnel sur la plateforme.

Article 2 — Collecte et clôture du dossier. La victime règle à S@FE, avant
tout déplacement du mandataire, l'intégralité des frais de déplacement
calculés selon ce barème. Les sommes collectées deviennent éligibles au
reversement dès la clôture du dossier, laquelle intervient soit par le
dépôt d'un avis de satisfaction par la victime, soit, à défaut, de plein
droit à l'expiration d'un délai de quinze (15) jours calendaires suivant
la fin de l'intervention, en l'absence de toute réclamation formalisée
durant ce délai.

Article 3 — Facturation. En fin de mois, S@FE transmet au mandataire un
bordereau récapitulatif des dossiers clos sur la période (montant des
frais de déplacement validés, TVA applicable, solde dû). Ce bordereau est
un document de calcul et de contrôle ; il ne constitue en aucun cas une
convention d'autofacturation au sens de l'article 289 du Code général des
impôts. Sur cette base, le mandataire établit et transmet à S@FE sa propre
facture du solde, sous sa responsabilité juridique, fiscale et facturière,
en appliquant le régime de TVA qui lui est légalement applicable.

Article 4 — Délai de paiement. Par dérogation expresse au délai supplétif
de l'article L. 441-10 du Code de commerce, S@FE s'engage à régler la
facture du mandataire dans un délai de dix (10) jours ouvrés à compter de
sa réception, par virement sur le compte dont les coordonnées ont été
renseignées par le mandataire sur son espace personnel.

Article 5 — Vigilance et lutte contre le travail dissimulé. Conformément
aux articles L. 8222-1 et suivants du Code du travail, S@FE vérifie le
statut d'indépendant du mandataire (SIRET actif, immatriculation en cours
de validité) avant tout premier reversement, puis selon la périodicité
prévue par l'article R. 8222-1 dès lors que les sommes versées au
mandataire (commission et frais de déplacement inclus) atteignent le
seuil légal annuel. Le mandataire s'engage à fournir à S@FE, à première
demande, les justificatifs requis par la réglementation.`,
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
