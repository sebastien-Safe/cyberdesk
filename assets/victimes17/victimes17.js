/* ═══════════════════════════════════════════
   CyberDesk — Kanban dossiers victimes (pipeline 17Cyber)
   Étapes : signalement → qualification → devis_envoye →
            paiement_recu → rapport_livre → cloture
   ═══════════════════════════════════════════ */

const V17_COLS = [
  { id: 'signalement',   label: 'Signalement entrant', color: '#475569', icon: '📥' },
  { id: 'qualification', label: 'Qualification',       color: '#3b82f6', icon: '🔍' },
  { id: 'devis_envoye',  label: 'Devis envoyé',        color: '#8b5cf6', icon: '📋' },
  { id: 'paiement_recu', label: 'Paiement reçu',       color: '#f59e0b', icon: '💳' },
  { id: 'rapport_livre', label: 'Rapport livré',       color: '#22c55e', icon: '📄' },
  { id: 'cloture',       label: 'Clôturé',             color: '#6b7280', icon: '🏁' },
];

let _v17Leads       = [];
let _v17Products    = [];
let _v17ProductsById = {};
let _v17Search      = '';
let _v17Dragging    = null;

// ── Init principale ──
async function initVictimes17() {
  const board = document.getElementById('v17-board');
  if (!board) return;
  board.innerHTML = '<div class="pipeline-loading"><div class="pipeline-spinner"></div> Chargement…</div>';
  try {
    await _v17LoadData();
    _v17RenderBoard();
    _v17UpdateTotal();
    const searchEl = document.getElementById('v17-search');
    if (searchEl) searchEl.value = _v17Search;
  } catch (e) {
    board.innerHTML = `<div class="pipeline-loading" style="color:#ef4444">Erreur chargement : ${escapeHtml(e.message)}</div>`;
    console.error('[victimes17]', e);
  }
}

// ── Chargement données ──
async function _v17LoadData() {
  const { data: products, error: pErr } = await sb.from('cybervictim_products').select('*').order('alert_type');
  if (pErr) throw pErr;
  _v17Products = products || [];
  _v17ProductsById = {};
  _v17Products.forEach(p => { _v17ProductsById[p.id] = p; });

  const { data: leads, error: lErr } = await sb.from('cybervictim_leads')
    .select('*, cybervictim_products(code, alert_type, price_ht, price_ttc)')
    .order('created_at', { ascending: false });
  if (lErr) throw lErr;
  _v17Leads = leads || [];
}

// ── Rendu du board ──
function _v17RenderBoard() {
  const board = document.getElementById('v17-board');
  if (!board) return;
  let leads = _v17Leads;

  if (_v17Search) {
    const q = _v17Search.toLowerCase();
    leads = leads.filter(l =>
      (l.first_name || '').toLowerCase().includes(q) ||
      (l.last_name || '').toLowerCase().includes(q) ||
      (l.ticket_number || '').toLowerCase().includes(q)
    );
  }

  const byCol = {};
  V17_COLS.forEach(c => { byCol[c.id] = []; });
  leads.forEach(l => {
    const col = l.pipeline_stage || 'signalement';
    if (byCol[col]) byCol[col].push(l);
  });

  board.innerHTML = V17_COLS.map(col => `
    <div class="pcol" id="v17col-${col.id}">
      <div class="pcol-head">
        <div class="pcol-accent" style="background:${col.color}"></div>
        <div class="pcol-label">${col.icon} ${col.label}</div>
        <div class="pcol-count" id="v17col-count-${col.id}">${byCol[col.id].length}</div>
      </div>
      <div class="pcol-cards" id="v17col-cards-${col.id}"
           ondragover="_v17DragOver(event,'${col.id}')"
           ondragleave="_v17DragLeave(event,'${col.id}')"
           ondrop="_v17Drop(event,'${col.id}')">
        ${byCol[col.id].length
          ? byCol[col.id].map(l => _v17CardHTML(l)).join('')
          : '<div class="pcol-empty">Aucun dossier</div>'}
      </div>
    </div>
  `).join('');
}

