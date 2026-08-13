// ==========================================================================
// CyberDesk — Textes par produit 17Cyber (objet du devis + prestations type)
// Dupliqué depuis assets/victimes17/victimes17-pdf.js (PRODUCT_CONFIG) : contenu
// statique partagé entre le PDF client-side et les Edge Functions docx, pas de
// dépendance runtime entre les deux côtés.
// ==========================================================================

export interface ProductText {
  objet: string;
  /** Prestations type, utilisées comme repli dans le devis tant qu'aucune tâche n'est cochée. */
  prestationsType: string[];
}

export const PRODUCT_TEXTS: Record<string, ProductText> = {
  piratage_compte: {
    objet: "Intervention de sécurisation à distance suite à un piratage de compte en ligne (messagerie, réseaux sociaux, services administratifs) signalé via la plateforme 17Cyber / cybermalveillance.gouv.fr.",
    prestationsType: [
      "Identification des comptes concernés et du vecteur de compromission",
      "Sécurisation du compte et suppression des portes dérobées (règles de transfert, filtres, sessions actives, applications tierces OAuth)",
      "Activation de la double authentification (MFA)",
      "Accompagnement dépôt de plainte / signalement THESEE",
      "Remise du rapport d'intervention et recommandations",
    ],
  },
  hameconnage: {
    objet: "Intervention suite à une campagne d'hameçonnage (phishing) : analyse du courriel et du site frauduleux, sécurisation des accès compromis, signalements et volet données personnelles.",
    prestationsType: [
      "Analyse du courriel et du site frauduleux (en-têtes, WHOIS, SPF/DKIM/DMARC)",
      "Vérification de l'exposition des identifiants (Have I Been Pwned)",
      "Sécurisation des comptes compromis et mise en place d'un gestionnaire de mots de passe",
      "Signalements (Signal Spam, Pharos, organisme usurpé)",
      "Remise du rapport d'intervention et recommandations",
    ],
  },
  faux_support: {
    objet: "Intervention suite à une arnaque au faux support technique : diagnostic du poste, nettoyage, sécurisation des accès et volet judiciaire.",
    prestationsType: [
      "Diagnostic du poste et identification du logiciel de prise en main à distance",
      "Nettoyage antimalware et vérification des accès/extensions suspectes",
      "Accompagnement opposition bancaire si paiement effectué",
      "Accompagnement dépôt de plainte",
      "Remise du rapport d'intervention et recommandations",
    ],
  },
  fuite_donnees: {
    objet: "Intervention suite à une fuite ou violation de données personnelles chez un tiers : identification de la violation, évaluation du risque, conseils de remédiation.",
    prestationsType: [
      "Identification de l'organisme et de la nature des données exposées",
      "Vérification de l'exposition (Have I Been Pwned, veille dark web basique)",
      "Sécurisation des comptes concernés (mot de passe, MFA)",
      "Conseils de remédiation et évaluation d'une notification CNIL le cas échéant",
      "Remise du rapport d'intervention et recommandations",
    ],
  },
  cyberharcelement: {
    objet: "Intervention suite à un cyberharcèlement : documentation et horodatage des preuves, demandes de retrait, accompagnement au dépôt de plainte.",
    prestationsType: [
      "Qualification des faits et identification des plateformes concernées",
      "Documentation et horodatage des preuves (captures certifiées)",
      "Demandes de retrait auprès des plateformes",
      "Accompagnement dépôt de plainte",
      "Remise du rapport d'intervention et recommandations",
    ],
  },
  faux_conseiller: {
    objet: "Intervention suite à une fraude au faux conseiller bancaire : analyse chronologique, documentation pour la banque et les autorités, accompagnement contestation bancaire.",
    prestationsType: [
      "Reconstitution chronologique de l'appel et des opérations réalisées",
      "Accompagnement opposition et contestation bancaire",
      "Documentation pour la banque et les autorités",
      "Accompagnement dépôt de plainte",
      "Remise du rapport d'intervention et recommandations",
    ],
  },
  fraude_cb: {
    objet: "Intervention suite à une fraude à la carte bancaire (paiement à distance) : identification du vecteur probable, documentation pour opposition et remboursement.",
    prestationsType: [
      "Identification du vecteur probable de compromission",
      "Accompagnement opposition à la carte bancaire",
      "Constitution du dossier de contestation bancaire",
      "Remise du rapport d'intervention et recommandations",
    ],
  },
  virus_informatique: {
    objet: "Intervention suite à une infection par virus / ransomware / spyware : diagnostic, évaluation de l'impact, conseils de remédiation, accompagnement à la restauration.",
    prestationsType: [
      "Diagnostic et identification du type de malware",
      "Isolement de l'appareil et analyse antimalware",
      "Évaluation de l'impact et conseils de restauration",
      "Signalement (ANSSI, Police/Gendarmerie)",
      "Remise du rapport d'intervention et recommandations",
    ],
  },
  faux_rib: {
    objet: "Intervention suite à une fraude au virement par faux RIB (BEC — Business Email Compromise) : analyse de la compromission messagerie, documentation chronologique, accompagnement rappel de virement.",
    prestationsType: [
      "Analyse de la compromission de la messagerie",
      "Accompagnement procédure de rappel de virement (SWIFT recall)",
      "Documentation chronologique complète",
      "Accompagnement dépôt de plainte pénale",
      "Sécurisation de la messagerie et des flux financiers",
      "Remise du rapport d'intervention et recommandations",
    ],
  },
};

