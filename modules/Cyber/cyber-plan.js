/* ============================================================
   Cybersec Clients — Plan d'action correctif
   ============================================================ */

const PRIORITES = [
  { key: 'critique', label: 'Critique', cls: 'badge-alert', icon: '🔴' },
  { key: 'haute',    label: 'Haute',    cls: 'badge-warn',  icon: '🟠' },
  { key: 'normale',  label: 'Normale',  cls: 'badge-blue',  icon: '🔵' },
  { key: 'basse',    label: 'Basse',    cls: 'badge-gray',  icon: '⚪' },
];

const STATUTS_PLAN = [
  { key: 'a_faire',   label: 'À faire',    cls: 'badge-warn'  },
  { key: 'en_cours',  label: 'En cours',   cls: 'badge-blue'  },
  { key: 'fait',      label: 'Fait',       cls: 'badge-ok'    },
  { key: 'abandonne', label: 'Abandonné',  cls: 'badge-gray'  },
];

async function loadPlan() {
  if (!currentContact) return;
  const el = document.getElementById('plan-content');
  if (!el) return;
  el.innerHTML = '<div class="loader"><div class="spinner"></div></div>';

  const { data, error } = await supa
    .from('cyber_client_plan')
    .select('*').eq('contact_id', currentContact.id)
    .order('priorite').order('date_echeance', { ascending: true, nullsFirst: false });

  if (error) { el.innerHTML = `<p style="color:var(--alert)">${escHtml(error.message)}</p>`; return; }

  const actives = (data || []).filter(t => t.statut !== 'fait' && t.statut !== 'abandonne');
  const faites  = (data || []).filter(t => t.statut === 'fait' || t.statut === 'abandonne');
  const critiques = actives.filter(t => t.priorite === 'critique');
  const now = new Date();

  el.innerHTML = `
    ${critiques.length ? `
      <div style="background:rgba(255,77,94,.07);border:1px solid rgba(255,77,94,.2);
        border-radius:var(--r-sm);padding:10px 14px;font-size:.8rem;color:var(--alert);margin-bottom:14px">
        🔴 ${critiques.length} action(s) critique(s) en attente
      </div>` : ''}

    <div class="card">
      <div class="card-header">
        <span class="card-title">— Actions en cours (${actives.length})</span>
        <div style="display:flex;gap:6px">
          <button class="btn btn-ghost btn-sm" onclick="genererPlanDepuisAudit()">⚡ Générer depuis l'audit</button>
          <button class="btn btn-pri btn-sm" onclick="openPlanModal()">+ Ajouter</button>
        </div>
      </div>
      ${actives.length
        ? renderPlanList(actives, now)
        : '<div class="empty-state"><div class="ico">✅</div><p>Plan d\'action vide — aucune tâche en cours.</p></div>'}
    </div>

    ${faites.length ? `
      <div class="card" style="margin-top:12px">
        <div class="card-header"><span class="card-title">— Complétées / Abandonnées (${faites.length})</span></div>
        ${renderPlanList(faites, now, true)}
      </div>` : ''}`;
}

function renderPlanList(list, now, archived = false) {
  return '<div class="item-list">' + list.map(t => {
    const prio   = PRIORITES.find(p => p.key === t.priorite) || { icon: '⚪', cls: 'badge-gray', label: t.priorite };
    const statut = STATUTS_PLAN.find(s => s.key === t.statut) || { cls: 'badge-gray', label: t.statut };
    const dl     = t.date_echeance ? new Date(t.date_echeance) : null;
    const diff   = dl ? Math.ceil((dl - now) / 86400000) : null;
    const dlBadge = dl
      ? (diff < 0
          ? `<span class="badge badge-alert">⚠ Dépassé ${Math.abs(diff)}j</span>`
          : diff <= 7
            ? `<span class="badge badge-warn">J-${diff}</span>`
            : `<span class="badge badge-gray">J-${diff}</span>`)
      : '';
    const catInfo = t.categorie && CYBER_CATS[t.categorie] ? CYBER_CATS[t.categorie].icon + ' ' : '';
    return `
      <div class="item-row" onclick="openPlanModal('${t.id}')">
        <span style="font-size:1rem;flex-shrink:0">${prio.icon}</span>
        <div class="item-row-info">
          <div class="item-row-name">${catInfo}${escHtml(t.titre)}</div>
          ${t.description ? `<div class="item-row-meta">${escHtml(t.description.slice(0,80))}</div>` : ''}
          ${t.date_echeance ? `<div class="item-row-meta">Échéance : ${fmtDate(t.date_echeance)}</div>` : ''}
        </div>
        ${dlBadge}
        <span class="badge ${prio.cls}">${prio.label}</span>
        <span class="badge ${statut.cls}">${statut.label}</span>
      </div>`;
  }).join('') + '</div>';
}