// ── HTML d'une carte ──
function _v17CardHTML(lead) {
  const product = lead.cybervictim_products || {};
  const dateStr = lead.created_at ? new Date(lead.created_at).toLocaleDateString('fr-FR') : '—';

  return `
  <div class="pcard" id="v17card-${lead.id}"
       draggable="true"
       ondragstart="_v17DragStart(event,'${lead.id}')"
       ondragend="_v17DragEnd()">
    <div style="padding-left:6px">
      <div class="pcard-company">${escapeHtml(lead.first_name || '')} ${escapeHtml(lead.last_name || '')}</div>
      <div class="v17-alert-badge">${escapeHtml(product.alert_type || '—')}</div>
      ${lead.ticket_number ? `<div class="v17-ticket-badge">🎫 ${escapeHtml(lead.ticket_number)}</div>` : ''}
      <div class="pcard-meta">
        <div class="pcard-meta-item v17-price-badge">💰 ${formatMoney(product.price_ttc)} TTC</div>
        <div class="pcard-meta-item">📅 ${dateStr}</div>
        ${lead.task_completion_pct ? `<div class="pcard-meta-item">🗂️ ${lead.task_completion_pct}% tâches</div>` : ''}
      </div>
      ${lead.notes ? `<div class="pcard-meta-item" style="margin-top:4px;font-size:.76rem;opacity:.75">📝 ${escapeHtml(lead.notes.slice(0, 80))}${lead.notes.length > 80 ? '…' : ''}</div>` : ''}
    </div>
    <div class="pcard-actions">
      <button class="pcard-edit-btn" onclick="openEditVictimLeadModal('${lead.id}')">✏️ Diagnostic</button>
      <button class="pcard-edit-btn" onclick="generateVictimQuote('${lead.id}')">📋 Générer le devis</button>
      <button class="pcard-edit-btn" onclick="openTaskTreeModal('${lead.id}')">🗂️ Suivi d'intervention</button>
      <button class="pcard-edit-btn" onclick="generateVictimReport('${lead.id}')">📄 Générer le rapport (PDF simple)</button>
      <button class="pcard-edit-btn pcard-del-btn" onclick="confirmDeleteVictimLead('${lead.id}', this)">🗑️ Supprimer</button>
    </div>
  </div>`;
}

// ── Suppression dossier (confirmation en deux clics) ──
// 1er clic : le bouton passe en état "armé" (rouge, texte de confirmation).
// 2e clic dans les 4s sur le même bouton : suppression effective.
// Sans 2e clic, le bouton revient automatiquement à son état normal.
let _v17DeleteArmedId = null;
let _v17DeleteArmedTimeout = null;

function _v17ResetDeleteButton(leadId) {
  const btn = document.querySelector(`#v17card-${leadId} .pcard-del-btn`);
  if (btn) { btn.textContent = '🗑️ Supprimer'; btn.classList.remove('armed'); }
  if (_v17DeleteArmedId === leadId) _v17DeleteArmedId = null;
}

function confirmDeleteVictimLead(leadId, btn) {
  if (_v17DeleteArmedId === leadId) {
    clearTimeout(_v17DeleteArmedTimeout);
    _v17DeleteArmedId = null;
    _v17DeleteLead(leadId);
    return;
  }
  if (_v17DeleteArmedId) _v17ResetDeleteButton(_v17DeleteArmedId);

  _v17DeleteArmedId = leadId;
  btn.textContent = '❗ Confirmer la suppression ?';
  btn.classList.add('armed');
  clearTimeout(_v17DeleteArmedTimeout);
  _v17DeleteArmedTimeout = setTimeout(() => _v17ResetDeleteButton(leadId), 4000);
}

async function _v17DeleteLead(leadId) {
  const lead = _v17Leads.find(l => l.id === leadId);
  if (!lead) return;
  const btn = document.querySelector(`#v17card-${leadId} .pcard-del-btn`);
  if (btn) { btn.disabled = true; btn.textContent = 'Suppression…'; }

  try {
    const { error } = await sb.from('cybervictim_leads').delete().eq('id', leadId);
    if (error) throw error;

    await logRgpd('victim_lead_supprime', 'Victimes17Cyber', {
      entityType: 'cybervictim_lead',
      entityId:   leadId,
      donnees:    'Suppression dossier victime 17Cyber',
      criticite:  'Attention',
      details:    { first_name: lead.first_name, last_name: lead.last_name, ticket_number: lead.ticket_number, pipeline_stage: lead.pipeline_stage },
    });

    _v17Leads = _v17Leads.filter(l => l.id !== leadId);
    _v17RenderBoard();
    _v17UpdateTotal();
    showCrmToast('🗑️ Dossier supprimé');
  } catch (e) {
    alert('Erreur lors de la suppression : ' + e.message);
    if (btn) { btn.disabled = false; }
    _v17ResetDeleteButton(leadId);
  }
}

