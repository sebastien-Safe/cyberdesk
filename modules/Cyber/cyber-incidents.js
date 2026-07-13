/* ============================================================
   CyberDesk — Module Audit B2B : Incidents de sécurité
   ============================================================ */

const INCIDENT_TYPES = [
  { key: 'phishing',   label: 'Phishing / Hameçonnage', icon: '🎣' },
  { key: 'ransomware', label: 'Ransomware',              icon: '🔒' },
  { key: 'intrusion',  label: 'Intrusion / Accès non autorisé', icon: '🚪' },
  { key: 'fuite',      label: 'Fuite de données',        icon: '💧' },
  { key: 'malware',    label: 'Malware / Virus',         icon: '🦠' },
  { key: 'ddos',       label: 'DDoS / Indisponibilité',  icon: '⚡' },
  { key: 'autre',      label: 'Autre',                   icon: '⚠️' },
];

const GRAVITES_INC = [
  { key: 'faible',    label: 'Faible',    cls: 'badge-ok',    icon: '🟢' },
  { key: 'modere',    label: 'Modéré',    cls: 'badge-warn',  icon: '🟡' },
  { key: 'grave',     label: 'Grave',     cls: 'badge-alert', icon: '🔴' },
  { key: 'critique',  label: 'Critique',  cls: 'badge-alert', icon: '🚨' },
];

async function loadIncidents() {
  if (!currentContact) return;
  const el = document.getElementById('incidents-content');
  if (!el) return;
  el.innerHTML = '<div class="loader"><div class="spinner"></div></div>';

  const { data, error } = await supa
    .from('cyber_client_incidents')
    .select('*').eq('contact_id', currentContact.id)
    .order('date_incident', { ascending: false });

  if (error) { el.innerHTML = `<p style="color:var(--alert)">${escHtml(error.message)}</p>`; return; }

  const ouverts  = (data || []).filter(i => i.statut === 'ouvert' || i.statut === 'en_cours');
  const resolus  = (data || []).filter(i => i.statut === 'resolu' || i.statut === 'cloture');
  const graves   = ouverts.filter(i => i.niveau_gravite === 'grave' || i.niveau_gravite === 'critique');

  el.innerHTML = `
    ${graves.length ? `
      <div style="background:rgba(225,0,15,.08);border:1px solid rgba(225,0,15,.3);
        border-radius:var(--r-sm);padding:10px 14px;font-size:.8rem;color:var(--alert);margin-bottom:14px">
        🚨 ${graves.length} incident(s) grave(s) ou critique(s) non résolu(s) — action immédiate requise
      </div>` : ''}

    <div class="card">
      <div class="card-header">
        <span class="card-title">— Incidents actifs (${ouverts.length})</span>
        <button class="btn btn-danger btn-sm" onclick="openIncidentModal()">🚨 Déclarer un incident</button>
      </div>
      ${ouverts.length
        ? renderIncidentList(ouverts)
        : '<div class="empty-state"><div class="ico">✅</div><p>Aucun incident actif. Bonne situation !</p></div>'}
    </div>

    ${resolus.length ? `
      <div class="card" style="margin-top:12px">
        <div class="card-header"><span class="card-title">— Résolus / Clôturés (${resolus.length})</span></div>
        ${renderIncidentList(resolus, true)}
      </div>` : ''}`;
}

function renderIncidentList(list, archived = false) {
  return '<div class="item-list">' + list.map(inc => {
    const type = INCIDENT_TYPES.find(t => t.key === inc.type_incident) || { icon: '⚠️', label: inc.type_incident };
    const grav = GRAVITES_INC.find(g => g.key === inc.niveau_gravite) || { icon: '⚪', cls: 'badge-gray', label: inc.niveau_gravite };
    const statLabel = { ouvert:'Ouvert', en_cours:'En cours', resolu:'Résolu', cloture:'Clôturé' }[inc.statut] || inc.statut;
    const statCls   = { ouvert:'badge-alert', en_cours:'badge-warn', resolu:'badge-ok', cloture:'badge-gray' }[inc.statut] || 'badge-gray';
    return `
      <div class="item-row">
        <span style="font-size:1.2rem;flex-shrink:0;cursor:pointer" onclick="openIncidentModal('${inc.id}')">${type.icon}</span>
        <div class="item-row-info" style="cursor:pointer" onclick="openIncidentModal('${inc.id}')">
          <div class="item-row-name">${escHtml(inc.titre)}</div>
          <div class="item-row-meta">
            ${fmtDate(inc.date_incident)} · ${escHtml(type.label)}
            ${inc.actions_prises ? ' · Mesures prises' : ''}
          </div>
        </div>
        <span class="badge ${grav.cls}">${grav.icon} ${grav.label}</span>
        <span class="badge ${statCls}">${statLabel}</span>
      </div>`;
  }).join('') + '</div>';
}