function openPlanModal(id = null) {
  const form = `
    <div class="form-group">
      <label class="form-label">Titre de l'action *</label>
      <input class="form-input" id="pl-titre" placeholder="Ex : Activer MFA sur tous les comptes admin">
    </div>
    <div class="grid-2">
      <div class="form-group">
        <label class="form-label">Priorité</label>
        <select class="form-select" id="pl-priorite">
          ${PRIORITES.map(p => `<option value="${p.key}">${p.icon} ${p.label}</option>`).join('')}
        </select>
      </div>
      <div class="form-group">
        <label class="form-label">Catégorie</label>
        <select class="form-select" id="pl-cat">
          <option value="">— Aucune —</option>
          ${Object.entries(CYBER_CATS).map(([k,v]) => `<option value="${k}">${v.icon} ${v.label}</option>`).join('')}
        </select>
      </div>
    </div>
    <div class="grid-2">
      <div class="form-group">
        <label class="form-label">Échéance</label>
        <input class="form-input" id="pl-echeance" type="date">
      </div>
      <div class="form-group">
        <label class="form-label">Statut</label>
        <select class="form-select" id="pl-statut">
          ${STATUTS_PLAN.map(s => `<option value="${s.key}">${s.label}</option>`).join('')}
        </select>
      </div>
    </div>
    <div class="form-group">
      <label class="form-label">Description / Instructions</label>
      <textarea class="form-textarea" id="pl-desc" placeholder="Détail de l'action à mener…"></textarea>
    </div>`;

  openModal(id ? 'Modifier l\'action' : 'Nouvelle action corrective', form, `
    ${id ? `<button class="btn btn-danger btn-sm" style="margin-right:auto" onclick="deletePlan('${id}')">Supprimer</button>` : ''}
    <button class="btn btn-ghost" onclick="closeModal()">Annuler</button>
    <button class="btn btn-pri" onclick="savePlan(${id ? `'${id}'` : 'null'})">Enregistrer</button>`);

  if (id) {
    supa.from('cyber_client_plan').select('*').eq('id', id).single().then(({ data: t }) => {
      if (!t) return;
      document.getElementById('pl-titre').value    = t.titre        || '';
      document.getElementById('pl-priorite').value = t.priorite     || 'normale';
      document.getElementById('pl-cat').value      = t.categorie    || '';
      document.getElementById('pl-echeance').value = t.date_echeance|| '';
      document.getElementById('pl-statut').value   = t.statut       || 'a_faire';
      document.getElementById('pl-desc').value     = t.description  || '';
    });
  }
}

async function savePlan(id) {
  const titre = document.getElementById('pl-titre').value.trim();
  if (!titre) { toast('Titre requis', 'err'); return; }
  const { data: { user } } = await supa.auth.getUser();
  const payload = {
    contact_id:    currentContact.id,
    titre,
    priorite:      document.getElementById('pl-priorite').value,
    categorie:     document.getElementById('pl-cat').value     || null,
    date_echeance: document.getElementById('pl-echeance').value|| null,
    statut:        document.getElementById('pl-statut').value,
    description:   document.getElementById('pl-desc').value.trim() || null,
    updated_at:    new Date().toISOString(),
  };
  let err;
  if (id) {
    ({ error: err } = await supa.from('cyber_client_plan').update(payload).eq('id', id));
  } else {
    ({ error: err } = await supa.from('cyber_client_plan').insert({ ...payload, created_by: user?.id }));
  }
  if (err) { toast('Erreur : ' + err.message, 'err'); return; }
  closeModal(); toast(id ? 'Action mise à jour' : 'Action ajoutée', 'ok'); loadPlan();
}

async function deletePlan(id) {
  if (!confirm('Supprimer cette action ?')) return;
  const { error } = await supa.from('cyber_client_plan').delete().eq('id', id);
  if (error) { toast('Erreur', 'err'); return; }
  closeModal(); toast('Action supprimée'); loadPlan();
}

/* Génère automatiquement les actions depuis les items non conformes de l'audit */
async function genererPlanDepuisAudit() {
  if (!currentContact) return;
  const { data: auditRows } = await supa
    .from('cyber_client_audits')
    .select('item_key, statut, categorie')
    .eq('contact_id', currentContact.id)
    .in('statut', ['non_conforme', 'partiel']);

  if (!auditRows?.length) { toast('Aucun point non conforme dans l\'audit', 'err'); return; }

  const { data: existing } = await supa
    .from('cyber_client_plan')
    .select('titre')
    .eq('contact_id', currentContact.id);

  const existingTitles = new Set((existing || []).map(t => t.titre));
  const { data: { user } } = await supa.auth.getUser();

  const toInsert = [];
  for (const row of auditRows) {
    const cat  = CYBER_CATS[row.categorie];
    const item = cat?.items.find(i => i.key === row.item_key);
    if (!item) continue;
    const titre = `Corriger : ${item.label}`;
    if (existingTitles.has(titre)) continue;
    toInsert.push({
      contact_id:  currentContact.id,
      titre,
      priorite:    row.statut === 'non_conforme' ? 'haute' : 'normale',
      categorie:   row.categorie,
      statut:      'a_faire',
      description: `Point d'audit "${item.label}" marqué comme ${row.statut === 'non_conforme' ? 'non conforme' : 'partiel'}.`,
      created_by:  user?.id,
    });
  }

  if (!toInsert.length) { toast('Toutes les actions sont déjà dans le plan', 'err'); return; }
  const { error } = await supa.from('cyber_client_plan').insert(toInsert);
  if (error) { toast('Erreur : ' + error.message, 'err'); return; }
  toast(`${toInsert.length} action(s) ajoutée(s) au plan`, 'ok');
  loadPlan();
}
