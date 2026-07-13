// ═══════════════════════════════════════════════════════════════════════
// CyberDesk — Modale Devis 17Cyber (3 étapes)
// Source unique de vérité tarifaire : assets/data/tarifs-cyberdesk.json.
// Présélectionne une prestation à partir du diagnostic 17Cyber (attack_type
// + mots-clés targeted_services), toujours modifiable. Montant final
// ajustable manuellement en étape 3 ; génération PDF (jsPDF, VictimPDF)
// uniquement sur clic explicite du conseiller (confirmation).
//
// Toute la modale est statique dans index.html : les listeners sont
// attachés une seule fois par _quoteInit() (appelée en bas de ce fichier),
// jamais réinjectée. Même contrainte que la modale diagnostic (victimes17.js).
// ═══════════════════════════════════════════════════════════════════════

let _quoteTarifs = null;
let _quoteLeadId = null;
let _quoteStep = 1;
const _quoteTotalSteps = 3;
let _quoteSelection = null;   // { type:'prestation'|'pack'|'complexe', id, label, ht, source, diagnosticCode }
let _quoteSuggested = null;   // snapshot de la suggestion auto au moment de l'ouverture
let _quoteOptions = {};       // { O1:bool, O2:bool, O3:bool, O4:bool }
let _quoteAccompagnement = {}; // { A1:bool, A2:bool, A3:bool }
let _quoteHtOverridden = false;

async function _quoteLoadTarifs() {
  if (_quoteTarifs) return _quoteTarifs;
  const resp = await fetch('assets/data/tarifs-cyberdesk.json');
  if (!resp.ok) throw new Error('HTTP ' + resp.status);
  _quoteTarifs = await resp.json();
  return _quoteTarifs;
}

// ── Mapping diagnostic → prestation ──
// 1. Compte/plateforme : mots-clés de targeted_services (hameconnage, violation_compte)
// 2. Cas complexe (deni_de_service) : facturation horaire
// 3. Correspondance directe attack_type → codes_diagnostic
// 4. Aucune correspondance (autre, ou attack_type non renseigné) → mode manuel
function _quoteSuggestFromDiagnostic(lead) {
  const attackType = lead.attack_type;
  if (!attackType) return null;
  const targetedServices = (lead.targeted_services || '').toLowerCase();

  if (attackType === 'hameconnage' || attackType === 'violation_compte') {
    for (const niveau of _quoteTarifs.niveaux) {
      for (const presta of niveau.prestations) {
        if (presta.mots_cles && presta.mots_cles.some(k => targetedServices.includes(k))) {
          return { type: 'prestation', id: presta.id, label: presta.label, ht: presta.ht, source: 'auto', diagnosticCode: attackType };
        }
      }
    }
  }

  if (_quoteTarifs.cas_complexe.codes_diagnostic?.includes(attackType)) {
    return { type: 'complexe', id: null, label: _quoteTarifs.cas_complexe.label, ht: 0, source: 'auto', diagnosticCode: attackType };
  }

  for (const niveau of _quoteTarifs.niveaux) {
    for (const presta of niveau.prestations) {
      if (presta.codes_diagnostic && presta.codes_diagnostic.includes(attackType)) {
        return { type: 'prestation', id: presta.id, label: presta.label, ht: presta.ht, source: 'auto', diagnosticCode: attackType };
      }
    }
  }

  return null;
}