function openIncidentModal(id = null) {
  const statuts = ['ouvert','en_cours','resolu','cloture'];
  const form = `
    <div class="form-group">
      <label class="form-label">Titre de l'incident *</label>
      <input class="form-input" id="inc-titre" placeholder="Ex : Attaque phishing sur comptabilité">
    </div>
    <div class="grid-2">
      <div class="form-group">
        <label class="form-label">Type d'incident *</label>
        <select class="form-select" id="inc-type">
          ${INCIDENT_TYPES.map(t => `<option value="${t.key}">${t.icon} ${t.label}</option>`).join('')}
        </select>
      </div>
      <div class="form-group">
        <label class="form-label">Date de l'incident *</label>
        <input class="form-input" id="inc-date" type="date" value="${today()}">
      </div>
    </div>
    <div class="grid-2">
      <div class="form-group">
        <label class="form-label">Niveau de gravité</label>
        <select class="form-select" id="inc-gravite">
          ${GRAVITES_INC.map(g => `<option value="${g.key}">${g.icon} ${g.label}</option>`).join('')}
        </select>
      </div>
      ${id ? `<div class="form-group">
        <label class="form-label">Statut</label>
        <select class="form-select" id="inc-statut">
          ${statuts.map(s => `<option value="${s}">${{ouvert:'Ouvert',en_cours:'En cours',resolu:'Résolu',cloture:'Clôturé'}[s]}</option>`).join('')}
        </select>
      </div>` : '<div></div>'}
    </div>
    <div class="form-group">
      <label class="form-label">Description</label>
      <textarea class="form-textarea" id="inc-desc" placeholder="Nature de l'incident, vecteur d'attaque, périmètre…"></textarea>
    </div>
    <div class="form-group">
      <label class="form-label">Actions prises</label>
      <textarea class="form-textarea" id="inc-actions" placeholder="Mesures immédiates, isolement, notification, restauration…" style="min-height:70px"></textarea>
    </div>`;

  openModal(id ? 'Modifier l\'incident' : '🚨 Déclarer un incident', form, `
    ${id ? `<button class="btn btn-danger btn-sm" style="margin-right:auto" onclick="deleteIncident('${id}')">Supprimer</button>` : ''}
    <button class="btn btn-ghost" onclick="closeModal()">Annuler</button>
    <button class="btn btn-pri" onclick="saveIncident(${id ? `'${id}'` : 'null'})">Enregistrer</button>`);

  if (id) {
    supa.from('cyber_client_incidents').select('*').eq('id', id).single().then(({ data: inc }) => {
      if (!inc) return;
      document.getElementById('inc-titre').value   = inc.titre         || '';
      document.getElementById('inc-type').value    = inc.type_incident || 'autre';
      document.getElementById('inc-date').value    = inc.date_incident || today();
      document.getElementById('inc-gravite').value = inc.niveau_gravite|| 'modere';
      document.getElementById('inc-desc').value    = inc.description   || '';
      document.getElementById('inc-actions').value = inc.actions_prises|| '';
      if (document.getElementById('inc-statut')) document.getElementById('inc-statut').value = inc.statut || 'ouvert';
    });
  }
}

async function saveIncident(id) {
  const titre = document.getElementById('inc-titre').value.trim();
  if (!titre) { toast('Titre requis', 'err'); return; }
  const { data: { user } } = await supa.auth.getUser();
  const payload = {
    contact_id:     currentContact.id,
    titre,
    type_incident:  document.getElementById('inc-type').value,
    date_incident:  document.getElementById('inc-date').value || today(),
    niveau_gravite: document.getElementById('inc-gravite').value,
    statut:         id && document.getElementById('inc-statut') ? document.getElementById('inc-statut').value : 'ouvert',
    description:    document.getElementById('inc-desc').value.trim()    || null,
    actions_prises: document.getElementById('inc-actions').value.trim() || null,
    updated_at:     new Date().toISOString(),
  };
  let err;
  if (id) {
    ({ error: err } = await supa.from('cyber_client_incidents').update(payload).eq('id', id));
  } else {
    ({ error: err } = await supa.from('cyber_client_incidents').insert({ ...payload, created_by: user?.id }));
  }
  if (err) { toast('Erreur : ' + err.message, 'err'); return; }
  closeModal();
  toast(id ? 'Incident mis à jour' : 'Incident déclaré', 'ok');
  loadIncidents();
}

async function deleteIncident(id) {
  if (!confirm('Supprimer cet incident ?')) return;
  const { error } = await supa.from('cyber_client_incidents').delete().eq('id', id);
  if (error) { toast('Erreur', 'err'); return; }
  closeModal(); toast('Incident supprimé'); loadIncidents();
}