// ── DRAG & DROP ──
function _v17DragStart(event, leadId) {
  _v17Dragging = leadId;
  event.dataTransfer.effectAllowed = 'move';
  event.dataTransfer.setData('text/plain', leadId);
  setTimeout(() => document.getElementById(`v17card-${leadId}`)?.classList.add('dragging'), 0);
}

function _v17DragEnd() {
  if (_v17Dragging) document.getElementById(`v17card-${_v17Dragging}`)?.classList.remove('dragging');
  document.querySelectorAll('#v17-board .pcol-cards').forEach(c => c.classList.remove('drag-over'));
}

function _v17DragOver(event, colId) {
  event.preventDefault();
  event.dataTransfer.dropEffect = 'move';
  document.getElementById(`v17col-cards-${colId}`)?.classList.add('drag-over');
}

function _v17DragLeave(event, colId) {
  document.getElementById(`v17col-cards-${colId}`)?.classList.remove('drag-over');
}

async function _v17Drop(event, colId) {
  event.preventDefault();
  document.querySelectorAll('#v17-board .pcol-cards').forEach(c => c.classList.remove('drag-over'));
  const leadId = event.dataTransfer.getData('text/plain') || _v17Dragging;
  if (!leadId) return;
  const lead = _v17Leads.find(l => l.id === leadId);
  if (!lead || lead.pipeline_stage === colId) return;

  if (colId === 'cloture' && !confirm(
    'Clôturer ce dossier ?\n\nLes délais de purge RGPD démarrent à cette date : ' +
    'anonymisation des données personnelles dans 5 ans, suppression des références documents dans 10 ans.'
  )) return;

  const oldStage = lead.pipeline_stage;
  lead.pipeline_stage = colId;

  const { data: updated, error } = await sb.from('cybervictim_leads')
    .update({ pipeline_stage: colId })
    .eq('id', leadId)
    .select()
    .single();

  if (error) {
    alert('Erreur : ' + error.message);
    lead.pipeline_stage = oldStage;
    _v17RenderBoard();
    return;
  }
  if (updated) Object.assign(lead, updated);

  await logRgpd('victim_etape_modifiee', 'Victimes17Cyber', {
    entityType: 'cybervictim_lead',
    entityId:   leadId,
    donnees:    'Changement étape pipeline dossier victime',
    criticite:  'Info',
    details:    { old_stage: oldStage, new_stage: colId },
  });
  if (colId === 'cloture') {
    await logRgpd('victim_dossier_cloture', 'Victimes17Cyber', {
      entityType: 'cybervictim_lead',
      entityId:   leadId,
      donnees:    'Clôture dossier — déclenche les délais de purge RGPD',
      criticite:  'Attention',
      details:    {
        closed_at:              updated?.closed_at,
        purge_due_at:           updated?.purge_due_at,
        documents_purge_due_at: updated?.documents_purge_due_at,
      },
    });
  }

  _v17RenderBoard();
  _v17UpdateTotal();
  _v17Dragging = null;
}

// ── Recherche ──
function _v17ApplySearch() {
  _v17Search = document.getElementById('v17-search')?.value || '';
  _v17RenderBoard();
}

function _v17UpdateTotal() {
  const el = document.getElementById('v17-total');
  if (el) el.innerHTML = `<span>Dossiers actifs</span> — ${_v17Leads.filter(l => l.pipeline_stage !== 'cloture').length}`;
}

// ── Modale « Diagnostic dossier victime » (5 étapes) ──
// Conforme Charte Cybermalveillance.gouv.fr v2.5 — art. 3a/3b.
// La modale est statique dans index.html (jamais réinjectée) : les
// listeners sont attachés UNE SEULE FOIS par _diagInit(), appelée en bas
// de ce fichier. openVictimLeadModal()/openEditVictimLeadModal() ne font
// que réinitialiser/pré-remplir les champs et remettre l'étape à 1.

const V17_TIMELINE_MAX = 20; // garde-fou anti-abus sur les entrées libres
const V17_PROOF_TYPES = [
  'Email de phishing', "Capture d'écran", 'Log système',
  'Fichier chiffré (rançon)', 'Message frauduleux',
  'Relevé bancaire', 'Rapport antivirus', 'Autre',
];