// ── Ouverture / fermeture ──
async function openQuoteModal(leadId) {
  const lead = _v17Leads.find(l => l.id === leadId);
  if (!lead) return;
  try {
    await _quoteLoadTarifs();
  } catch (e) {
    alert('Grille tarifaire indisponible : ' + e.message);
    return;
  }

  _quoteLeadId = leadId;
  _quoteOptions = { O1: false, O2: false, O3: false, O4: false };
  _quoteAccompagnement = { A1: false, A2: false, A3: false };
  _quoteHtOverridden = false;
  document.getElementById('quote-o4-text').value = '';
  document.getElementById('quote-o4-field').style.display = 'none';
  document.getElementById('quote-observations').value = '';
  document.querySelectorAll('#quote-options-container input[type=checkbox]').forEach(cb => cb.checked = false);
  document.querySelectorAll('#quote-accompagnement-container input[type=checkbox]').forEach(cb => cb.checked = false);
  document.getElementById('quote-complexe-hours').value = '';

  const suggestion = _quoteSuggestFromDiagnostic(lead);
  _quoteSuggested = suggestion;
  _quoteSelection = suggestion ? { ...suggestion } : null;

  document.getElementById('quote-modal-title').textContent =
    `Devis — ${lead.first_name || ''} ${lead.last_name || ''}`.trim();

  _quoteRenderNiveaux();
  _quoteRenderPacks();
  _quoteRenderOptionsStep();

  const banner = document.getElementById('quote-suggestion-banner');
  banner.style.display = '';
  if (suggestion) {
    banner.className = 'diag-notice diag-notice-info';
    banner.textContent = `💡 Prestation suggérée d'après le diagnostic (${lead.attack_type}) : ${suggestion.label} — modifiable ci-dessous.`;
    _quoteSwitchMode(suggestion.type === 'complexe' ? 'complexe' : (suggestion.type === 'pack' ? 'packs' : 'niveaux'));
  } else {
    banner.className = 'diag-notice diag-notice-warning';
    banner.textContent = '⚠️ Aucune suggestion automatique pour ce diagnostic — sélectionnez la prestation manuellement.';
    _quoteSwitchMode('niveaux');
  }
  _quoteHighlightSelection();

  document.getElementById('quote-modal').classList.add('show');
  _quoteGoToStep(1);
}

function closeQuoteModal() {
  document.getElementById('quote-modal').classList.remove('show');
}

// ── Rendu étape 1 : prestation ──
function _quoteRenderNiveaux() {
  const container = document.getElementById('quote-niveaux-container');
  container.innerHTML = _quoteTarifs.niveaux.map(niveau => `
    <div class="tt-phase quote-niveau open" data-niveau="${niveau.id}">
      <div class="tt-phase-summary quote-niveau-summary">
        <span>${escapeHtml(niveau.label)}${niveau.description ? ` — ${escapeHtml(niveau.description)}` : ''}</span>
        <span class="tt-phase-count">${niveau.prestations.length}</span>
      </div>
      <div class="tt-phase-tasks quote-prestation-list">
        ${niveau.prestations.map(p => `
          <div class="quote-prestation-card" data-presta-id="${p.id}" data-ht="${p.ht}" data-label="${escapeHtml(p.label)}">
            <span class="quote-prestation-label">${escapeHtml(p.label)}</span>
            <span class="quote-prestation-price">${formatMoney(p.ht)} HT</span>
          </div>
        `).join('')}
      </div>
    </div>
  `).join('');

  container.querySelectorAll('.quote-niveau-summary').forEach(s => {
    s.addEventListener('click', () => s.closest('.quote-niveau').classList.toggle('open'));
  });
  container.querySelectorAll('.quote-prestation-card').forEach(card => {
    card.addEventListener('click', () => {
      _quoteSelection = {
        type: 'prestation', id: card.dataset.prestaId, label: card.dataset.label,
        ht: Number(card.dataset.ht), source: 'manuel', diagnosticCode: null,
      };
      _quoteHighlightSelection();
      _quoteRenderSummaryLive();
    });
  });
}

function _quoteRenderPacks() {
  const container = document.getElementById('quote-packs-container');
  container.innerHTML = _quoteTarifs.packs.map(pack => `
    <div class="quote-pack-card" data-pack-id="${pack.id}" data-ht="${pack.ht}" data-label="${escapeHtml(pack.label)}">
      <div class="quote-pack-head">
        <span class="quote-pack-label">${escapeHtml(pack.label)}</span>
        <span class="quote-pack-price">${formatMoney(pack.ht)} HT</span>
      </div>
      <ul class="quote-pack-inclus">${pack.inclus.map(i => `<li>${escapeHtml(i)}</li>`).join('')}</ul>
    </div>
  `).join('');

  container.querySelectorAll('.quote-pack-card').forEach(card => {
    card.addEventListener('click', () => {
      _quoteSelection = {
        type: 'pack', id: card.dataset.packId, label: card.dataset.label,
        ht: Number(card.dataset.ht), source: 'manuel', diagnosticCode: null,
      };
      _quoteHighlightSelection();
      _quoteRenderSummaryLive();
    });
  });
}

