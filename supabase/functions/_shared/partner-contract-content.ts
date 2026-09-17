// ==========================================================================
// S@FE CYBER PILOT — Contenu des documents du tunnel d'onboarding partenaire.
//
// Piste Mandataire → 4 documents distincts à signer : NDA, DPA (Art. 28
//   RGPD, Annexe A), Clause de sous-traitance compatible Cybermalveillance,
//   Annexe "Frais de déplacement" (bordereau, délai de paiement, vigilance
//   SIRET — ajoutée le 2026-08-24, hors périmètre SEP). Texte validé par un
//   juriste le 2026-09-17, passé en version v2 (les signatures v1
//   antérieures, effectuées sur le texte placeholder, restent historiques —
//   voir cyberdesk_partner_contracts — et redemandent une signature v2).
//
// ⚠️ Piste Associé SEP → 1 document : Statuts SEP (son Article 11 couvre
//   déjà secret professionnel/RGPD pour cette piste — pas de NDA/DPA/Clause
//   redondants, décision produit actée). TEXTE ENCORE PLACEHOLDER, pas de
//   valeur juridique en l'état, à faire relire et valider par un juriste
//   avant toute activation réelle du parcours de signature pour cette piste
//   (cyberdesk_feature_flags.contract_gate). Le contrat de mandat, la
//   convention de société en participation, le NDA et le DPA engagent
//   l'entreprise et ne doivent pas être rédigés par un outil de
//   développement.
//
// Copie miroir de _shared/cyber-system-prompt.ts : un seul fichier ici, pas
// de copie navigateur (le texte n'est utilisé que côté serveur, pour le
// hash et l'e-mail de confirmation — le client l'affiche en le récupérant
// via l'Edge Function, voir assets/js/partner-contract.js).
// ==========================================================================

export type RemunerationStatus = "mandataire" | "associe_sep";
export type DocumentKey = "nda" | "dpa" | "clause_sous_traitance" | "annexe_frais_deplacement" | "sep_statuts";

/** Champs collectés lors du tunnel d'onboarding, utilisés pour composer le texte des documents. */
export interface OnboardingFields {
  first_name?: string | null;
  last_name?: string | null;
  billing_name?: string | null;
  siret?: string | null;
  billing_address?: string | null;
  sep_structure_nom?: string | null;
  sep_structure_forme_juridique?: string | null;
  sep_structure_siret?: string | null;
  sep_structure_adresse?: string | null;
  sep_taux_apurement_pct?: number | null;
}

export interface PartnerDocument {
  key: DocumentKey;
  version: string;
  title: string;
  buildText(fields: OnboardingFields, pct: number): string;
}

const na = (v: string | null | undefined) => (v && v.trim()) || "[à compléter]";

const NDA: PartnerDocument = {
  key: "nda",
  version: "v2",
  title: "Accord de confidentialité (NDA)",
  buildText: (f) => `
ACCORD DE CONFIDENTIALITÉ entre S@FE SAS et ${na(f.first_name)} ${na(f.last_name)}
(${na(f.billing_name)}), dans le cadre de la collaboration pour des missions
d'assistance aux victimes de cybermalveillance (référencement S@FE SAS sur
Cybermalveillance.gouv.fr / 17Cyber). Le signataire s'engage à ne divulguer
aucune information confidentielle (données victimes, tarifs, méthodes
d'intervention, informations sur les partenaires) à un tiers, sans l'accord
écrit préalable de S@FE SAS.
`.trim(),
};

const DPA: PartnerDocument = {
  key: "dpa",
  version: "v2",
  title: "Accord de traitement des données (DPA — Article 28 RGPD)",
  buildText: (f) => `
ACCORD DE TRAITEMENT DES DONNÉES conclu conformément à l'article 28 du RGPD
entre S@FE SAS (responsable de traitement) et ${na(f.first_name)} ${na(f.last_name)}
(${na(f.billing_name)}, SIRET ${na(f.siret)}), agissant en qualité de
sous-traitant, dans le cadre des interventions d'assistance aux victimes de
cybermalveillance. Le sous-traitant ne traite les données personnelles que
sur instruction documentée de S@FE SAS, met en œuvre les mesures de sécurité
appropriées, et notifie toute violation de données dans un délai maximum de
24 heures.
`.trim(),
};

