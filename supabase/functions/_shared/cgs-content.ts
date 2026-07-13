// ==========================================================================
// CyberDesk — Contenu des Conditions Générales de Services (16 articles)
// Extrait fidèlement des modèles .docx sources (~/Desktop/17CYBER/*/devis_*.docx,
// bloc CGS strictement identique sur les 9 modèles — cf. plan-devis-17cyber.md).
// Un seul bloc est dynamique (tariff_table_dynamic) : reconstruit à la génération
// depuis cybervictim_products pour ne jamais afficher un tarif obsolète.
// ==========================================================================
export type CgsBlock =
  | { type: "h1" | "h2" | "h3" | "p" | "p_italic" | "bullet"; text: string }
  | { type: "callout" | "cas"; title: string; body: string[] }
  | { type: "table"; rows: string[][] }
  | { type: "tariff_table_dynamic" };

export const CGS_BLOCKS: CgsBlock[] = [
  {
    "type": "h1",
    "text": "Conditions Générales de Services"
  },
  {
    "type": "p_italic",
    "text": "Assistance aux victimes de cybermalveillance — Prestataire référencé cybermalveillance.gouv.fr / 17Cyber"
  },
  {
    "type": "p",
    "text": "S@FE SASU, ci-après dénommée « S@FE » ou « le Prestataire », est une société par actions simplifiée unipersonnelle immatriculée au Registre du Commerce et des Sociétés de Paris sous le numéro SIRET 104 699 558 00011, dont le siège social est situé 66 avenue des Champs-Élysées, 75008 Paris."
  },
  {
    "type": "p",
    "text": "S@FE Digitalisation, branche spécialisée de S@FE SASU, est référencée comme prestataire de confiance sur la plateforme cybermalveillance.gouv.fr et le service 17Cyber, opérés par le Groupement d'Intérêt Public Action contre la Cybermalveillance (GIP ACYMA). À ce titre, S@FE intervient auprès de particuliers et de professionnels victimes d'actes de cybermalveillance."
  },
  {
    "type": "p",
    "text": "Les présentes Conditions Générales de Services (CGS) régissent l'ensemble des prestations d'assistance, d'investigation et de conseil réalisées par S@FE dans le cadre de son activité de prestataire référencé 17Cyber."
  },
  {
    "type": "callout",
    "title": "ℹ Important — Lecture obligatoire avant toute commande",
    "body": [
      "Toute demande d'intervention, que ce soit par contact direct, formulaire en ligne ou mise en relation via la plateforme 17Cyber, implique l'acceptation sans réserve des présentes CGS. Le client est invité à les lire attentivement et à solliciter toute clarification avant de valider un devis."
    ]
  },
  {
    "type": "h2",
    "text": "Article 1 — Objet et champ d'application"
  },
  {
    "type": "p",
    "text": "Les présentes CGS ont pour objet de définir les conditions dans lesquelles S@FE SASU fournit des prestations d'assistance cybersécurité aux personnes physiques et morales victimes d'actes de cybermalveillance, notamment dans le cadre des mises en relation effectuées via la plateforme cybermalveillance.gouv.fr ou le service 17Cyber."
  },
  {
    "type": "p",
    "text": "Elles s'appliquent à toute prestation commandée auprès de S@FE SASU, à l'exclusion des produits SaaS C@NDY et C@NDY-e qui font l'objet de contrats distincts, et des activités de courtage en assurances relevant de la branche S@FE Assurances."
  },
  {
    "type": "p",
    "text": "Toute dérogation aux présentes CGS doit faire l'objet d'un accord écrit signé par le Président de S@FE SASU. Les conditions particulières mentionnées dans un devis ou contrat signé prévalent sur les présentes CGS en cas de contradiction."
  },
  {
    "type": "h2",
    "text": "Article 2 — Définitions"
  },
  {
    "type": "p",
    "text": "Au sens des présentes CGS, les termes suivants ont la signification qui leur est attribuée ci-après :"
  },
  {
    "type": "bullet",
    "text": "\"Prestataire\" : S@FE SASU, agissant sous sa branche S@FE Digitalisation."
  },
  {
    "type": "bullet",
    "text": "\"Client\" : toute personne physique ou morale ayant conclu ou souhaitant conclure un contrat de prestation avec S@FE SASU dans le cadre des présentes CGS."
  },
  {
    "type": "bullet",
    "text": "\"Incident\" : tout événement de cybermalveillance ou de fraude numérique subi par le Client, tel que listé à l'Article 4."
  },
  {
    "type": "bullet",
    "text": "\"Rapport d'intervention\" : document structuré délivré au Client à l'issue de la prestation, récapitulant les constats, recommandations et éléments de preuve collectés."
  },
  {
    "type": "bullet",
    "text": "\"Devis\" : document chiffré accepté par le Client, constituant l'ordre de mission du Prestataire."
  },
  {
    "type": "bullet",
    "text": "\"Plateforme 17Cyber / cybermalveillance.gouv.fr\" : service public numérique opéré par le GIP ACYMA, permettant la mise en relation entre victimes et prestataires référencés."
  },
  {
    "type": "bullet",
    "text": "\"DPO\" : Délégué à la Protection des Données, rôle exercé par Sébastien Alonso (certifié RNCP40652 BC01)."
  },
  {
    "type": "bullet",
    "text": "\"HDS\" : Hébergement de Données de Santé, certification applicable à l'infrastructure technique de S@FE pour ses produits médicaux (non applicable aux interventions 17Cyber)."
  },
  {
    "type": "h2",
    "text": "Article 3 — Identification des parties"
  },
  {
    "type": "h3",
    "text": "3.1 Le Prestataire"
  },
  {
    "type": "table",
    "rows": [
      [
        "Dénomination",
        "S@FE SASU"
      ],
      [
        "Forme juridique",
        "Société par Actions Simplifiée Unipersonnelle"
      ],
      [
        "SIRET",
        "104 699 558 00011"
      ],
      [
        "Siège social",
        "66 avenue des Champs-Élysées, 75008 Paris"
      ],
      [
        "Président & DPO",
        "Sébastien Alonso"
      ],
      [
        "Email",
        "contact@safe-digitalisation.fr"
      ],
      [
        "Site web",
        "www.safe-digitalisation.fr"
      ],
      [
        "Référencement",
        "cybermalveillance.gouv.fr / 17Cyber"
      ]
    ]
  },
  {
    "type": "h3",
    "text": "3.2 Le Client"
  },
  {
    "type": "p",
    "text": "Le Client peut être :"
  },
  {
    "type": "bullet",
    "text": "Un particulier (personne physique majeure agissant pour un usage non professionnel) ;"
  },
  {
    "type": "bullet",
    "text": "Un professionnel, travailleur indépendant ou micro-entrepreneur ;"
  },
  {
    "type": "bullet",
    "text": "Une entreprise, association ou collectivité."
  },
  {
    "type": "p",
    "text": "La qualité de particulier ou de professionnel est déclarée par le Client lors de la prise de contact et conditionne certaines dispositions relatives à la protection du consommateur."
  },
  {
    "type": "h2",
    "text": "Article 4 — Prestations couvertes — Neuf cas d'intervention"
  },
  {
    "type": "p",
    "text": "S@FE SASU propose des prestations d'assistance pour les neuf catégories d'incidents de cybermalveillance suivantes. Pour chaque cas, les prestations comprennent a minima : un diagnostic initial, un rapport d'intervention et des recommandations de remédiation."
  },
  {
    "type": "cas",
    "title": "CAS N°1 — PIRATAGE DE COMPTE EN LIGNE",
    "body": [
      "Comptes concernés : messagerie, réseaux sociaux, e-commerce, services administratifs (Ameli, Impots.gouv.fr…)",
      "Prestations : analyse de la compromission, sécurisation du compte (si accès conservé), documentation des preuves, dépôt de plainte assisté, notification aux plateformes concernées, recommandations d'authentification renforcée (MFA)."
    ]
  },
  {
    "type": "cas",
    "title": "CAS N°2 — HAMEÇONNAGE (PHISHING)",
    "body": [
      "Emails, SMS (smishing), appels (vishing) frauduleux visant à subtiliser identifiants ou données bancaires.",
      "Prestations : analyse du vecteur d'attaque, identification de l'expéditeur frauduleux, documentation, signalement via Phishing Initiative / Signal Spam, recommandations anti-phishing."
    ]
  },
  {
    "type": "cas",
    "title": "CAS N°3 — ARNAQUE AU FAUX SUPPORT TECHNIQUE",
    "body": [
      "Pop-up alarmiste, appel entrant prétendant être Microsoft, Apple, opérateur télécom… Accès à distance frauduleux (TeamViewer, AnyDesk…), extorsion de paiement.",
      "Prestations : diagnostic du système (présence RAT, logiciel espion), nettoyage si possible, documentation pour plainte, sensibilisation."
    ]
  },
  {
    "type": "cas",
    "title": "CAS N°4 — FUITE OU VIOLATION DE DONNÉES PERSONNELLES",
    "body": [
      "Données personnelles du Client exposées suite à une violation chez un tiers (entreprise, service en ligne).",
      "Prestations : identification de la violation (HAVE I BEEN PWNED, veille dark web basique), évaluation du risque, conseils de remédiation, notification CNIL si le Client est un responsable de traitement."
    ]
  },
  {
    "type": "cas",
    "title": "CAS N°5 — CYBERHARCÈLEMENT",
    "body": [
      "Harcèlement en ligne, revenge porn, usurpation d'identité à des fins de nuisance, doxing.",
      "Prestations : documentation et horodatage des preuves (captures d'écran certifiées), identification des plateformes hébergeant les contenus, demandes de retrait, accompagnement dépôt de plainte (art. 226-1 et ss. CP)."
    ]
  },
  {
    "type": "cas",
    "title": "CAS N°6 — FRAUDE AU FAUX CONSEILLER BANCAIRE",
    "body": [
      "Appel frauduleux usurpant l'identité d'un conseiller bancaire pour obtenir des virements ou données de paiement.",
      "Prestations : analyse chronologique de l'incident, documentation pour la banque et les autorités, accompagnement contestation bancaire (art. L133-18 et ss. CMF), recommandations de sécurisation."
    ]
  },
  {
    "type": "cas",
    "title": "CAS N°7 — FRAUDE À LA CARTE BANCAIRE",
    "body": [
      "Utilisation frauduleuse des coordonnées bancaires en ligne (sans présence de la carte).",
      "Prestations : identification du vecteur probable de compromission, documentation pour opposition et remboursement, recommandations (carte virtuelle, 3D Secure…)."
    ]
  },
  {
    "type": "cas",
    "title": "CAS N°8 — VIRUS INFORMATIQUE",
    "body": [
      "Infection par malware, ransomware, spyware, adware ou cheval de Troie.",
      "Prestations : diagnostic de l'infection, évaluation de l'impact (chiffrement, exfiltration), conseils de remédiation, accompagnement à la restauration, documentation pour signalement (ANSSI, Police, Gendarmerie). Nota : S@FE ne garantit pas la récupération des données chiffrées par ransomware."
    ]
  },
  {
    "type": "cas",
    "title": "CAS N°9 — FRAUDE AU VIREMENT (FAUX RIB)",
    "body": [
      "Substitution frauduleuse d'un RIB lors d'un échange email (BEC — Business Email Compromise).",
      "Prestations : analyse de la compromission messagerie, documentation chronologique complète, accompagnement procédure de rappel de virement (SWIFT recall), assistance dépôt de plainte pénale, sécurisation de la messagerie et des flux financiers."
    ]
  },
  {
    "type": "callout",
    "title": "ℹ Nota bene — Exclusions communes à tous les cas",
    "body": [
      "• S@FE n'est pas un prestataire de forensique judiciaire agréé ; ses rapports constituent des éléments d'aide à la décision et non des expertises judiciaires opposables. • Les prestations de S@FE ne se substituent pas aux actions en justice : dépôt de plainte, action civile, mise en demeure restent à l'initiative du Client. • La récupération de sommes versées à des escrocs relève des autorités bancaires et judiciaires, non de S@FE."
    ]
  },
  {
    "type": "h2",
    "text": "Article 5 — Modalités de commande et de devis"
  },
  {
    "type": "h3",
    "text": "5.1 Prise de contact et diagnostic préliminaire"
  },
  {
    "type": "p",
    "text": "Toute intervention débute par une prise de contact via l'un des canaux suivants : plateforme 17Cyber / cybermalveillance.gouv.fr, formulaire de contact sur safe-digitalisation.fr, ou contact direct par email ou téléphone."
  },
  {
    "type": "p",
    "text": "Un diagnostic préliminaire (échange téléphonique ou visioconférence, 15 à 30 minutes) est réalisé gratuitement afin d'évaluer la nature de l'incident, son urgence et les prestations adaptées."
  },
  {
    "type": "h3",
    "text": "5.2 Émission du devis"
  },
  {
    "type": "p",
    "text": "À l'issue du diagnostic, S@FE émet un devis écrit précisant : la nature des prestations, le tarif HT et TTC, les délais estimés et les conditions de paiement. Le devis est valable 15 jours calendaires."
  },
  {
    "type": "h3",
    "text": "5.3 Acceptation et ordre de mission"
  },
  {
    "type": "p",
    "text": "Le contrat est formé par la signature du devis par le Client (signature électronique ou manuscrite). Aucune intervention facturable n'est engagée sans devis accepté, sauf accord express écrit pour une intervention d'urgence."
  },
  {
    "type": "h3",
    "text": "5.4 Droit de rétractation (particuliers)"
  },
  {
    "type": "p",
    "text": "Conformément aux articles L221-18 et suivants du Code de la consommation, les clients particuliers bénéficient d'un délai de rétractation de 14 jours à compter de l'acceptation du devis. En cas de demande d'exécution immédiate (urgence déclarée), le Client reconnaît expressément renoncer à ce délai."
  },
  {
    "type": "h2",
    "text": "Article 6 — Tarification et conditions financières"
  },
  {
    "type": "h3",
    "text": "6.1 Grille tarifaire indicative"
  },
  {
    "type": "p",
    "text": "Les tarifs ci-dessous sont indicatifs et peuvent varier en fonction de la complexité de l'incident. Le devis accepté fait foi."
  },
  {
    "type": "tariff_table_dynamic"
  },
  {
    "type": "callout",
    "title": "Tarifs TTC applicables aux particuliers (TVA 20% incluse). Pour les professionnels assujettis à la TVA, les prix s'entendent HT.",
    "body": [
      "Un devis personnalisé est systématiquement émis avant toute intervention. Les tarifs d'urgence s'appliquent aux interventions débutant dans les 24 heures suivant la commande."
    ]
  },
  {
    "type": "h3",
    "text": "6.2 Conditions de paiement"
  },
  {
    "type": "bullet",
    "text": "Acompte de 50% à la commande (obligatoire pour les interventions d'urgence : 100%)."
  },
  {
    "type": "bullet",
    "text": "Solde à réception du rapport d'intervention."
  },
  {
    "type": "bullet",
    "text": "Modes de paiement acceptés : virement bancaire, carte bancaire (lien de paiement sécurisé)."
  },
  {
    "type": "bullet",
    "text": "Délai de paiement professionnel : 30 jours date de facture (pénalités légales applicables)."
  },
  {
    "type": "h3",
    "text": "6.3 Upsell — Services complémentaires"
  },
  {
    "type": "p",
    "text": "À l'issue de l'intervention, S@FE peut proposer, sans obligation :"
  },
  {
    "type": "bullet",
    "text": "Délégation à la Protection des Données externalisée (DPO) : à partir de 149 € HT/mois."
  },
  {
    "type": "bullet",
    "text": "Audit cybersécurité complet ou test d'intrusion."
  },
  {
    "type": "bullet",
    "text": "Assurance cyber via la branche S@FE Assurances."
  },
  {
    "type": "h2",
    "text": "Article 7 — Obligations de S@FE SASU"
  },
  {
    "type": "h3",
    "text": "7.1 Obligation de moyens"
  },
  {
    "type": "p",
    "text": "S@FE s'engage à réaliser les prestations commandées avec diligence, professionnalisme et en conformité avec les bonnes pratiques du secteur de la cybersécurité. Les prestations de S@FE constituent une obligation de moyens et non de résultat. S@FE ne peut garantir la récupération de données, de fonds ou l'identification formelle des auteurs d'actes malveillants."
  },
  {
    "type": "h3",
    "text": "7.2 Confidentialité"
  },
  {
    "type": "p",
    "text": "S@FE s'engage à maintenir la plus stricte confidentialité sur les informations communiquées par le Client dans le cadre de l'intervention, conformément à l'Article 11 des présentes CGS."
  },
  {
    "type": "h3",
    "text": "7.3 Délais"
  },
  {
    "type": "p",
    "text": "Les délais d'intervention sont précisés dans le devis. En l'absence de précision, S@FE s'engage à débuter la prestation dans un délai de 5 jours ouvrés suivant la réception de l'acompte. En cas d'urgence déclarée et facturée comme telle, l'intervention débute dans les 24 heures suivant la validation de la commande."
  },
  {
    "type": "h3",
    "text": "7.4 Restitution documentaire"
  },
  {
    "type": "p",
    "text": "S@FE s'engage à remettre au Client un rapport d'intervention structuré comprenant : un résumé de l'incident, les constats techniques, les actions réalisées, les recommandations de remédiation, et les éléments de preuve collectés."
  },
  {
    "type": "h3",
    "text": "7.5 Signalement institutionnel"
  },
  {
    "type": "p",
    "text": "Dans le cadre de son référencement 17Cyber, S@FE peut être tenu à certaines obligations de remontée statistique ou de signalement anonymisé auprès du GIP ACYMA. Ces transmissions ne portent jamais sur des données identifiantes sans accord exprès du Client."
  },
  {
    "type": "h2",
    "text": "Article 8 — Obligations du Client"
  },
  {
    "type": "h3",
    "text": "8.1 Fourniture d'informations exactes"
  },
  {
    "type": "p",
    "text": "Le Client s'engage à fournir des informations complètes, exactes et à jour sur l'incident. Toute omission ou inexactitude susceptible d'affecter la qualité de l'intervention engage la responsabilité exclusive du Client."
  },
  {
    "type": "h3",
    "text": "8.2 Coopération active"
  },
  {
    "type": "p",
    "text": "Le Client s'engage à répondre dans des délais raisonnables aux demandes de S@FE (transmission de fichiers, accès aux systèmes concernés, réponse aux questions techniques). Tout retard imputable au Client entraîne un décalage correspondant des délais de S@FE, sans pénalité pour ce dernier."
  },
  {
    "type": "h3",
    "text": "8.3 Licéité de la demande"
  },
  {
    "type": "p",
    "text": "Le Client garantit que sa demande est licite et qu'il dispose des droits nécessaires sur les systèmes et données concernés par l'intervention. S@FE se réserve le droit de refuser ou d'interrompre toute prestation si elle suspecte une utilisation frauduleuse ou illicite."
  },
  {
    "type": "h3",
    "text": "8.4 Usage du rapport"
  },
  {
    "type": "p",
    "text": "Le rapport d'intervention est remis au Client à titre personnel et confidentiel. Il ne peut être transmis à des tiers sans accord écrit de S@FE, à l'exception des autorités judiciaires ou administratives compétentes dans le cadre d'une procédure légale."
  },
  {
    "type": "h3",
    "text": "8.5 Sécurisation post-incident"
  },
  {
    "type": "p",
    "text": "Le Client s'engage à mettre en œuvre dans des délais raisonnables les recommandations formulées par S@FE dans le rapport d'intervention. S@FE ne saurait être tenu responsable de préjudices résultant du non-respect de ces recommandations."
  },
  {
    "type": "h2",
    "text": "Article 9 — Responsabilité et limitation"
  },
  {
    "type": "h3",
    "text": "9.1 Limitation de responsabilité"
  },
  {
    "type": "p",
    "text": "La responsabilité de S@FE est limitée aux préjudices directs prouvés, à l'exclusion de tout préjudice indirect, immatériel, consécutif ou imprévisible (manque à gagner, perte de clientèle, atteinte à l'image…)."
  },
  {
    "type": "p",
    "text": "En tout état de cause, la responsabilité de S@FE est plafonnée au montant HT des prestations effectivement facturées et réglées au titre du contrat concerné."
  },
  {
    "type": "h3",
    "text": "9.2 Cas d'exclusion de responsabilité"
  },
  {
    "type": "p",
    "text": "S@FE ne saurait être tenu responsable :"
  },
  {
    "type": "bullet",
    "text": "Des actions ou omissions du Client ou de tiers ;"
  },
  {
    "type": "bullet",
    "text": "D'un cas de force majeure au sens de l'article 1218 du Code civil ;"
  },
  {
    "type": "bullet",
    "text": "De l'impossibilité technique de récupérer des données chiffrées ou supprimées ;"
  },
  {
    "type": "bullet",
    "text": "Du refus d'une banque ou d'une plateforme de donner suite aux demandes formulées ;"
  },
  {
    "type": "bullet",
    "text": "Des délais des autorités judiciaires ou administratives."
  },
  {
    "type": "h3",
    "text": "9.3 Garantie anti-éviction"
  },
  {
    "type": "p",
    "text": "S@FE garantit le Client contre tout trouble de droit de son fait dans la jouissance des prestations délivrées."
  },
  {
    "type": "callout",
    "title": "⚠ Avertissement — Absence de garantie de résultat",
    "body": [
      "Les prestations d'assistance cybersécurité sont des prestations de moyens. S@FE met en œuvre l'ensemble des diligences professionnelles à sa disposition mais ne peut garantir : la récupération de fonds détournés, l'identification des cybercriminels, la suppression définitive de contenus en ligne, ni le succès d'une procédure judiciaire ou bancaire."
    ]
  },
  {
    "type": "h2",
    "text": "Article 10 — Protection des données personnelles (RGPD)"
  },
  {
    "type": "h3",
    "text": "10.1 Responsabilité des traitements"
  },
  {
    "type": "p",
    "text": "S@FE SASU agit en qualité de Responsable de traitement pour les données collectées dans le cadre de la gestion de la relation client (coordonnées, facturation, historique des interventions). S@FE agit en qualité de Sous-traitant pour les données relatives à l'incident communiquées par le Client dans le cadre de la prestation."
  },
  {
    "type": "h3",
    "text": "10.2 Finalités et base légale"
  },
  {
    "type": "p",
    "text": "Les données sont traitées pour les finalités suivantes :"
  },
  {
    "type": "bullet",
    "text": "Exécution du contrat de prestation (base légale : exécution contractuelle — art. 6.1.b RGPD) ;"
  },
  {
    "type": "bullet",
    "text": "Facturation et comptabilité (base légale : obligation légale — art. 6.1.c RGPD) ;"
  },
  {
    "type": "bullet",
    "text": "Amélioration des services et statistiques anonymisées (base légale : intérêt légitime — art. 6.1.f RGPD)."
  },
  {
    "type": "h3",
    "text": "10.3 Données sensibles"
  },
  {
    "type": "p",
    "text": "Les incidents traités peuvent impliquer des données à caractère sensible (données bancaires, données médicales, données judiciaires). S@FE s'engage à ne collecter que les données strictement nécessaires à la réalisation de la prestation et à les supprimer ou anonymiser dans un délai de 3 ans suivant la clôture du dossier, sauf obligation légale de conservation plus longue."
  },
  {
    "type": "h3",
    "text": "10.4 Droits des personnes"
  },
  {
    "type": "p",
    "text": "Conformément au RGPD et à la loi Informatique et Libertés, le Client dispose d'un droit d'accès, de rectification, d'effacement, de portabilité, de limitation et d'opposition, à exercer auprès du DPO : dpo@safe-digitalisation.fr."
  },
  {
    "type": "p",
    "text": "En cas de réclamation non résolue, le Client peut saisir la CNIL (Commission Nationale de l'Informatique et des Libertés, www.cnil.fr)."
  },
  {
    "type": "h3",
    "text": "10.5 Sous-traitants"
  },
  {
    "type": "p",
    "text": "S@FE recourt aux sous-traitants de confiance suivants pour l'hébergement et l'exploitation de son infrastructure : Clever Cloud SAS (Nantes, France — hébergement sites et applications) et Supabase (Francfort, Allemagne — base de données CRM). Tout transfert hors UE est encadré par des clauses contractuelles types conformes à l'article 46 RGPD."
  },
  {
    "type": "h2",
    "text": "Article 11 — Confidentialité"
  },
  {
    "type": "p",
    "text": "Chaque partie s'engage à considérer comme strictement confidentielles toutes les informations communiquées par l'autre partie dans le cadre de l'exécution des présentes CGS, et à ne les divulguer à aucun tiers sans accord préalable écrit, sauf :"
  },
  {
    "type": "bullet",
    "text": "Si la divulgation est imposée par une obligation légale ou réglementaire ;"
  },
  {
    "type": "bullet",
    "text": "Si les informations sont dans le domaine public sans faute de la partie réceptrice ;"
  },
  {
    "type": "bullet",
    "text": "Si la divulgation est nécessaire à la défense des droits d'une partie en justice."
  },
  {
    "type": "p",
    "text": "Cette obligation de confidentialité est valable pendant la durée du contrat et pendant 5 ans suivant son terme."
  },
  {
    "type": "p",
    "text": "S@FE s'engage expressément à ne jamais diffuser, même de manière anonymisée ou à titre d'illustration commerciale, les informations relatives aux incidents traités pour ses clients, sans accord écrit préalable de ces derniers."
  },
  {
    "type": "h2",
    "text": "Article 12 — Propriété intellectuelle"
  },
  {
    "type": "h3",
    "text": "12.1 Droits de S@FE"
  },
  {
    "type": "p",
    "text": "Les méthodes, outils, templates, scripts et documents produits par S@FE dans le cadre de ses prestations restent la propriété intellectuelle exclusive de S@FE SASU. Le rapport d'intervention remis au Client constitue une œuvre dérivée dont S@FE concède au Client une licence d'utilisation personnelle, non exclusive et non cessible."
  },
  {
    "type": "h3",
    "text": "12.2 Droits du Client"
  },
  {
    "type": "p",
    "text": "Les informations, documents et données communiquées par le Client restent sa propriété exclusive. S@FE ne peut les utiliser qu'aux fins de la prestation commandée."
  },
  {
    "type": "h2",
    "text": "Article 13 — Durée, résiliation et force majeure"
  },
  {
    "type": "h3",
    "text": "13.1 Durée"
  },
  {
    "type": "p",
    "text": "Les présentes CGS sont applicables à chaque prestation commandée, de la date d'acceptation du devis jusqu'à la réception du rapport d'intervention et le complet paiement des honoraires."
  },
  {
    "type": "h3",
    "text": "13.2 Résiliation par le Client"
  },
  {
    "type": "p",
    "text": "Le Client peut résilier la prestation à tout moment par écrit. Dans ce cas, les prestations déjà réalisées sont dues intégralement. L'acompte versé reste acquis à S@FE. Le solde éventuel est calculé au prorata des prestations effectivement réalisées."
  },
  {
    "type": "h3",
    "text": "13.3 Résiliation par S@FE"
  },
  {
    "type": "p",
    "text": "S@FE peut résilier la prestation en cas de manquement grave du Client à ses obligations (non-paiement, fourniture d'informations mensongères, demande illicite) après mise en demeure restée sans effet 48 heures. Dans ce cas, les prestations réalisées restent dues."
  },
  {
    "type": "h3",
    "text": "13.4 Force majeure"
  },
  {
    "type": "p",
    "text": "Aucune des parties ne saurait être tenue responsable d'un manquement à ses obligations contractuelles résultant d'un événement de force majeure au sens de l'article 1218 du Code civil (catastrophe naturelle, pandémie, cyberattaque de grande ampleur, décision gouvernementale…). La partie empêchée en informe l'autre sans délai. Si l'empêchement dure plus de 30 jours, chacune des parties peut résilier le contrat de plein droit."
  },
  {
    "type": "h2",
    "text": "Article 14 — Médiation et règlement des litiges"
  },
  {
    "type": "p",
    "text": "En cas de litige relatif à l'exécution des présentes CGS, les parties s'engagent à rechercher une solution amiable dans un délai de 30 jours suivant la notification du litige par lettre recommandée avec accusé de réception."
  },
  {
    "type": "p",
    "text": "À défaut d'accord amiable, et conformément aux articles L611-1 et suivants du Code de la consommation, les clients particuliers peuvent recourir gratuitement à un médiateur de la consommation. S@FE adhère au service de médiation : CM2C — Centre de Médiation de la Consommation de Conciliateurs de Justice (www.cm2c.net)."
  },
  {
    "type": "p",
    "text": "La Commission européenne met également à disposition une plateforme de règlement en ligne des litiges accessible à l'adresse : https://ec.europa.eu/consumers/odr."
  },
  {
    "type": "h2",
    "text": "Article 15 — Droit applicable et juridiction compétente"
  },
  {
    "type": "p",
    "text": "Les présentes CGS sont soumises au droit français."
  },
  {
    "type": "p",
    "text": "En cas de litige persistant après tentative de règlement amiable et, le cas échéant, de médiation, la juridiction compétente est le Tribunal de Commerce de Paris ou, pour les clients particuliers, le Tribunal judiciaire compétent selon les règles du droit commun."
  },
  {
    "type": "h2",
    "text": "Article 16 — Dispositions finales"
  },
  {
    "type": "h3",
    "text": "16.1 Intégralité"
  },
  {
    "type": "p",
    "text": "Les présentes CGS constituent l'intégralité de l'accord entre les parties sur leur objet et remplacent tout accord antérieur oral ou écrit."
  },
  {
    "type": "h3",
    "text": "16.2 Divisibilité"
  },
  {
    "type": "p",
    "text": "Si une disposition des présentes CGS était déclarée nulle ou inapplicable par une juridiction compétente, les autres dispositions resteraient en vigueur."
  },
  {
    "type": "h3",
    "text": "16.3 Modification des CGS"
  },
  {
    "type": "p",
    "text": "S@FE se réserve le droit de modifier les présentes CGS à tout moment. Les CGS applicables sont celles en vigueur à la date d'acceptation du devis. Les modifications sont portées à la connaissance des clients par publication sur le site www.safe-digitalisation.fr."
  },
  {
    "type": "h3",
    "text": "16.4 Non-renonciation"
  },
  {
    "type": "p",
    "text": "Le fait pour S@FE de ne pas se prévaloir à un moment donné de l'une quelconque des dispositions des présentes CGS ne peut être interprété comme une renonciation à s'en prévaloir ultérieurement."
  },
  {
    "type": "h3",
    "text": "16.5 Contact"
  },
  {
    "type": "table",
    "rows": [
      [
        "Prestataire",
        "S@FE SASU — S@FE Digitalisation"
      ],
      [
        "Adresse",
        "66 avenue des Champs-Élysées, 75008 Paris"
      ],
      [
        "Email",
        "contact@safe-digitalisation.fr"
      ],
      [
        "DPO",
        "dpo@safe-digitalisation.fr"
      ],
      [
        "Site web",
        "www.safe-digitalisation.fr"
      ]
    ]
  }
] as CgsBlock[];