function _quoteSwitchMode(mode) {
  document.querySelectorAll('.quote-mode-tab').forEach(t => t.classList.toggle('active', t.dataset.mode === mode));
  document.getElementById('quote-niveaux-container').style.display = mode === 'niveaux' ? '' : 'none';
  document.getElementById('quote-packs-container').style.display = mode === 'packs' ? '' : 'none';
  document.getElementById('quote-complexe-container').style.display = mode === 'complexe' ? '' : 'none';
}

function _quoteHighlightSelection() {
  document.querySelectorAll('.quote-prestation-card, .quote-pack-card').forEach(c => c.classList.remove('selected'));
  if (!_quoteSelection) return;
  if (_quoteSelection.type === 'prestation') {
    const card = document.querySelector(`.quote-prestation-card[data-presta-id="${_quoteSelection.id}"]`);
    if (card) { card.classList.add('selected'); card.closest('.quote-niveau')?.classList.add('open'); }
  } else if (_quoteSelection.type === 'pack') {
    const card = document.querySelector(`.quote-pack-card[data-pack-id="${_quoteSelection.id}"]`);
    if (card) card.classList.add('selected');
  } else if (_quoteSelection.type === 'complexe') {
    document.getElementById('quote-complexe-hours').value = _quoteSelection.ht && _quoteTarifs.cas_complexe.taux_horaire
      ? (_quoteSelection.ht / _quoteTarifs.cas_complexe.taux_horaire) : '';
  }
}

// ── Rendu étape 2 : options et accompagnement ──
function _quoteRenderOptionsStep() {
  const optContainer = document.getElementById('quote-options-container');
  optContainer.innerHTML = _quoteTarifs.options.map(o => {
    const priceLabel = o.type === 'pourcentage' ? `+${o.valeur} %` : o.type === 'bareme' ? 'à définir' : `+${formatMoney(o.ht)}`;
    return `
      <label class="quote-check-item">
        <input type="checkbox" class="quote-opt-checkbox" data-id="${o.id}">
        <span>${escapeHtml(o.label)}</span>
        <span class="quote-check-price">${priceLabel}</span>
      </label>`;
  }).join('');

  const accContainer = document.getElementById('quote-accompagnement-container');
  accContainer.innerHTML = _quoteTarifs.accompagnement.map(a => {
    if (a.inclus) {
      return `<div class="quote-check-item quote-check-included"><span>${escapeHtml(a.label)}</span><span class="quote-check-price">Inclus</span></div>`;
    }
    return `
      <label class="quote-check-item">
        <input type="checkbox" class="quote-acc-checkbox" data-id="${a.id}">
        <span>${escapeHtml(a.label)}</span>
        <span class="quote-check-price">+${formatMoney(a.ht)}</span>
      </label>`;
  }).join('');

  optContainer.querySelectorAll('.quote-opt-checkbox').forEach(cb => {
    cb.addEventListener('change', () => {
      _quoteOptions[cb.dataset.id] = cb.checked;
      if (cb.dataset.id === 'O4') document.getElementById('quote-o4-field').style.display = cb.checked ? '' : 'none';
      _quoteRenderSummaryLive();
    });
  });
  accContainer.querySelectorAll('.quote-acc-checkbox').forEach(cb => {
    cb.addEventListener('change', () => {
      _quoteAccompagnement[cb.dataset.id] = cb.checked;
      _quoteRenderSummaryLive();
    });
  });
}

// ── Calcul du total ──
function _quoteComputeHt() {
  const baseHt = _quoteSelection ? (Number(_quoteSelection.ht) || 0) : 0;
  let total = baseHt;
  const lines = [];
  if (_quoteSelection) lines.push({ label: _quoteSelection.label, montant: baseHt });

  _quoteTarifs.options.forEach(o => {
    if (!_quoteOptions[o.id]) return;
    if (o.type === 'fixe') {
      total += o.ht;
      lines.push({ label: o.label, montant: o.ht });
    } else if (o.type === 'pourcentage') {
      const m = baseHt * (o.valeur / 100);
      total += m;
      lines.push({ label: `${o.label} (+${o.valeur}%)`, montant: m });
    } else if (o.type === 'bareme') {
      const detail = document.getElementById('quote-o4-text').value.trim();
      lines.push({ label: `${o.label}${detail ? ' — ' + detail : ''}`, montant: 0, note: 'à ajouter manuellement' });
    }
  });

  _quoteTarifs.accompagnement.forEach(a => {
    if (a.inclus) { lines.push({ label: a.label, montant: 0, inclus: true }); return; }
    if (!_quoteAccompagnement[a.id]) return;
    total += a.ht;
    lines.push({ label: a.label, montant: a.ht });
  });

  return { total, lines };
}