const CLAUSE_SOUS_TRAITANCE: PartnerDocument = {
  key: "clause_sous_traitance",
  version: "v2",
  title: "Clause de sous-traitance (compatible Charte Cybermalveillance.gouv.fr v2.5)",
  buildText: (f) => `
Le mandataire ${na(f.first_name)} ${na(f.last_name)} (${na(f.billing_name)},
SIRET ${na(f.siret)}) perçoit une commission égale à {PCT}% du chiffre
d'affaires Hors Taxes encaissé sur les dossiers dont il est le propriétaire
au sein de S@FE CYBER PILOT, facturée à S@FE selon les modalités habituelles
entre professionnels. Il s'engage à respecter le périmètre d'intervention,
la transparence vis-à-vis du bénéficiaire, les engagements éthiques et
déontologiques et la conservation des traces numériques définis par la
Charte d'engagement des prestataires Cybermalveillance.gouv.fr v2.5.

Les modalités de prise en charge et de reversement des frais de déplacement
engagés par le mandataire dans le cadre de ses interventions sur site sont
régies par l'Annexe "Frais de déplacement", qui fait partie intégrante du
présent accord.
`.trim(),
};

const ANNEXE_FRAIS_DEPLACEMENT: PartnerDocument = {
  key: "annexe_frais_deplacement",
  version: "v2",
  title: "Annexe — Frais de déplacement",
  buildText: (f) => `
La présente Annexe est conclue en application et en complément de la Clause
de sous-traitance liant les Parties. Elle a pour objet exclusif de définir
les conditions de prise en charge, de facturation et de règlement des frais
de déplacement engagés par le mandataire ${na(f.first_name)} ${na(f.last_name)}
(${na(f.billing_name)}, SIRET ${na(f.siret)}) dans le cadre de ses
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
demande, les justificatifs requis par la réglementation.
`.trim(),
};

const SEP_STATUTS: PartnerDocument = {
  key: "sep_statuts",
  version: "v1",
  title: "Statuts de la Société en Participation (SEP) S@FE Cyber Pilot",
  buildText: (f, pct) => `
[PLACEHOLDER — à valider par un juriste avant mise en production]

STATUTS DE LA SOCIÉTÉ EN PARTICIPATION entre S@FE SAS (Associé Gérant) et
${na(f.sep_structure_nom)} (${na(f.sep_structure_forme_juridique)}, SIRET
${na(f.sep_structure_siret)}, siège ${na(f.sep_structure_adresse)}),
représentée par ${na(f.first_name)} ${na(f.last_name)} (Associé Participant
/ Directeur d'Agence). Répartition des résultats : ${pct.toFixed(2)}% à
l'Associé Participant, solde à l'Associé Gérant. Taux d'apurement du droit
d'entrée choisi : ${f.sep_taux_apurement_pct ?? "[à compléter]"}%. Zone
d'exclusivité territoriale de 50 km autour du siège de l'établissement
secondaire.
`.trim(),
};

export const DOCUMENTS_BY_STATUS: Record<RemunerationStatus, PartnerDocument[]> = {
  mandataire: [NDA, DPA, CLAUSE_SOUS_TRAITANCE, ANNEXE_FRAIS_DEPLACEMENT],
  associe_sep: [SEP_STATUTS],
};

export function getDocumentsForStatus(status: RemunerationStatus): PartnerDocument[] {
  return DOCUMENTS_BY_STATUS[status];
}

export function getDocument(status: RemunerationStatus, documentKey: DocumentKey): PartnerDocument | undefined {
  return DOCUMENTS_BY_STATUS[status].find((d) => d.key === documentKey);
}

/** Texte canonique signé — sert à la fois d'affichage et de base du hash d'intégrité (doc_hash). */
export function buildDocumentText(
  status: RemunerationStatus,
  documentKey: DocumentKey,
  fields: OnboardingFields,
  pct: number,
): string {
  const doc = getDocument(status, documentKey);
  if (!doc) throw new Error("unknown_document");
  const body = doc.buildText(fields, pct).replace("{PCT}", pct.toFixed(2));
  return `${doc.title} (version ${doc.version})\n\n${body}`;
}
