/* ============================================================
   CyberDesk — Module Audit B2B : Dashboard
   ============================================================ */

async function loadDashboard() {
  const el = document.getElementById('dashboard-content');
  if (!el) return;
  el.innerHTML = '<div class="loader"><div class="spinner"></div></div>';

  const [
    { data: profiles },
    { data: incidents },
    { data: plan },
    { count: nbContacts },
  ] = await Promise.all([
    supa.from('cyber_client_profiles').select('score_global'),
    supa.from('cyber_client_incidents').select('statut,niveau_gravite'),
    supa.from('cyber_client_plan').select('statut,priorite'),
    supa.from('clients').select('*', { count: 'exact', head: true }),
  ]);

  const scores       = (profiles || []).map(p => p.score_global).filter(s => s != null);
  const scoreMoyen   = scores.length ? Math.round(scores.reduce((a,b) => a+b, 0) / scores.length) : 0;
  const incidentOuverts = (incidents || []).filter(i => i.statut === 'ouvert' || i.statut === 'en_cours').length;
  const incidentGraves  = (incidents || []).filter(i => (i.statut === 'ouvert' || i.statut === 'en_cours') && (i.niveau_gravite === 'grave' || i.niveau_gravite === 'critique')).length;
  const actionsCritiques = (plan || []).filter(p => p.statut !== 'fait' && p.priorite === 'critique').length;
  const actionsTotal     = (plan || []).filter(p => p.statut === 'a_faire' || p.statut === 'en_cours').length;

  el.innerHTML = `
    <div class="stats-row">
      <div class="stat-card">
        <div class="stat-val" style="color:var(--cyber)">${scores.length}</div>
        <div class="stat-lbl">Clients suivis</div>
      </div>
      <div class="stat-card">
        <div class="stat-val" style="color:${scoreColor(scoreMoyen)}">${scoreMoyen}%</div>
        <div class="stat-lbl">Score moyen</div>
      </div>
      <div class="stat-card">
        <div class="stat-val" style="color:${incidentOuverts > 0 ? 'var(--alert)' : 'var(--ok)'}">${incidentOuverts}</div>
        <div class="stat-lbl">Incidents ouverts</div>
      </div>
      <div class="stat-card">
        <div class="stat-val" style="color:${actionsCritiques > 0 ? 'var(--alert)' : 'var(--ok)'}">${actionsCritiques}</div>
        <div class="stat-lbl">Actions critiques</div>
      </div>
      <div class="stat-card">
        <div class="stat-val">${actionsTotal}</div>
        <div class="stat-lbl">Tâches en cours</div>
      </div>
    </div>

    ${incidentGraves > 0 ? `
      <div style="background:rgba(225,0,15,.08);border:1px solid rgba(225,0,15,.3);
        border-radius:var(--r-sm);padding:12px 16px;margin-bottom:18px;
        font-size:.82rem;color:var(--alert)">
        🚨 ${incidentGraves} incident(s) grave(s) ou critique(s) non résolus — action immédiate requise.
      </div>` : ''}

    <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px">
      <!-- Répartition des scores -->
      <div class="card">
        <div class="card-header">
          <span class="card-title">— Répartition des scores</span>
        </div>
        ${renderScoreDistrib(scores)}
      </div>

      <!-- Accès rapide -->
      <div class="card">
        <div class="card-header">
          <span class="card-title">— Accès rapide</span>
        </div>
        <div style="display:flex;flex-direction:column;gap:8px">
          ${[
            ['🔍 Clients à auditer', () => `${(nbContacts||0) - scores.length} sans suivi`, 'clients'],
            ['🚨 Incidents ouverts', () => incidentOuverts, 'incidents'],
            ['📋 Plan d\'action', () => actionsTotal + ' tâches', 'plan'],
          ].map(([lbl, val, view]) => `
            <div style="display:flex;align-items:center;justify-content:space-between;
              padding:10px 12px;background:rgba(0,0,0,.03);border:1px solid var(--line);
              border-radius:var(--r-sm)">
              <span style="font-size:.83rem">${lbl}</span>
              <span style="font-family:var(--ff-mono);font-size:.78rem;color:var(--cyber)">${val()}</span>
            </div>`).join('')}
        </div>
      </div>
    </div>

    <!-- Liste des clients avec score -->
    <div class="card" style="margin-top:16px">
      <div class="card-header">
        <span class="card-title">— Tous les clients (${allContacts.length})</span>
        <input class="form-input" style="max-width:200px;padding:5px 10px;font-size:.78rem"
          placeholder="🔍 Filtrer…" oninput="filterDashboardClients(this.value)">
      </div>
      <div id="dashboard-clients-list">
        ${renderClientRows(profiles || [])}
      </div>
    </div>`;

  document.querySelectorAll('#dashboard-clients-list .item-row[data-id]').forEach(row => {
    const c = allContacts.find(x => x.id === row.dataset.id);
    if (c) row.addEventListener('click', () => selectContact(c));
  });
  document.querySelectorAll('#dashboard-clients-list .btn-pri[data-id]').forEach(btn => {
    const c = allContacts.find(x => x.id === btn.dataset.id);
    if (c) btn.addEventListener('click', (e) => { e.stopPropagation(); selectContact(c); });
  });
}