function _quoteIsModifiedFromSuggestion() {
  if (_quoteHtOverridden) return true;
  if (!_quoteSuggested) return false;
  if (!_quoteSelection) return true;
  if (_quoteSelection.type !== _quoteSuggested.type || _quoteSelection.id !== _quoteSuggested.id) return true;
  if (Object.values(_quoteOptions).some(Boolean)) return true;
  if (Object.values(_quoteAccompagnement).some(Boolean)) return true;
  return false;
}

function _quoteUpdateTtcDisplay() {
  const ht = parseFloat(document.getElementById('quote-ht-override').value) || 0;
  const tva = ht * _quoteTarifs.tva;
  const ttc = ht + tva;
  document.getElementById('quote-ttc-display').value = `${formatMoney(tva)}  /  ${formatMoney(ttc)} TTC`;
}

// Remise = prix initial (calculé depuis prestation+options+accompagnement) - montant HT
// final retenu (champ modifiable). Positif = remise accordée, négatif = majoration.
let _quoteLastComputedTotal = 0;

function _quoteUpdateRemiseDisplay() {
  const ht = parseFloat(document.getElementById('quote-ht-override').value) || 0;
  const remise = _quoteLastComputedTotal - ht;
  const el = document.getElementById('quote-remise-display');
  if (Math.abs(remise) < 0.005) { el.style.display = 'none'; return; }
  el.style.display = '';
  if (remise > 0) {
    el.className = 'quote-remise-display quote-remise-discount';
    el.textContent = `↓ Remise accordée : -${formatMoney(remise)} HT (prix initial ${formatMoney(_quoteLastComputedTotal)})`;
  } else {
    el.className = 'quote-remise-display quote-remise-surcharge';
    el.textContent = `↑ Majoration : +${formatMoney(-remise)} HT (prix initial ${formatMoney(_quoteLastComputedTotal)})`;
  }
}

function _quoteRenderSummaryLive() {
  if (!_quoteTarifs) return;
  const { total, lines } = _quoteComputeHt();
  _quoteLastComputedTotal = total;
  const htInput = document.getElementById('quote-ht-override');
  if (!_quoteHtOverridden) htInput.value = total.toFixed(2);
  _quoteUpdateTtcDisplay();
  _quoteUpdateRemiseDisplay();

  const table = document.getElementById('quote-summary-table');
  table.innerHTML = lines.length
    ? lines.map(l => `
        <div class="quote-summary-row${l.inclus ? ' quote-summary-included' : ''}">
          <span>${escapeHtml(l.label)}</span>
          <span>${l.inclus ? 'Inclus' : (l.note ? l.note : formatMoney(l.montant))}</span>
        </div>`).join('')
    : '<div class="quote-summary-row quote-summary-empty">Aucune prestation sélectionnée</div>';

  document.getElementById('quote-modified-badge').style.display = _quoteIsModifiedFromSuggestion() ? '' : 'none';
}

// ── Navigation ──
function _quoteGoToStep(step) {
  if (step < 1 || step > _quoteTotalSteps) return;
  _quoteStep = step;

  document.querySelectorAll('#quote-modal .diag-section').forEach((s, i) => {
    s.classList.toggle('active', i + 1 === _quoteStep);
  });
  document.querySelectorAll('#quote-steps .diag-step').forEach((s, i) => {
    s.classList.remove('active', 'done');
    if (i + 1 < _quoteStep) s.classList.add('done');
    if (i + 1 === _quoteStep) s.classList.add('active');
    const dot = s.querySelector('.diag-step-dot');
    dot.innerHTML = (i + 1 < _quoteStep) ? '✓' : String(i + 1);
  });

  document.getElementById('quote-progress').style.width = (_quoteStep / _quoteTotalSteps * 100) + '%';
  document.getElementById('quote-step-counter').textContent = `Étape ${_quoteStep} / ${_quoteTotalSteps}`;

  const btnPrev = document.getElementById('btn-quote-prev');
  const btnNext = document.getElementById('btn-quote-next');
  const btnDownload = document.getElementById('btn-quote-download');
  btnPrev.style.display = _quoteStep === 1 ? 'none' : '';
  if (_quoteStep === _quoteTotalSteps) {
    btnDownload.style.display = '';
    btnNext.textContent = '✅ Valider et envoyer au client';
    btnNext.classList.add('btn-diag-save');
    _quoteRenderSummaryLive();

    const lead = _v17Leads.find(l => l.id === _quoteLeadId);
    const hasEmail = !!(lead && lead.email);
    document.getElementById('quote-no-email-warning').style.display = hasEmail ? 'none' : '';
    btnNext.disabled = !hasEmail;
  } else {
    btnDownload.style.display = 'none';
    btnNext.textContent = 'Suivant →';
    btnNext.classList.remove('btn-diag-save');
    btnNext.disabled = false;
  }
}