let _diagStep = 1;
const _diagTotalSteps = 5;

function _diagGoToStep(step) {
  if (step < 1 || step > _diagTotalSteps) return;
  _diagStep = step;

  document.querySelectorAll('.diag-section').forEach((s, i) => {
    s.classList.toggle('active', i + 1 === _diagStep);
  });

  document.querySelectorAll('.diag-step').forEach((s, i) => {
    s.classList.remove('active', 'done');
    if (i + 1 < _diagStep) s.classList.add('done');
    if (i + 1 === _diagStep) s.classList.add('active');
    const dot = s.querySelector('.diag-step-dot');
    dot.innerHTML = (i + 1 < _diagStep) ? '✓' : String(i + 1);
  });

  const bar = document.getElementById('diagnostic-progress');
  if (bar) bar.style.width = (_diagStep / _diagTotalSteps * 100) + '%';

  const counter = document.getElementById('diag-step-counter');
  if (counter) counter.textContent = `Étape ${_diagStep} / ${_diagTotalSteps}`;

  const btnPrev = document.getElementById('btn-diag-prev');
  const btnNext = document.getElementById('btn-diag-next');
  if (btnPrev) btnPrev.style.display = _diagStep === 1 ? 'none' : '';
  if (btnNext) {
    if (_diagStep === _diagTotalSteps) {
      btnNext.textContent = '💾 Enregistrer le dossier';
      btnNext.classList.add('btn-diag-save');
    } else {
      btnNext.textContent = 'Suivant →';
      btnNext.classList.remove('btn-diag-save');
    }
  }
}

function _diagSelectChip(container, value) {
  container.querySelectorAll('.diag-chip').forEach(c => {
    c.classList.toggle('selected', c.dataset.value === value);
  });
}

function _diagGetSelectedChip(containerId) {
  const el = document.querySelector(`#${containerId} .diag-chip.selected`);
  return el ? el.dataset.value : null;
}

function _diagGetSelectedImpacts() {
  return Array.from(document.querySelectorAll('.diag-impact-card.selected')).map(c => c.dataset.value);
}

function _diagAddTimelineEntry(date = '', description = '') {
  const container = document.getElementById('timeline-entries-container');
  if (!container || container.children.length >= V17_TIMELINE_MAX) return;
  const div = document.createElement('div');
  div.className = 'timeline-entry';
  div.innerHTML = `
    <input type="date" class="timeline-entry-date">
    <input type="text" class="timeline-entry-desc" placeholder="Description de l'événement">
    <button type="button" class="diag-del-btn" title="Supprimer">✕</button>
  `;
  div.querySelector('.timeline-entry-date').value = date;
  div.querySelector('.timeline-entry-desc').value = description;
  div.querySelector('.diag-del-btn').addEventListener('click', () => div.remove());
  container.appendChild(div);
}

function _diagAddProofEntry(type = '', details = '') {
  const container = document.getElementById('proofs-container');
  if (!container || container.children.length >= V17_TIMELINE_MAX) return;
  const div = document.createElement('div');
  div.className = 'proof-entry';
  const sel = document.createElement('select');
  sel.className = 'proof-entry-type';
  sel.innerHTML = V17_PROOF_TYPES.map(t => `<option value="${escapeHtml(t)}">${escapeHtml(t)}</option>`).join('');
  if (type) sel.value = type;
  const input = document.createElement('input');
  input.type = 'text';
  input.className = 'proof-entry-details';
  input.placeholder = 'Précisions, localisation...';
  input.value = details;
  const del = document.createElement('button');
  del.type = 'button';
  del.className = 'diag-del-btn';
  del.title = 'Supprimer';
  del.textContent = '✕';
  del.addEventListener('click', () => div.remove());
  div.append(sel, input, del);
  container.appendChild(div);
}

function _diagGetTimelineEvents() {
  return Array.from(document.querySelectorAll('.timeline-entry')).map(entry => ({
    date: entry.querySelector('.timeline-entry-date').value,
    description: entry.querySelector('.timeline-entry-desc').value.trim(),
  })).filter(e => e.date || e.description);
}

