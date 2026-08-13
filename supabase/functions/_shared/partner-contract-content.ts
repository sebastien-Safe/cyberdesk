// ==========================================================================
// S@FE CYBER PILOT — Contenu des documents du tunnel d'onboarding partenaire.
//
// ⚠️ TEXTE PLACEHOLDER — PAS DE VALEUR JURIDIQUE EN L'ÉTAT. Structure
// technique uniquement (insertion des champs collectés lors du tunnel), à
// faire relire et valider par un juriste avant toute activation réelle du
// parcours de signature (cyberdesk_feature_flags.contract_gate). Le contrat
// de mandat, la convention de société en participation, le NDA et le DPA
// engagent l'entreprise et ne doivent pas être rédigés par un outil de
// développement.
//
// Piste Mandataire  → 3 documents distincts à signer : NDA, DPA (Art. 28
//   RGPD, Annexe A), Clause de sous-traitance compatible Cybermalveillance.
// Piste Associé SEP → 1 document : Statuts SEP (son Article 11 couvre déjà
//   secret professionnel/RGPD pour cette piste — pas de NDA/DPA/Clause
//   redondants, décision produit actée).
//
// Copie miroir de _shared/cyber-system-prompt.ts : un seul fichier ici, pas
// de copie navigateur (le texte n'est utilisé que côté serveur, pour le
// hash et l'e-mail de confirmation — le client l'affiche en le récupérant
// via l'Edge Function, voir assets/js/partner-contract.js).
// ==========================================================================

export type RemunerationStatus = "mandataire" | "associe_sep";
export type DocumentKey = "nda" | "dpa" | "clause_sous_traitance" | "sep_statuts";

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
  version: "v1",
  title: "Accord de confidentialité (NDA)",
  buildText: (f) => `
[PLACEHOLDER — à valider par un juriste avant mise en production]

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
  version: "v1",
  title: "Accord de traitement des données (DPA — Article 28 RGPD)",
  buildText: (f) => `
[PLACEHOLDER — à valider par un juriste avant mise en production]

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
  version: "v1",
  title: "Clause de sous-traitance (compatible Charte Cybermalveillance.gouv.fr v2.5)",
  buildText: (f) => `
[PLACEHOLDER — à valider par un juriste avant mise en production]

Le mandataire ${na(f.first_name)} ${na(f.last_name)} (${na(f.billing_name)},
SIRET ${na(f.siret)}) perçoit une commission égale à {PCT}% du chiffre
d'affaires Hors Taxes encaissé sur les dossiers dont il est le propriétaire
au sein de S@FE CYBER PILOT, facturée à S@FE selon les modalités habituelles
entre professionnels. Il s'engage à respecter le périmètre d'intervention,
la transparence vis-à-vis du bénéficiaire, les engagements éthiques et
déontologiques et la conservation des traces numériques définis par la
Charte d'engagement des prestataires Cybermalveillance.gouv.fr v2.5.
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
  mandataire: [NDA, DPA, CLAUSE_SOUS_TRAITANCE],
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