// Construit l'objet devis composé (prestation + options + accompagnement +
// remise) à partir de l'état courant de la modale. Partagé par le
// téléchargement local et l'envoi au client — même document dans les deux cas.
function _quoteBuildDevisObject(lead) {
  const ht = parseFloat(document.getElementById('quote-ht-override').value) || 0;
  const tva = ht * _quoteTarifs.tva;
  const ttc = ht + tva;
  const { lines, total: prixInitial } = _quoteComputeHt();
  const remise = Math.round((prixInitial - ht) * 100) / 100;
  const isModified = _quoteIsModifiedFromSuggestion();

  return {
    prestation_label: _quoteSelection.label,
    prestation_id: _quoteSelection.id || null,
    selection_type: _quoteSelection.type || null,
    lines,
    prix_initial: prixInitial,
    remise,
    ht, tva, ttc,
    observations: document.getElementById('quote-observations').value.trim(),
    source: isModified ? 'manuel' : 'auto',
    diagnostic_code: lead.attack_type || null,
  };
}

function _quoteShowSendStatus(message, type) {
  const el = document.getElementById('quote-send-status');
  el.style.display = '';
  el.className = 'quote-send-status quote-send-status-' + type;
  el.textContent = message;
}

// ── Téléchargement local (contrôle avant envoi) ──
async function _quoteDownloadPdf() {
  const lead = _v17Leads.find(l => l.id === _quoteLeadId);
  if (!lead) return;
  if (!_quoteSelection) { alert("Sélectionnez une prestation (étape 1)."); _quoteGoToStep(1); return; }
  if (typeof window.VictimPDF === 'undefined' || !window.VictimPDF.generateQuoteV2) {
    alert('Générateur de devis indisponible.');
    return;
  }

  const devis = _quoteBuildDevisObject(lead);
  const btn = document.getElementById('btn-quote-download');
  btn.disabled = true;

  try {
    window.VictimPDF.generateQuoteV2(lead, devis);

    const { data: updated } = await sb.from('cybervictim_leads')
      .update({ quote_generated_at: new Date().toISOString() })
      .eq('id', _quoteLeadId).select().single();
    if (updated) Object.assign(lead, updated);

    await logRgpd('victim_devis_genere', 'Victimes17Cyber', {
      entityType: 'cybervictim_lead',
      entityId:   _quoteLeadId,
      donnees:    'Téléchargement local du devis PDF (contrôle avant envoi)',
      criticite:  'Info',
      details:    {
        prestation_id: _quoteSelection.id, prestation_label: _quoteSelection.label,
        prix_initial: devis.prix_initial, remise: devis.remise, ht: devis.ht, ttc: devis.ttc,
        source: devis.source, diagnostic_code: devis.diagnostic_code,
      },
    });
    _quoteShowSendStatus('📄 PDF téléchargé — vérifiez-le avant de valider l\'envoi.', 'info');
  } catch (e) {
    alert('Erreur : ' + e.message);
  } finally {
    btn.disabled = false;
  }
}