function _diagGetAvailableProofs() {
  return Array.from(document.querySelectorAll('.proof-entry')).map(entry => ({
    type: entry.querySelector('.proof-entry-type').value,
    details: entry.querySelector('.proof-entry-details').value.trim(),
  })).filter(p => p.details);
}

// Remet la modale à l'état "nouveau dossier vierge".
function _diagResetForm() {
  document.getElementById('vl-id').value = '';
  ['diag-first-name', 'diag-last-name', 'diag-phone', 'diag-email', 'diag-city',
   'diag-ticket', 'diag-attack-description', 'diag-targeted-services',
   'diag-financial-loss', 'diag-attack-date', 'diag-attack-time', 'diag-discovery-date',
   'diag-main-proof-ref', 'diag-internal-notes', 'diag-notes'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = '';
  });
  document.getElementById('diag-os-victim').value = '';
  document.getElementById('diag-activity-impacted').value = '';
  document.getElementById('diag-product').value = '';

  _diagSelectChip(document.getElementById('chips-victim-type'), 'particulier');
  _diagSelectChip(document.getElementById('chips-attack-type'), null);
  _diagSelectChip(document.getElementById('chips-severity'), 'moderee');
  _diagSelectChip(document.getElementById('chips-third-party'), 'non');
  _diagSelectChip(document.getElementById('chips-complaint'), 'non_envisage');
  _diagSelectChip(document.getElementById('chips-remontee'), 'true');
  document.querySelectorAll('.diag-impact-card').forEach(c => c.classList.remove('selected'));

  document.getElementById('timeline-entries-container').innerHTML = '';
  _diagAddTimelineEntry();
  document.getElementById('proofs-container').innerHTML = '';
  _diagAddProofEntry();

  _diagGoToStep(1);
}

// Pré-remplit la modale avec un dossier existant (mode édition).
function _diagPrefillForm(lead) {
  document.getElementById('vl-id').value = lead.id;

  document.getElementById('diag-first-name').value = lead.first_name || '';
  document.getElementById('diag-last-name').value = lead.last_name || '';
  document.getElementById('diag-phone').value = lead.phone || '';
  document.getElementById('diag-email').value = lead.email || '';
  document.getElementById('diag-city').value = lead.city || '';
  _diagSelectChip(document.getElementById('chips-victim-type'), lead.victim_type || 'particulier');

  document.getElementById('diag-ticket').value = lead.ticket_number || '';
  document.getElementById('diag-product').value = lead.product_id || '';
  _diagSelectChip(document.getElementById('chips-attack-type'), lead.attack_type);
  document.getElementById('diag-attack-description').value = lead.attack_description || '';
  document.getElementById('diag-os-victim').value = lead.os_victim || '';
  _diagSelectChip(document.getElementById('chips-severity'), lead.severity || 'moderee');
  document.getElementById('diag-targeted-services').value = lead.targeted_services || '';

  document.querySelectorAll('.diag-impact-card').forEach(c => {
    c.classList.toggle('selected', Array.isArray(lead.impacted_systems) && lead.impacted_systems.includes(c.dataset.value));
  });
  document.getElementById('diag-financial-loss').value = lead.financial_loss || '';
  document.getElementById('diag-activity-impacted').value = lead.activity_impacted || '';
  _diagSelectChip(document.getElementById('chips-third-party'), lead.third_party_data_exposed || 'non');

  document.getElementById('diag-attack-date').value = lead.attack_date || '';
  document.getElementById('diag-attack-time').value = lead.attack_time || '';
  document.getElementById('diag-discovery-date').value = lead.discovery_date || '';
  document.getElementById('timeline-entries-container').innerHTML = '';
  const events = Array.isArray(lead.timeline_events) ? lead.timeline_events : [];
  if (events.length) events.forEach(e => _diagAddTimelineEntry(e.date, e.description));
  else _diagAddTimelineEntry();
  _diagSelectChip(document.getElementById('chips-complaint'), lead.complaint_status || 'non_envisage');

  document.getElementById('proofs-container').innerHTML = '';
  const proofs = Array.isArray(lead.available_proofs) ? lead.available_proofs : [];
  if (proofs.length) proofs.forEach(p => _diagAddProofEntry(p.type, p.details));
  else _diagAddProofEntry();
  document.getElementById('diag-main-proof-ref').value = lead.main_proof_ref || '';
  _diagSelectChip(document.getElementById('chips-remontee'), lead.remontee_cybermalveillance === false ? 'false' : 'true');
  document.getElementById('diag-internal-notes').value = lead.internal_notes || '';
  document.getElementById('diag-notes').value = lead.notes || '';

  _diagGoToStep(1);
}