/** Ordre d'affichage canonique des 9 cas (identique à l'Article 4 des CGS). */
export const PRODUCT_DISPLAY_ORDER = [
  "piratage_compte", "hameconnage", "faux_support", "fuite_donnees", "cyberharcelement",
  "faux_conseiller", "fraude_cb", "virus_informatique", "faux_rib",
];

// ==========================================================================
// Dérivation attack_type → code produit + libellé court, et tarifs
// indicatifs de l'annexe CGS — dupliqués depuis assets/victimes17/
// victimes17.js (ATTACK_TYPE_TO_PRODUCT_CODE), index.html (libellés des
// puces diag-chip) et assets/data/tarifs-cyberdesk.json (clé
// tarifs_indicatifs_cgs) — source unique de vérité tarifaire, à garder
// synchronisée ici manuellement, même patron que PRODUCT_TEXTS ci-dessus.
// ==========================================================================

/** deni_de_service/autre n'ont pas de correspondance — absence volontaire. */
export const ATTACK_TYPE_TO_PRODUCT_CODE: Record<string, string> = {
  hameconnage:         "hameconnage",
  violation_compte:    "piratage_compte",
  ransomware:           "virus_informatique",
  usurpation_identite: "fuite_donnees",
  fraude_telephonique: "faux_support",
  arnaque_virement:    "faux_rib",
  intrusion_reseau:    "virus_informatique",
};

export const ATTACK_TYPE_LABELS: Record<string, string> = {
  hameconnage:         "Hameçonnage",
  ransomware:           "Rançongiciel",
  violation_compte:    "Violation de compte",
  arnaque_virement:    "Arnaque au virement",
  fraude_telephonique: "Fraude téléphonique",
  usurpation_identite: "Usurpation d'identité",
  intrusion_reseau:    "Intrusion réseau",
  deni_de_service:     "Déni de service",
  autre:                "Autre",
};

export interface TariffRow {
  code: string;
  alert_type: string;
  price_ttc: number;
  price_ttc_label?: string;
}

export const TARIFS_INDICATIFS_CGS: TariffRow[] = [
  { code: "piratage_compte",    alert_type: "Piratage de compte",            price_ttc: 54.00 },
  { code: "hameconnage",        alert_type: "Hameçonnage (phishing)",        price_ttc: 54.00 },
  { code: "faux_support",       alert_type: "Faux support technique",        price_ttc: 178.80 },
  { code: "fuite_donnees",      alert_type: "Fuite de données personnelles", price_ttc: 298.80 },
  { code: "cyberharcelement",   alert_type: "Cyberharcèlement",              price_ttc: 180.00 },
  { code: "faux_conseiller",    alert_type: "Faux conseiller bancaire",      price_ttc: 90.00, price_ttc_label: "90,00 € – 180,00 € selon accompagnement médiateur bancaire" },
  { code: "fraude_cb",          alert_type: "Fraude à la carte bancaire",    price_ttc: 90.00 },
  { code: "virus_informatique", alert_type: "Virus / ransomware",            price_ttc: 154.80 },
  { code: "faux_rib",           alert_type: "Fraude au faux RIB (BEC)",      price_ttc: 82.80 },
];