// ── Envoi au client : session Stripe Checkout + e-mail Brevo (PDF joint) ──
async function _quoteSendToClient() {
  const lead = _v17Leads.find(l => l.id === _quoteLeadId);
  if (!lead) return;
  if (!_quoteSelection) { alert("Sélectionnez une prestation (étape 1)."); _quoteGoToStep(1); return; }
  if (!lead.email) { alert("Aucun e-mail renseigné pour ce dossier — impossible d'envoyer."); return; }
  if (typeof window.VictimPDF === 'undefined' || !window.VictimPDF.getQuoteV2PdfBase64) {
    alert('Générateur de devis indisponible.');
    return;
  }
  if (!confirm(`Envoyer le devis (${document.getElementById('quote-ht-override').value} € HT) et le lien de paiement à ${lead.email} ?`)) return;

  const devis = _quoteBuildDevisObject(lead);
  const btn = document.getElementById('btn-quote-next');
  btn.disabled = true;
  btn.textContent = 'Envoi en cours…';
  _quoteShowSendStatus('✉️ Génération du devis et de la session de paiement…', 'info');

  try {
    const { base64, filename } = window.VictimPDF.getQuoteV2PdfBase64(lead, devis);
    const { data: { session } } = await sb.auth.getSession();

    const resp = await fetch(`${SUPABASE_URL}/functions/v1/send-cybervictim-quote`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${session.access_token}`,
        'apikey': SUPABASE_ANON_KEY,
      },
      body: JSON.stringify({ lead_id: _quoteLeadId, devis, pdf_base64: base64, pdf_filename: filename }),
    });
    const result = await resp.json();
    if (!resp.ok || result.error) {
      throw new Error(result.details || result.error || 'Erreur inconnue');
    }

    if (result.lead) Object.assign(lead, result.lead);

    await logRgpd('victim_devis_envoye', 'Victimes17Cyber', {
      entityType: 'cybervictim_lead',
      entityId:   _quoteLeadId,
      donnees:    'Envoi du devis par e-mail (Brevo) avec lien de paiement Stripe',
      criticite:  'Info',
      details:    {
        prestation_id: _quoteSelection.id, prestation_label: _quoteSelection.label,
        prix_initial: devis.prix_initial, remise: devis.remise, ht: devis.ht, ttc: devis.ttc,
        source: devis.source, diagnostic_code: devis.diagnostic_code,
        recipient: lead.email, stripe_session_id: lead.stripe_session_id,
      },
    });

    closeQuoteModal();
    _v17RenderBoard();
    showCrmToast('✅ Devis envoyé au client');
  } catch (e) {
    _quoteShowSendStatus('❌ Échec de l\'envoi : ' + e.message, 'error');
  } finally {
    btn.disabled = false;
    _quoteGoToStep(_quoteStep);
  }
}

// ── Attache les listeners une seule fois (modale statique dans le DOM) ──
function _quoteInit() {
  document.querySelectorAll('.quote-mode-tab').forEach(tab => {
    tab.addEventListener('click', () => _quoteSwitchMode(tab.dataset.mode));
  });

  const hoursInput = document.getElementById('quote-complexe-hours');
  hoursInput.addEventListener('input', () => {
    const hours = parseFloat(hoursInput.value) || 0;
    _quoteSelection = {
      type: 'complexe', id: null, label: _quoteTarifs.cas_complexe.label,
      ht: hours * _quoteTarifs.cas_complexe.taux_horaire, source: 'manuel', diagnosticCode: null,
    };
    document.querySelectorAll('.quote-prestation-card, .quote-pack-card').forEach(c => c.classList.remove('selected'));
    _quoteRenderSummaryLive();
  });

  document.getElementById('quote-ht-override').addEventListener('input', () => {
    _quoteHtOverridden = true;
    _quoteUpdateTtcDisplay();
    _quoteUpdateRemiseDisplay();
    document.getElementById('quote-modified-badge').style.display = '';
  });
  document.getElementById('quote-o4-text').addEventListener('input', () => _quoteRenderSummaryLive());

  document.querySelectorAll('#quote-steps .diag-step').forEach(s => {
    s.addEventListener('click', () => {
      const step = parseInt(s.dataset.step, 10);
      if (step <= _quoteStep) _quoteGoToStep(step);
    });
  });

  const btnNext = document.getElementById('btn-quote-next');
  const btnPrev = document.getElementById('btn-quote-prev');
  const btnDownload = document.getElementById('btn-quote-download');
  btnNext.addEventListener('click', () => {
    if (_quoteStep === _quoteTotalSteps) _quoteSendToClient();
    else _quoteGoToStep(_quoteStep + 1);
  });
  btnPrev.addEventListener('click', () => _quoteGoToStep(_quoteStep - 1));
  btnDownload.addEventListener('click', () => _quoteDownloadPdf());
}

_quoteInit();