async function _diagPopulateProductSelect() {
  if (!_v17Products.length) {
    try { await _v17LoadData(); } catch (e) { console.error('[victimes17]', e); }
  }
  // La modale doit être affichée avant qu'on peuple le <select> — Safari
  // peut sinon ne plus réagir aux clics sur un select dont le contenu a
  // été injecté pendant que son conteneur était encore display:none.
  requestAnimationFrame(() => {
    const sel = document.getElementById('diag-product');
    const current = sel.value;
    sel.innerHTML = '<option value="">Sélectionner une alerte…</option>' +
      _v17Products.map(p => `<option value="${p.id}">${escapeHtml(p.alert_type)} — ${formatMoney(p.price_ttc)} TTC</option>`).join('');
    if (current) sel.value = current;
  });
}

async function openVictimLeadModal() {
  document.getElementById('victim-lead-modal-title').textContent = 'Nouveau dossier victime';
  document.getElementById('victim-lead-modal').classList.add('show');
  _diagResetForm();
  await _diagPopulateProductSelect();
}

function openEditVictimLeadModal(leadId) {
  const lead = _v17Leads.find(l => l.id === leadId);
  if (!lead) return;
  document.getElementById('victim-lead-modal-title').textContent =
    `Modifier — ${lead.first_name || ''} ${lead.last_name || ''}`.trim();
  document.getElementById('victim-lead-modal').classList.add('show');
  _diagPrefillForm(lead);
  _diagPopulateProductSelect();
}

function closeVictimLeadModal() {
  document.getElementById('victim-lead-modal').classList.remove('show');
}

async function saveVictimLead() {
  const firstName = document.getElementById('diag-first-name').value.trim();
  const lastName  = document.getElementById('diag-last-name').value.trim();
  const phone     = document.getElementById('diag-phone').value.trim();
  const productId = document.getElementById('diag-product').value;

  if (!firstName || !lastName || !phone) {
    alert('Prénom, nom et téléphone sont obligatoires (étape 1).');
    _diagGoToStep(1);
    return;
  }
  if (!productId) {
    alert("Sélectionnez le type d'alerte / produit (étape 2).");
    _diagGoToStep(2);
    return;
  }

  const leadId = document.getElementById('vl-id').value || null;
  const btn = document.getElementById('btn-diag-next');
  btn.disabled = true;
  btn.textContent = 'Enregistrement…';

  const payload = {
    // Étape 1
    first_name:  firstName,
    last_name:   lastName,
    phone:       phone,
    email:       document.getElementById('diag-email').value.trim() || null,
    city:        document.getElementById('diag-city').value.trim() || null,
    victim_type: _diagGetSelectedChip('chips-victim-type'),

    // Étape 2
    ticket_number:       document.getElementById('diag-ticket').value.trim() || null,
    product_id:          productId,
    attack_type:         _diagGetSelectedChip('chips-attack-type'),
    attack_description:  document.getElementById('diag-attack-description').value.trim() || null,
    os_victim:           document.getElementById('diag-os-victim').value || null,
    severity:            _diagGetSelectedChip('chips-severity') || 'moderee',
    targeted_services:   document.getElementById('diag-targeted-services').value.trim() || null,

    // Étape 3
    impacted_systems:         _diagGetSelectedImpacts(),
    financial_loss:           document.getElementById('diag-financial-loss').value.trim() || null,
    activity_impacted:        document.getElementById('diag-activity-impacted').value || null,
    third_party_data_exposed: _diagGetSelectedChip('chips-third-party') || 'non',

    // Étape 4
    attack_date:      document.getElementById('diag-attack-date').value || null,
    attack_time:       document.getElementById('diag-attack-time').value || null,
    discovery_date:    document.getElementById('diag-discovery-date').value || null,
    timeline_events:   _diagGetTimelineEvents(),
    complaint_status:  _diagGetSelectedChip('chips-complaint') || 'non_envisage',

    // Étape 5
    available_proofs:            _diagGetAvailableProofs(),
    main_proof_ref:               document.getElementById('diag-main-proof-ref').value.trim() || null,
    remontee_cybermalveillance:   _diagGetSelectedChip('chips-remontee') !== 'false',
    internal_notes:               document.getElementById('diag-internal-notes').value.trim() || null,
    notes:                         document.getElementById('diag-notes').value.trim() || null,
  };
  if (!leadId) payload.source = '17cyber'; // valeur par défaut à la création uniquement

  try {
    let data, error;
    if (leadId) {
      ({ data, error } = await sb.from('cybervictim_leads').update(payload).eq('id', leadId).select().single());
    } else {
      ({ data, error } = await sb.from('cybervictim_leads').insert(payload).select().single());
    }
    if (error) throw error;

    await logRgpd(leadId ? 'victim_lead_modifie' : 'victim_lead_cree', 'Victimes17Cyber', {
      entityType: 'cybervictim_lead',
      entityId:   data.id,
      donnees:    leadId ? 'Mise à jour diagnostic dossier victime 17Cyber' : 'Création dossier victime 17Cyber (diagnostic complet)',
      criticite:  'Info',
      details:    { alert_type: _v17ProductsById[productId]?.alert_type, ticket_number: payload.ticket_number, attack_type: payload.attack_type, severity: payload.severity },
    });

    closeVictimLeadModal();
    await initVictimes17();
    showCrmToast(leadId ? '✅ Dossier mis à jour' : '✅ Dossier victime créé');
  } catch (e) {
    alert('Erreur : ' + e.message);
  } finally {
    btn.disabled = false;
    _diagGoToStep(_diagStep); // restaure le libellé correct du bouton
  }
}

