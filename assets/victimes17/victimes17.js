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
      <button class="pcard-edit-btn" onclick="generateVictimQuote('${lead.id}')">📋 Générer le devis</button>
      <button class="pcard-edit-btn" onclick="openTaskTreeModal('${lead.id}')">🗂️ Suivi d'intervention</button>
      <button class="pcard-edit-btn" onclick="generateVictimReport('${lead.id}')">📄 Générer le rapport (PDF simple)</button>
    </div>
  </div>`;
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

// ── Modale « Nouveau dossier victime » ──
async function openVictimLeadModal() {
  document.getElementById('vl-id').value = '';
  document.getElementById('vl-prenom').value = '';
  document.getElementById('vl-nom').value = '';
  document.getElementById('vl-email').value = '';
  document.getElementById('vl-telephone').value = '';
  document.getElementById('vl-ticket').value = '';
  document.getElementById('vl-notes').value = '';

  // Clic possible avant la fin du chargement initial des produits
  if (!_v17Products.length) {
    try { await _v17LoadData(); } catch (e) { console.error('[victimes17]', e); }
  }

  // La modale doit être affichée (display:grid) avant qu'on peuple le
  // <select> — Safari peut sinon ne plus réagir aux clics sur un select
  // dont le contenu a été injecté pendant que son conteneur était encore
  // display:none. requestAnimationFrame garantit que le layout de la
  // modale est posé avant l'injection des <option>.
  document.getElementById('victim-lead-modal').classList.add('show');

  requestAnimationFrame(() => {
    const sel = document.getElementById('vl-product');
    sel.innerHTML = '<option value="">Sélectionner une alerte…</option>' +
      _v17Products.map(p => `<option value="${p.id}">${escapeHtml(p.alert_type)} — ${formatMoney(p.price_ttc)} TTC</option>`).join('');
  });
}

function closeVictimLeadModal() {
  document.getElementById('victim-lead-modal').classList.remove('show');
}

async function saveVictimLead() {
  const prenom    = document.getElementById('vl-prenom').value.trim();
  const nom       = document.getElementById('vl-nom').value.trim();
  const productId = document.getElementById('vl-product').value;

  if (!prenom || !nom) { alert('Prénom et nom sont obligatoires.'); return; }
  if (!productId) { alert("Sélectionnez le type d'alerte / produit."); return; }

  const btn = document.getElementById('victim-lead-save-btn');
  btn.disabled = true;
  btn.textContent = 'Enregistrement…';

  const payload = {
    first_name:    prenom,
    last_name:     nom,
    email:         document.getElementById('vl-email').value.trim() || null,
    phone:         document.getElementById('vl-telephone').value.trim() || null,
    ticket_number: document.getElementById('vl-ticket').value.trim() || null,
    product_id:    productId,
    notes:         document.getElementById('vl-notes').value.trim() || null,
  };

  try {
    const { data, error } = await sb.from('cybervictim_leads').insert(payload).select().single();
    if (error) throw error;

    await logRgpd('victim_lead_cree', 'Victimes17Cyber', {
      entityType: 'cybervictim_lead',
      entityId:   data.id,
      donnees:    'Création dossier victime 17Cyber',
      criticite:  'Info',
      details:    { alert_type: _v17ProductsById[productId]?.alert_type, ticket_number: payload.ticket_number },
    });

    closeVictimLeadModal();
    await initVictimes17();
    showCrmToast('✅ Dossier victime créé');
  } catch (e) {
    alert('Erreur : ' + e.message);
  } finally {
    btn.disabled = false;
    btn.textContent = 'Enregistrer';
  }
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