function renderScoreDistrib(scores) {
  if (!scores.length) return '<p style="color:var(--mut);font-size:.82rem">Aucune donnée.</p>';
  const bins = [
    { lbl: '0–49%',   cls: 'var(--alert)', count: scores.filter(s => s < 50).length },
    { lbl: '50–79%',  cls: 'var(--warn)',  count: scores.filter(s => s >= 50 && s < 80).length },
    { lbl: '80–100%', cls: 'var(--ok)',    count: scores.filter(s => s >= 80).length },
  ];
  const max = Math.max(...bins.map(b => b.count), 1);
  return bins.map(b => `
    <div style="display:flex;align-items:center;gap:10px;margin-bottom:8px">
      <span style="font-family:var(--ff-mono);font-size:.7rem;color:var(--mut);min-width:50px">${b.lbl}</span>
      <div style="flex:1;height:14px;background:rgba(0,0,0,.07);border-radius:4px;overflow:hidden">
        <div style="height:100%;width:${Math.round((b.count/max)*100)}%;background:${b.cls};border-radius:4px;transition:.5s"></div>
      </div>
      <span style="font-family:var(--ff-mono);font-size:.76rem;font-weight:700;color:${b.cls};min-width:20px;text-align:right">${b.count}</span>
    </div>`).join('');
}

function renderClientRows(profiles) {
  const scoreMap = {};
  profiles.forEach(p => { scoreMap[p.contact_id] = p.score_global; });

  return '<div class="item-list">' + allContacts.map(c => {
    const score = scoreMap[c.id] ?? null;
    const nom = [c.nom, c.prenom].filter(Boolean).join(' ') || c.entreprise || '—';
    return `
      <div class="item-row" data-id="${c.id}" data-search="${escHtml(nom.toLowerCase())}">
        <div class="item-row-info">
          <div class="item-row-name">${escHtml(nom)}</div>
          ${c.entreprise ? `<div class="item-row-meta">${escHtml(c.entreprise)}</div>` : ''}
        </div>
        ${score !== null ? `
          <div style="min-width:120px">
            <div style="display:flex;align-items:center;gap:8px">
              <div class="score-bar-wrap" style="flex:1">
                <div class="score-bar" style="width:${score}%;background:${scoreColor(score)}"></div>
              </div>
              <span style="font-family:var(--ff-mono);font-size:.76rem;font-weight:700;color:${scoreColor(score)}">${score}%</span>
            </div>
          </div>` : `<span class="badge badge-gray">Non audité</span>`}
        <button class="btn btn-pri btn-sm" data-id="${c.id}">
          Auditer
        </button>
      </div>`;
  }).join('') + '</div>';
}

function filterDashboardClients(q) {
  const lq = q.toLowerCase();
  document.querySelectorAll('#dashboard-clients-list .item-row').forEach(el => {
    el.style.display = (el.dataset.search || '').includes(lq) ? '' : 'none';
  });
}