// Attache les listeners UNE SEULE FOIS (la modale est statique dans le DOM).
function _diagInit() {
  const btnNext = document.getElementById('btn-diag-next');
  const btnPrev = document.getElementById('btn-diag-prev');
  if (btnNext) btnNext.addEventListener('click', () => {
    if (_diagStep === _diagTotalSteps) saveVictimLead();
    else _diagGoToStep(_diagStep + 1);
  });
  if (btnPrev) btnPrev.addEventListener('click', () => _diagGoToStep(_diagStep - 1));

  document.querySelectorAll('.diag-step').forEach(s => {
    s.addEventListener('click', () => {
      const step = parseInt(s.dataset.step, 10);
      if (step <= _diagStep) _diagGoToStep(step);
    });
  });

  ['chips-victim-type', 'chips-attack-type', 'chips-severity', 'chips-third-party',
   'chips-complaint', 'chips-remontee'].forEach(id => {
    const container = document.getElementById(id);
    if (!container) return;
    container.querySelectorAll('.diag-chip').forEach(chip => {
      chip.addEventListener('click', () => _diagSelectChip(container, chip.dataset.value));
    });
  });

  document.querySelectorAll('.diag-impact-card').forEach(card => {
    card.addEventListener('click', () => card.classList.toggle('selected'));
  });

  const btnAddTimeline = document.getElementById('btn-add-timeline');
  if (btnAddTimeline) btnAddTimeline.addEventListener('click', () => _diagAddTimelineEntry());
  const btnAddProof = document.getElementById('btn-add-proof');
  if (btnAddProof) btnAddProof.addEventListener('click', () => _diagAddProofEntry());
}

// ── Génération devis / rapport (assets/victimes17/victimes17-pdf.js) ──
async function generateVictimQuote(leadId) {
  const lead = _v17Leads.find(l => l.id === leadId);
  if (!lead) return;
  const product = _v17ProductsById[lead.product_id];
  if (!product) { alert('Produit introuvable pour ce dossier.'); return; }
  if (typeof window.VictimPDF === 'undefined') { alert('Générateur PDF indisponible.'); return; }

  window.VictimPDF.generateQuote(lead, product);

  const { data: updated } = await sb.from('cybervictim_leads')
    .update({ quote_generated_at: new Date().toISOString() })
    .eq('id', leadId).select().single();
  if (updated) Object.assign(lead, updated);

  await logRgpd('victim_devis_genere', 'Victimes17Cyber', {
    entityType: 'cybervictim_lead',
    entityId:   leadId,
    donnees:    'Génération du devis PDF',
    criticite:  'Info',
    details:    { product_id: product.id, alert_type: product.alert_type },
  });

  if (['signalement', 'qualification'].includes(lead.pipeline_stage)) {
    lead.pipeline_stage = 'devis_envoye';
    await sb.from('cybervictim_leads').update({ pipeline_stage: 'devis_envoye' }).eq('id', leadId);
    await logRgpd('victim_etape_modifiee', 'Victimes17Cyber', {
      entityType: 'cybervictim_lead', entityId: leadId, donnees: 'Changement étape pipeline dossier victime',
      criticite: 'Info', details: { old_stage: 'qualification', new_stage: 'devis_envoye', via: 'generation_devis' },
    });
  }
  _v17RenderBoard();
}

