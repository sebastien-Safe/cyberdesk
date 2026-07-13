// ==========================================================================
// CyberDesk — Générateur PDF Devis / Rapport dossiers victimes 17Cyber
// Génération 100% client-side via jsPDF, palette navy/gold, doc.save()
// direct (aucun stockage serveur des PDF générés).
// ==========================================================================

window.VictimPDF = (function () {
  const { jsPDF } = window.jspdf || {};

  const PRESTATAIRE = {
    nom:           'S@FE',
    adresse:       '66 avenue des Champs-Élysées, 75008 Paris',
    siret:         '104 699 558 00011',
    representant:  'Sébastien Alonso, Président',
    email:         'contact@safe-digitalisation.fr',
    site:          'safe-digitalisation.fr',
    referencement: 'Prestataire référencé cybermalveillance.gouv.fr / 17Cyber',
  };

  // --- Outils communs ---
  function money(n) { return (Number(n) || 0).toFixed(2).replace('.', ',') + ' €'; }
  function todayFr() {
    return new Date().toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' });
  }
  function todayShort() { return new Date().toISOString().slice(0, 10); }
  function safeFileName(s) {
    return (s || '')
      .normalize('NFD').replace(/[̀-ͯ]/g, '')
      .replace(/[^a-zA-Z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '') || 'CyberDesk';
  }

  // --- Header / footer communs ---
  function drawHeader(doc, title, ref) {
    doc.setDrawColor(201, 162, 75); // gold
    doc.setLineWidth(1.2);
    doc.line(15, 18, 195, 18);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.setTextColor(3, 13, 38); // navy
    doc.text('S@FE Digitalisation — 17Cyber', 15, 14);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(100, 100, 100);
    doc.text(title, 195, 14, { align: 'right' });
    doc.text(`Réf. : ${ref}`, 195, 24, { align: 'right' });
  }

  function drawFooter(doc) {
    const h = doc.internal.pageSize.getHeight();
    doc.setDrawColor(201, 162, 75);
    doc.setLineWidth(0.5);
    doc.line(15, h - 16, 195, h - 16);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    doc.setTextColor(100, 100, 100);
    doc.text(
      `${PRESTATAIRE.nom} — SIRET ${PRESTATAIRE.siret} — ${PRESTATAIRE.adresse} — ${PRESTATAIRE.email} — ${PRESTATAIRE.referencement}`,
      15, h - 10, { maxWidth: 180 }
    );
  }

  function drawParties(doc, lead, y) {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.setTextColor(3, 13, 38);
    doc.text('Prestataire', 15, y);
    doc.text('Client — Dossier victime', 105, y);
    y += 6;

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    doc.setTextColor(40, 40, 40);
    const left = [
      PRESTATAIRE.nom, PRESTATAIRE.adresse,
      `SIRET : ${PRESTATAIRE.siret}`, `Rep. par : ${PRESTATAIRE.representant}`,
      PRESTATAIRE.email, PRESTATAIRE.referencement,
    ];
    left.forEach((l, i) => doc.text(l, 15, y + i * 4.5));

    const fill = v => (v && String(v).trim()) ? String(v).trim() : '—';
    const right = [
      `${fill(lead.first_name)} ${fill(lead.last_name)}`,
      `E-mail : ${fill(lead.email)}`,
      `Téléphone : ${fill(lead.phone)}`,
      `Ticket 17Cyber : ${fill(lead.ticket_number)}`,
    ];
    right.forEach((l, i) => doc.text(l, 105, y + i * 4.5));

    return y + Math.max(left.length, right.length) * 4.5 + 6;
  }

  // --------------------------------------------------------------------
  // Config par produit — objet du devis + trame des constats du rapport
  // (les rapports sources 17Cyber sont des trames narratives à compléter
  // par le consultant, pas des champs de fusion simples — cf. inventaire)
  // --------------------------------------------------------------------
  const PRODUCT_CONFIG = {
    piratage_compte: {
      objet: "Intervention de sécurisation à distance suite à un piratage de compte en ligne (messagerie, réseaux sociaux, services administratifs) signalé via la plateforme 17Cyber / cybermalveillance.gouv.fr.",
      reportSections: [
        'Comptes concernés (messagerie principale/secondaire, réseaux sociaux, e-commerce, services administratifs)',
        'Vecteur de compromission identifié',
        "Portes dérobées supprimées (règles de transfert, filtres, sessions actives, applications tierces OAuth)",
        'Double authentification (MFA) activée sur les comptes concernés',
        'Préjudice financier constaté (oui/non, montant)',
        'Dépôt de plainte / signalement THESEE effectué',
      ],
    },
    hameconnage: {
      objet: "Intervention suite à une campagne d'hameçonnage (phishing) : analyse du courriel et du site frauduleux, sécurisation des accès compromis, signalements et volet données personnelles.",
      reportSections: [
        "Vecteur d'attaque (courriel / SMS / appel)",
        'Expéditeur et infrastructure frauduleuse identifiés (WHOIS, SPF / DKIM / DMARC)',
        'Nature des données saisies par la victime (identifiants, CB, autres)',
        'Vérification Have I Been Pwned et réutilisation du mot de passe',
        'Sécurisation des comptes compromis et mise en place d\'un gestionnaire de mots de passe',
        'Signalements effectués (Signal Spam, Pharos, organisme usurpé)',
      ],
    },
    faux_support: {
      objet: "Intervention suite à une arnaque au faux support technique : diagnostic du poste, nettoyage, sécurisation des accès et volet judiciaire.",
      reportSections: [
        'Mode opératoire (pop-up alarmiste, appel entrant, société usurpée)',
        "Prise en main à distance constatée (AnyDesk / TeamViewer / UltraViewer / autre)",
        'Paiement effectué (oui/non, moyen, montant)',
        'Analyse antimalware et suppression des logiciels frauduleux',
        "Comptes et navigateurs vérifiés (accès RDP, extensions suspectes, mots de passe exposés)",
        "État du poste à la clôture de l'intervention",
      ],
    },
    fuite_donnees: {
      objet: "Intervention suite à une fuite ou violation de données personnelles chez un tiers : identification de la violation, évaluation du risque, conseils de remédiation.",
      reportSections: [
        'Organisme victime de la fuite identifié',
        'Date à laquelle la victime a été informée de la violation',
        'Nature des données exposées',
        'Vérification Have I Been Pwned / veille dark web basique',
        "Conseils de remédiation transmis (cloisonnement, alias e-mail dédié)",
        'Notification CNIL le cas échéant (si le client est responsable de traitement)',
      ],
    },
    cyberharcelement: {
      objet: "Intervention suite à un cyberharcèlement : documentation et horodatage des preuves, demandes de retrait, accompagnement au dépôt de plainte.",
      reportSections: [
        "Nature des faits (messages, revenge porn, usurpation d'identité, doxing)",
        'Plateformes concernées (Instagram, Facebook, TikTok, autres)',
        'Période des faits',
        'Auteur connu ou non de la victime',
        "Captures d'écran certifiées et preuves horodatées collectées",
        'Demandes de retrait et accompagnement dépôt de plainte (art. 226-1 et s. CP)',
      ],
    },
    faux_conseiller: {
      objet: "Intervention suite à une fraude au faux conseiller bancaire : analyse chronologique, documentation pour la banque et les autorités, accompagnement contestation bancaire.",
      reportSections: [
        "Déroulé de l'appel et scénario employé",
        "Spoofing du numéro de l'agence (oui / non / indéterminé)",
        'Établissement et agence du client',
        'Préjudice financier constaté ou évité',
        'Opposition et contestation bancaire engagées (art. L133-18 et s. CMF)',
        "État à la clôture de l'intervention",
      ],
    },
    fraude_cb: {
      objet: "Intervention suite à une fraude à la carte bancaire (paiement à distance) : identification du vecteur probable, documentation pour opposition et remboursement.",
      reportSections: [
        'Vecteur probable de compromission (CNP, skimming, phishing, faux conseiller)',
        'Montant et nombre de transactions frauduleuses',
        'Type de carte et 4 derniers chiffres',
        'Opposition effectuée et dossier de contestation constitué',
        'État du remboursement (en cours / obtenu / refusé)',
      ],
    },
    virus_informatique: {
      objet: "Intervention suite à une infection par virus / ransomware / spyware : diagnostic, évaluation de l'impact, conseils de remédiation, accompagnement à la restauration.",
      reportSections: [
        "Vecteur d'infection identifié",
        'Matériel concerné (modèle, OS)',
        'Type de malware identifié',
        'Connexions sortantes / C2 identifié',
        'Impact constaté (chiffrement, exfiltration)',
        "Signalement effectué (ANSSI, Police, Gendarmerie) — récupération des données non garantie en cas de ransomware",
      ],
    },
    faux_rib: {
      objet: "Intervention suite à une fraude au virement par faux RIB (BEC — Business Email Compromise) : analyse de la compromission messagerie, documentation chronologique, accompagnement rappel de virement.",
      reportSections: [
        'Analyse de la compromission de la messagerie',
        "Adresse d'expédition réelle vs affichée, résultats SPF / DKIM / DMARC",
        'Montant du virement frauduleux',
        'Procédure de rappel de virement (SWIFT recall) engagée',
        'Dépôt de plainte pénale effectué',
        'Sécurisation de la messagerie et des flux financiers',
      ],
    },
  };

  // ======================================================================
  // DEVIS
  // ======================================================================
  function generateQuote(lead, product) {
    if (!jsPDF) { alert('jsPDF indisponible.'); return; }
    const doc = new jsPDF();
    const ref = `CD-DEV-17C-${todayShort().replace(/-/g, '')}-${(lead.id || '').slice(0, 8).toUpperCase()}`;

    drawHeader(doc, 'DEVIS — Intervention 17Cyber', ref);
    let y = 34;

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(16);
    doc.setTextColor(3, 13, 38);
    doc.text(product.alert_type, 15, y);
    y += 8;

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(60, 60, 60);
    const cfg = PRODUCT_CONFIG[product.code] || {};
    const objetLines = doc.splitTextToSize(
      cfg.objet || `Intervention CyberDesk suite à un signalement 17Cyber — ${product.alert_type}.`, 180
    );
    doc.text(objetLines, 15, y);
    y += objetLines.length * 4.5 + 6;

    y = drawParties(doc, lead, y);

    // Tableau tarif
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.setTextColor(3, 13, 38);
    doc.text('Tarifs', 15, y);
    y += 7;

    const ht  = Number(product.price_ht) || 0;
    const ttc = Number(product.price_ttc) || 0;
    const tva = ttc - ht;
    const rows = [
      [product.alert_type + ' — Intervention (HT)', money(ht)],
      ['TVA 20 %', money(tva)],
      ['TOTAL TTC', money(ttc)],
    ];
    doc.setFontSize(9);
    rows.forEach((r, i) => {
      const yy = y + i * 6;
      const isTotal = r[0].startsWith('TOTAL');
      doc.setFont('helvetica', isTotal ? 'bold' : 'normal');
      doc.setTextColor(isTotal ? 3 : 40, isTotal ? 13 : 40, isTotal ? 38 : 40);
      doc.text(r[0], 15, yy, { maxWidth: 140 });
      doc.text(r[1], 195, yy, { align: 'right' });
      doc.setDrawColor(220, 220, 220);
      doc.line(15, yy + 1.5, 195, yy + 1.5);
    });
    y += rows.length * 6 + 6;

    if (product.pricing_note) {
      doc.setFont('helvetica', 'italic');
      doc.setFontSize(7.5);
      doc.setTextColor(100, 100, 100);
      const noteLines = doc.splitTextToSize('Variantes possibles selon le périmètre retenu : ' + product.pricing_note, 180);
      doc.text(noteLines, 15, y);
      y += noteLines.length * 3.8 + 6;
    }

    if (y > 220) { doc.addPage(); y = 25; }
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.setTextColor(3, 13, 38);
    doc.text('Modalités de règlement', 15, y);
    y += 6;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    doc.setTextColor(60, 60, 60);
    const modalites = [
      "Paiement valant pour signature du présent devis.",
      "Moyens de paiement acceptés : virement bancaire ou carte.",
      "Devis gratuit et sans engagement, valable 30 jours à compter de sa date d'émission.",
      "Conformément à l'art. L.221-18 du Code de la consommation, le client particulier dispose d'un délai de rétractation de 14 jours, sauf demande expresse d'exécution immédiate.",
    ];
    modalites.forEach(m => {
      const lines = doc.splitTextToSize('• ' + m, 180);
      if (y > 270) { doc.addPage(); y = 25; }
      doc.text(lines, 15, y);
      y += lines.length * 4.2 + 1.5;
    });

    y += 8;
    if (y > 250) { doc.addPage(); y = 25; }
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(20, 20, 20);
    doc.text(`Fait à Paris, le ${todayFr()}`, 15, y);
    doc.text(PRESTATAIRE.representant, 15, y + 6);

    drawFooter(doc);

    const filename = `${safeFileName(product.alert_type)}_${safeFileName(lead.last_name)}_${safeFileName(lead.first_name)}_${todayShort()}_DEVIS.pdf`;
    doc.save(filename);
    return filename;
  }

  // ======================================================================
  // DEVIS V2 — grille tarifaire multi-prestations (assets/data/tarifs-cyberdesk.json)
  // devis: { prestation_label, lines:[{label,montant,inclus?,note?}],
  //          ht, tva, ttc, observations, source, diagnostic_code }
  // ======================================================================
  function _buildQuoteV2Doc(lead, devis) {
    if (!jsPDF) throw new Error('jsPDF indisponible.');
    const doc = new jsPDF();
    const ref = `CD-DEV-17C-${todayShort().replace(/-/g, '')}-${(lead.id || '').slice(0, 8).toUpperCase()}`;

    drawHeader(doc, 'DEVIS — Intervention 17Cyber', ref);
    let y = 34;

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(16);
    doc.setTextColor(3, 13, 38);
    doc.text(devis.prestation_label || 'Intervention 17Cyber', 15, y);
    y += 8;

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(60, 60, 60);
    const objetLines = doc.splitTextToSize(
      `Intervention CyberDesk suite à un signalement 17Cyber — ${devis.prestation_label || 'diagnostic à préciser'}.`, 180
    );
    doc.text(objetLines, 15, y);
    y += objetLines.length * 4.5 + 6;

    y = drawParties(doc, lead, y);

    // Détail de la prestation (une ligne par élément composé)
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.setTextColor(3, 13, 38);
    doc.text('Détail de la prestation', 15, y);
    y += 7;

    doc.setFontSize(9);
    (devis.lines || []).forEach(l => {
      if (y > 260) { doc.addPage(); y = 25; }
      const valStr = l.inclus ? 'Inclus' : (l.note ? l.note : money(l.montant));
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(40, 40, 40);
      doc.text(l.label, 15, y, { maxWidth: 140 });
      doc.text(valStr, 195, y, { align: 'right' });
      doc.setDrawColor(220, 220, 220);
      doc.line(15, y + 1.5, 195, y + 1.5);
      y += 6;
    });

    y += 2;
    const hasRemise = Math.abs(devis.remise || 0) >= 0.005;
    const totalRows = hasRemise
      ? [
          ['Prix initial HT', money(devis.prix_initial)],
          [devis.remise > 0 ? 'Remise accordée' : 'Majoration', (devis.remise > 0 ? '-' : '+') + money(Math.abs(devis.remise))],
          ['TOTAL HT', money(devis.ht)],
          ['TVA 20 %', money(devis.tva)],
          ['TOTAL TTC', money(devis.ttc)],
        ]
      : [
          ['TOTAL HT', money(devis.ht)],
          ['TVA 20 %', money(devis.tva)],
          ['TOTAL TTC', money(devis.ttc)],
        ];
    totalRows.forEach((r, i) => {
      if (y > 265) { doc.addPage(); y = 25; }
      const isTotal = r[0].startsWith('TOTAL TTC');
      const isRemiseRow = r[0] === 'Remise accordée' || r[0] === 'Majoration';
      doc.setFont('helvetica', isTotal ? 'bold' : 'normal');
      if (isRemiseRow) doc.setTextColor(devis.remise > 0 ? 24 : 179, devis.remise > 0 ? 117 : 64, devis.remise > 0 ? 60 : 0);
      else doc.setTextColor(isTotal ? 3 : 40, isTotal ? 13 : 40, isTotal ? 38 : 40);
      doc.text(r[0], 15, y);
      doc.text(r[1], 195, y, { align: 'right' });
      y += 6;
    });
    y += 4;

    if (devis.observations) {
      if (y > 250) { doc.addPage(); y = 25; }
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(10);
      doc.setTextColor(3, 13, 38);
      doc.text('Observations', 15, y);
      y += 5;
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8.5);
      doc.setTextColor(60, 60, 60);
      const obsLines = doc.splitTextToSize(devis.observations, 180);
      doc.text(obsLines, 15, y);
      y += obsLines.length * 4.2 + 6;
    }

    if (y > 220) { doc.addPage(); y = 25; }
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.setTextColor(3, 13, 38);
    doc.text('Modalités de règlement', 15, y);
    y += 6;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    doc.setTextColor(60, 60, 60);
    const modalites = [
      "Paiement valant pour signature du présent devis.",
      "Moyens de paiement acceptés : virement bancaire ou carte.",
      "Devis gratuit et sans engagement, valable 30 jours à compter de sa date d'émission.",
      "Garantie de reprise de 7 jours si l'incident n'est pas résolu par l'intervention.",
      "En cas d'intervention réalisée mais incident non résolu du fait de contraintes techniques imprévues, la prestation reste due.",
      "Conformément à l'art. L.221-18 du Code de la consommation, le client particulier dispose d'un délai de rétractation de 14 jours, sauf demande expresse d'exécution immédiate.",
    ];
    modalites.forEach(m => {
      const lines = doc.splitTextToSize('• ' + m, 180);
      if (y > 270) { doc.addPage(); y = 25; }
      doc.text(lines, 15, y);
      y += lines.length * 4.2 + 1.5;
    });

    y += 8;
    if (y > 250) { doc.addPage(); y = 25; }
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(20, 20, 20);
    doc.text(`Fait à Paris, le ${todayFr()}`, 15, y);
    doc.text(PRESTATAIRE.representant, 15, y + 6);

    drawFooter(doc);

    const filename = `${safeFileName(devis.prestation_label || 'Devis')}_${safeFileName(lead.last_name)}_${safeFileName(lead.first_name)}_${todayShort()}_DEVIS.pdf`;
    return { doc, filename };
  }

  // Téléchargement local (bouton "Télécharger le PDF" — contrôle avant envoi).
  function generateQuoteV2(lead, devis) {
    let built;
    try { built = _buildQuoteV2Doc(lead, devis); } catch (e) { alert(e.message); return; }
    built.doc.save(built.filename);
    return built.filename;
  }

  // Base64 (sans préfixe data URI) + nom de fichier, pour pièce jointe e-mail
  // (bouton "Valider et envoyer au client" → Edge Function send-cybervictim-quote).
  function getQuoteV2PdfBase64(lead, devis) {
    const built = _buildQuoteV2Doc(lead, devis);
    const dataUri = built.doc.output('datauristring');
    return { base64: dataUri.split(',')[1], filename: built.filename };
  }

  // ======================================================================
  // RAPPORT
  // ======================================================================
  function generateReport(lead, product) {
    if (!jsPDF) { alert('jsPDF indisponible.'); return; }
    const doc = new jsPDF();
    const ref = `CD-RAP-17C-${todayShort().replace(/-/g, '')}-${(lead.id || '').slice(0, 8).toUpperCase()}`;

    drawHeader(doc, "RAPPORT D'INTERVENTION — 17Cyber", ref);
    let y = 34;

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(15);
    doc.setTextColor(3, 13, 38);
    const titleLines = doc.splitTextToSize(`Rapport d'intervention — ${product.alert_type}`, 180);
    doc.text(titleLines, 15, y);
    y += titleLines.length * 6 + 4;

    y = drawParties(doc, lead, y);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    doc.setTextColor(60, 60, 60);
    doc.text(`Date d'intervention : ${todayFr()}`, 15, y);
    y += 8;

    if (lead.notes) {
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(10);
      doc.setTextColor(3, 13, 38);
      doc.text('Notes du dossier (saisies dans CyberDesk)', 15, y);
      y += 5.5;
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8.5);
      doc.setTextColor(60, 60, 60);
      const noteLines = doc.splitTextToSize(lead.notes, 180);
      doc.text(noteLines, 15, y);
      y += noteLines.length * 4.2 + 6;
    }

    const cfg = PRODUCT_CONFIG[product.code] || {};
    const sections = cfg.reportSections || [
      "Résumé de l'incident", 'Constats techniques', 'Actions réalisées', 'Recommandations de remédiation',
    ];

    if (y > 240) { doc.addPage(); y = 25; }
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.setTextColor(3, 13, 38);
    doc.text('Éléments constatés — à compléter par le consultant', 15, y);
    y += 7;

    doc.setFontSize(8.5);
    sections.forEach((s, i) => {
      if (y > 255) { doc.addPage(); y = 25; }
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(3, 13, 38);
      const labelLines = doc.splitTextToSize(`${i + 1}. ${s}`, 180);
      doc.text(labelLines, 15, y);
      y += labelLines.length * 4.5 + 2;
      doc.setDrawColor(220, 220, 220);
      doc.line(20, y, 190, y); y += 8;
      doc.line(20, y, 190, y); y += 8;
    });

    y += 4;
    if (y > 245) { doc.addPage(); y = 25; }
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.setTextColor(3, 13, 38);
    doc.text('Conclusion et recommandations', 15, y);
    y += 6;
    doc.setDrawColor(220, 220, 220);
    for (let i = 0; i < 3; i++) { doc.line(20, y, 190, y); y += 8; }

    y += 6;
    if (y > 260) { doc.addPage(); y = 25; }
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(20, 20, 20);
    doc.text(`Fait à Paris, le ${todayFr()}`, 15, y);
    doc.text(PRESTATAIRE.representant, 15, y + 6);

    doc.setFont('helvetica', 'italic');
    doc.setFontSize(7);
    doc.setTextColor(100, 100, 100);
    doc.text(
      "CyberDesk n'est pas un prestataire de forensique judiciaire agréé ; ce rapport constitue un élément d'aide à la décision et non une expertise judiciaire opposable.",
      15, y + 12, { maxWidth: 180 }
    );

    drawFooter(doc);

    const filename = `${safeFileName(product.alert_type)}_${safeFileName(lead.last_name)}_${safeFileName(lead.first_name)}_${todayShort()}_RAPPORT.pdf`;
    doc.save(filename);
    return filename;
  }

  return { generateQuote, generateQuoteV2, getQuoteV2PdfBase64, generateReport };
})();
