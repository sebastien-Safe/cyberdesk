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

function _quoteRenderSummaryLive() {
  if (!_quoteTarifs) return;
  const { total, lines } = _quoteComputeHt();
  const htInput = document.getElementById('quote-ht-override');
  if (!_quoteHtOverridden) htInput.value = total.toFixed(2);
  _quoteUpdateTtcDisplay();

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
  btnPrev.style.display = _quoteStep === 1 ? 'none' : '';
  if (_quoteStep === _quoteTotalSteps) {
    btnNext.textContent = '📄 Générer le devis PDF';
    btnNext.classList.add('btn-diag-save');
    _quoteRenderSummaryLive();
  } else {
    btnNext.textContent = 'Suivant →';
    btnNext.classList.remove('btn-diag-save');
  }
}

// ── Finalisation : génération PDF + persistance + journal RGPD ──
async function _quoteFinalize() {
  const lead = _v17Leads.find(l => l.id === _quoteLeadId);
  if (!lead) return;
  if (!_quoteSelection) { alert("Sélectionnez une prestation (étape 1)."); _quoteGoToStep(1); return; }
  if (typeof window.VictimPDF === 'undefined' || !window.VictimPDF.generateQuoteV2) {
    alert('Générateur de devis indisponible.');
    return;
  }

  const ht = parseFloat(document.getElementById('quote-ht-override').value) || 0;
  const tva = ht * _quoteTarifs.tva;
  const ttc = ht + tva;
  const { lines } = _quoteComputeHt();
  const isModified = _quoteIsModifiedFromSuggestion();

  const devis = {
    prestation_label: _quoteSelection.label,
    lines,
    ht, tva, ttc,
    observations: document.getElementById('quote-observations').value.trim(),
    source: isModified ? 'manuel' : 'auto',
    diagnostic_code: lead.attack_type || null,
  };

  const btn = document.getElementById('btn-quote-next');
  btn.disabled = true;
  btn.textContent = 'Génération…';

  try {
    window.VictimPDF.generateQuoteV2(lead, devis);

    const { data: updated } = await sb.from('cybervictim_leads')
      .update({ quote_generated_at: new Date().toISOString() })
      .eq('id', _quoteLeadId).select().single();
    if (updated) Object.assign(lead, updated);

    await logRgpd('victim_devis_genere', 'Victimes17Cyber', {
      entityType: 'cybervictim_lead',
      entityId:   _quoteLeadId,
      donnees:    'Génération du devis PDF (grille tarifaire 17Cyber)',
      criticite:  'Info',
      details:    {
        prestation_id: _quoteSelection.id, prestation_label: _quoteSelection.label,
        ht, ttc, tva, source: devis.source, diagnostic_code: devis.diagnostic_code,
        options: Object.keys(_quoteOptions).filter(k => _quoteOptions[k]),
        accompagnement: Object.keys(_quoteAccompagnement).filter(k => _quoteAccompagnement[k]),
      },
    });

    if (['signalement', 'qualification'].includes(lead.pipeline_stage)) {
      lead.pipeline_stage = 'devis_envoye';
      await sb.from('cybervictim_leads').update({ pipeline_stage: 'devis_envoye' }).eq('id', _quoteLeadId);
      await logRgpd('victim_etape_modifiee', 'Victimes17Cyber', {
        entityType: 'cybervictim_lead', entityId: _quoteLeadId, donnees: 'Changement étape pipeline dossier victime',
        criticite: 'Info', details: { old_stage: 'qualification', new_stage: 'devis_envoye', via: 'generation_devis' },
      });
    }

    closeQuoteModal();
    _v17RenderBoard();
    showCrmToast('✅ Devis généré');
  } catch (e) {
    alert('Erreur : ' + e.message);
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
  btnNext.addEventListener('click', () => {
    if (_quoteStep === _quoteTotalSteps) _quoteFinalize();
    else _quoteGoToStep(_quoteStep + 1);
  });
  btnPrev.addEventListener('click', () => _quoteGoToStep(_quoteStep - 1));
}

_quoteInit();