async function generateVictimReport(leadId) {
  const lead = _v17Leads.find(l => l.id === leadId);
  if (!lead) return;
  const product = _v17ProductsById[lead.product_id];
  if (!product) { alert('Produit introuvable pour ce dossier.'); return; }
  if (typeof window.VictimPDF === 'undefined') { alert('Générateur PDF indisponible.'); return; }

  window.VictimPDF.generateReport(lead, product);

  const { data: updated } = await sb.from('cybervictim_leads')
    .update({ report_generated_at: new Date().toISOString() })
    .eq('id', leadId).select().single();
  if (updated) Object.assign(lead, updated);

  await logRgpd('victim_rapport_genere', 'Victimes17Cyber', {
    entityType: 'cybervictim_lead',
    entityId:   leadId,
    donnees:    'Génération du rapport PDF',
    criticite:  'Info',
    details:    { product_id: product.id, alert_type: product.alert_type },
  });

  if (lead.pipeline_stage === 'paiement_recu') {
    lead.pipeline_stage = 'rapport_livre';
    await sb.from('cybervictim_leads').update({ pipeline_stage: 'rapport_livre' }).eq('id', leadId);
    await logRgpd('victim_etape_modifiee', 'Victimes17Cyber', {
      entityType: 'cybervictim_lead', entityId: leadId, donnees: 'Changement étape pipeline dossier victime',
      criticite: 'Info', details: { old_stage: 'paiement_recu', new_stage: 'rapport_livre', via: 'generation_rapport' },
    });
  }
  _v17RenderBoard();
}

// ── Suivi d'intervention — arbre de tâches (assets/js/task-tree.js) ──
async function openTaskTreeModal(leadId) {
  const lead = _v17Leads.find(l => l.id === leadId);
  if (!lead) return;
  const product = _v17ProductsById[lead.product_id];
  if (!product) { alert('Produit introuvable pour ce dossier.'); return; }
  if (typeof window.TaskTree === 'undefined') { alert("Composant d'arbre de tâches indisponible."); return; }

  document.getElementById('task-tree-modal-title').textContent =
    `🗂️ Suivi d'intervention — ${lead.first_name || ''} ${lead.last_name || ''}`.trim();
  document.getElementById('task-tree-modal').classList.add('show');

  try {
    await window.TaskTree.init({
      container: '#task-tree-container',
      leadId,
      incidentType: product.code,
      os: lead.os_victim || null,
      savedPhases: lead.intervention_tasks?.phases || null,
      onSave: (payload) => _v17SaveTaskTree(leadId, payload),
    });
  } catch (e) {
    document.getElementById('task-tree-container').innerHTML =
      `<div class="pipeline-loading" style="color:#ef4444">Erreur chargement : ${escapeHtml(e.message)}</div>`;
    console.error('[task-tree]', e);
  }
}

function closeTaskTreeModal() {
  document.getElementById('task-tree-modal').classList.remove('show');
}

async function _v17SaveTaskTree(leadId, payload) {
  const { data: { session } } = await sb.auth.getSession();
  const resp = await fetch(`${SUPABASE_URL}/functions/v1/update-cybervictim-tasks`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${session.access_token}`,
      'apikey': SUPABASE_ANON_KEY,
    },
    body: JSON.stringify(payload),
  });
  const result = await resp.json();
  if (!resp.ok || result.error) throw new Error(result.details || result.error || 'Erreur inconnue');

  const lead = _v17Leads.find(l => l.id === leadId);
  if (lead) {
    lead.os_victim = payload.os;
    lead.task_completion_pct = result.completion_pct;
    lead.intervention_tasks = { incident_type: payload.incident_type, os: payload.os, phases: payload.phases, completion_pct: result.completion_pct };
  }
  _v17RenderBoard();
}

// Attache les listeners de la modale diagnostic une seule fois, au
// chargement du script (la modale est statique dans index.html).
_diagInit();
