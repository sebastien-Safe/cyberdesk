// ==========================================================================
// CyberDesk — Composant « Arbre de tâches d'intervention » 17Cyber
// Source de données : assets/data/task_trees.json (chargé une fois, en cache)
// Utilisé par la modale « Suivi d'intervention » (assets/victimes17/victimes17.js)
// ==========================================================================

window.TaskTree = (function () {
  const OS_LABELS = { windows: '🪟 Windows', mac: '🍎 Mac', ios: '📱 iOS', android: '🤖 Android' };

  let _taskTreesData = null;
  let _state = null; // { container, leadId, incidentType, os, onSave, phases }

  async function _loadTaskTrees() {
    if (_taskTreesData) return _taskTreesData;
    const res = await fetch('assets/data/task_trees.json');
    if (!res.ok) throw new Error("Impossible de charger l'arbre de tâches");
    _taskTreesData = await res.json();
    return _taskTreesData;
  }

  function _cloneStaticPhases(incidentType, os) {
    const inc = _taskTreesData.incidents[incidentType];
    const osPhases = (inc && inc.os_tasks && inc.os_tasks[os]) || [];
    return osPhases.map(ph => ({
      phase_id: ph.phase_id,
      phase_label: ph.phase_label,
      phase_icon: ph.phase_icon,
      tasks: ph.tasks.map(t => ({ ...t, checked: false, checked_at: null, evidence_ref: null })),
    }));
  }

  // Réapplique l'état coché/preuve d'une sauvegarde antérieure (intervention_tasks.phases)
  // par-dessus les libellés à jour du référentiel — le libellé affiché suit toujours
  // task_trees.json, l'horodatage/preuve suit la dernière sauvegarde du dossier.
  function _mergeSavedPhases(staticPhases, savedPhases) {
    if (!savedPhases || !savedPhases.length) return staticPhases;
    const savedByTaskId = {};
    savedPhases.forEach(ph => (ph.tasks || []).forEach(t => { savedByTaskId[t.task_id] = t; }));
    return staticPhases.map(ph => ({
      ...ph,
      tasks: ph.tasks.map(t => {
        const saved = savedByTaskId[t.task_id];
        return saved
          ? { ...t, checked: !!saved.checked, checked_at: saved.checked_at || null, evidence_ref: saved.evidence_ref || null }
          : t;
      }),
    }));
  }

  function _completionPct(phases) {
    const all = phases.flatMap(ph => ph.tasks);
    if (!all.length) return 0;
    return Math.round((all.filter(t => t.checked).length / all.length) * 100);
  }

  function _renderIncidentOptions(selectedIncident) {
    const incidents = _taskTreesData.incidents;
    return Object.keys(incidents).map(code => {
      const inc = incidents[code];
      return `<option value="${code}" ${code === selectedIncident ? 'selected' : ''}>${inc.icon || ''} ${escapeHtml(inc.label)}</option>`;
    }).join('');
  }

  function _render() {
    const { container, phases, incidentType, os } = _state;
    const pct = _completionPct(phases);
    const totalTasks = phases.reduce((s, ph) => s + ph.tasks.length, 0);
    const doneTasks = phases.reduce((s, ph) => s + ph.tasks.filter(t => t.checked).length, 0);
    const hasTasks = totalTasks > 0;

    container.innerHTML = `
      <div class="tt-toolbar">
        <div class="field">
          <label>Type d'incident</label>
          <select id="tt-incident">${_renderIncidentOptions(incidentType)}</select>
        </div>
        <div class="field">
          <label>Système de la victime</label>
          <div class="tt-os-radios">
            ${Object.keys(OS_LABELS).map(k => `
              <label class="tt-os-radio ${os === k ? 'active' : ''}">
                <input type="radio" name="tt-os" value="${k}" ${os === k ? 'checked' : ''}> ${OS_LABELS[k]}
              </label>
            `).join('')}
          </div>
        </div>
      </div>
      <div class="tt-progress-wrap">
        <div class="tt-progress-bar"><div class="tt-progress-fill" style="width:${pct}%"></div></div>
        <div class="tt-progress-label">${pct}% (${doneTasks}/${totalTasks} tâches)</div>
      </div>
      ${!hasTasks
        ? `<div class="tt-empty">Aucune tâche n'est encore rédigée pour ce type d'incident. Les cas « Hameçonnage » et « Fraude au virement (faux RIB) » sont disponibles en priorité.</div>`
        : `<div class="tt-phases">${phases.map((ph, i) => _renderPhase(ph, i)).join('')}</div>`}
      <div class="tt-actions">
        <button type="button" class="btn btn-out" id="tt-save-btn">💾 Sauvegarder</button>
        <button type="button" class="btn btn-out" id="tt-quote-btn">📋 Générer devis 17Cyber</button>
        <button type="button" class="btn btn-pri" id="tt-generate-btn" ${!hasTasks ? 'disabled' : ''}>📄 Générer rapport 17Cyber</button>
      </div>
    `;

    _bindEvents();
  }

  function _renderPhase(phase, phIdx) {
    const done = phase.tasks.filter(t => t.checked).length;
    const total = phase.tasks.length;
    const allDone = total > 0 && done === total;
    return `
      <details class="tt-phase" ${phIdx === 0 ? 'open' : ''}>
        <summary class="tt-phase-summary">
          <span>${phase.phase_icon || ''} ${escapeHtml(phase.phase_label)}</span>
          <span class="tt-phase-count ${allDone ? 'done' : ''}">${done}/${total}${allDone ? ' ✅' : ''}</span>
        </summary>
        <div class="tt-phase-tasks">
          ${phase.tasks.map((t, tIdx) => _renderTask(t, phIdx, tIdx)).join('')}
        </div>
      </details>
    `;
  }

  function _renderTask(task, phIdx, tIdx) {
    const timeStr = task.checked_at
      ? new Date(task.checked_at).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })
      : '';
    return `
      <div class="tt-task ${task.priority === 'critical' ? 'tt-task-critical' : ''}">
        <label class="tt-task-label">
          <input type="checkbox" class="tt-task-checkbox" ${task.checked ? 'checked' : ''} data-ph="${phIdx}" data-t="${tIdx}">
          <span>${escapeHtml(task.label)}</span>
          ${timeStr ? `<span class="tt-task-time">${timeStr}</span>` : ''}
        </label>
        ${task.detail ? `<div class="tt-task-detail">${escapeHtml(task.detail)}</div>` : ''}
        ${task.evidence_required && task.checked ? `
          <div class="tt-task-evidence">
            <input type="text" placeholder="Référence preuve…" class="tt-evidence-input" data-ph="${phIdx}" data-t="${tIdx}" value="${escapeHtml(task.evidence_ref || '')}">
          </div>` : ''}
      </div>
    `;
  }

  function _bindEvents() {
    const { container } = _state;

    container.querySelector('#tt-incident')?.addEventListener('change', (e) => _switchIncident(e.target.value));

    container.querySelectorAll('input[name="tt-os"]').forEach(r => {
      r.addEventListener('change', (e) => { if (e.target.checked) _confirmResetOS(e.target.value); });
    });

    container.querySelectorAll('.tt-task-checkbox').forEach(cb => {
      cb.addEventListener('change', (e) => {
        const ph = Number(e.target.dataset.ph), t = Number(e.target.dataset.t);
        const task = _state.phases[ph].tasks[t];
        task.checked = e.target.checked;
        task.checked_at = e.target.checked ? new Date().toISOString() : null;
        if (!e.target.checked) task.evidence_ref = null;
        _render();
      });
    });

    container.querySelectorAll('.tt-evidence-input').forEach(inp => {
      inp.addEventListener('input', (e) => {
        const ph = Number(e.target.dataset.ph), t = Number(e.target.dataset.t);
        _state.phases[ph].tasks[t].evidence_ref = e.target.value;
      });
    });

    container.querySelector('#tt-save-btn')?.addEventListener('click', _handleSave);
    container.querySelector('#tt-quote-btn')?.addEventListener('click', _handleGenerateQuote);
    container.querySelector('#tt-generate-btn')?.addEventListener('click', _handleGenerate);
  }

  function _switchIncident(newIncident) {
    _state.incidentType = newIncident;
    _state.phases = _cloneStaticPhases(newIncident, _state.os);
    _render();
  }

  function _confirmResetOS(newOS) {
    if (_state.os === newOS) return;
    const hasProgress = _state.phases.some(ph => ph.tasks.some(t => t.checked));
    if (hasProgress && !confirm("Changer d'OS réinitialise les tâches cochées pour cet incident. Continuer ?")) {
      _render(); // ré-affiche l'état courant (annule visuellement le clic sur le radio)
      return;
    }
    _state.os = newOS;
    _state.phases = _cloneStaticPhases(_state.incidentType, newOS);
    _render();
  }

  async function _handleSave() {
    const btn = _state.container.querySelector('#tt-save-btn');
    if (btn) { btn.disabled = true; btn.textContent = 'Sauvegarde…'; }
    try {
      if (_state.onSave) await _state.onSave(getPayload());
      if (typeof showCrmToast === 'function') showCrmToast('💾 Arbre de tâches sauvegardé');
    } catch (e) {
      alert('Erreur : ' + e.message);
    } finally {
      if (btn) { btn.disabled = false; btn.textContent = '💾 Sauvegarder'; }
    }
  }

  async function _handleGenerateQuote() {
    const btn = _state.container.querySelector('#tt-quote-btn');
    if (btn) { btn.disabled = true; btn.textContent = 'Génération…'; }
    try {
      if (_state.onSave) await _state.onSave(getPayload()); // le devis doit refléter l'état affiché

      const { data: { session } } = await sb.auth.getSession();
      const resp = await fetch(`${SUPABASE_URL}/functions/v1/generate-cybervictim-quote`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`,
          'apikey': SUPABASE_ANON_KEY,
        },
        body: JSON.stringify({ lead_id: _state.leadId }),
      });
      const result = await resp.json();
      if (!resp.ok || result.error) throw new Error(result.details || result.error || 'Erreur inconnue');

      _downloadBase64Docx(result.docx_base64, result.filename);

      if (typeof logRgpd === 'function') await logRgpd('victim_devis_genere', 'Victimes17Cyber', {
        entityType: 'cybervictim_lead', entityId: _state.leadId,
        donnees: 'Génération du devis (détail depuis l\'arbre de tâches)', criticite: 'Info',
        details: { incident_type: _state.incidentType, os: _state.os },
      });
    } catch (e) {
      alert('Erreur : ' + e.message);
    } finally {
      if (btn) { btn.disabled = false; btn.textContent = '📋 Générer devis 17Cyber'; }
    }
  }

  async function _handleGenerate() {
    const pct = getCompletion();
    if (pct < 60 && !confirm(`Seulement ${pct}% des tâches sont cochées. Générer le rapport quand même ?`)) return;

    const btn = _state.container.querySelector('#tt-generate-btn');
    if (btn) { btn.disabled = true; btn.textContent = 'Génération…'; }
    try {
      if (_state.onSave) await _state.onSave(getPayload()); // le rapport doit refléter l'état affiché

      const { data: { session } } = await sb.auth.getSession();
      const resp = await fetch(`${SUPABASE_URL}/functions/v1/generate-cybervictim-report`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`,
          'apikey': SUPABASE_ANON_KEY,
        },
        body: JSON.stringify({ lead_id: _state.leadId }),
      });
      const result = await resp.json();
      if (!resp.ok || result.error) throw new Error(result.details || result.error || 'Erreur inconnue');

      _downloadBase64Docx(result.docx_base64, result.filename);

      if (typeof logRgpd === 'function') await logRgpd('victim_rapport_genere', 'Victimes17Cyber', {
        entityType: 'cybervictim_lead', entityId: _state.leadId,
        donnees: 'Génération du rapport (arbre de tâches)', criticite: 'Info',
        details: { incident_type: _state.incidentType, os: _state.os, completion_pct: pct },
      });
    } catch (e) {
      alert('Erreur : ' + e.message);
    } finally {
      if (btn) { btn.disabled = false; btn.textContent = '📄 Générer rapport 17Cyber'; }
    }
  }

  function _downloadBase64Docx(base64, filename) {
    const byteChars = atob(base64);
    const byteNumbers = new Array(byteChars.length);
    for (let i = 0; i < byteChars.length; i++) byteNumbers[i] = byteChars.charCodeAt(i);
    const blob = new Blob([new Uint8Array(byteNumbers)], {
      type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = filename || 'rapport-17cyber.docx';
    document.body.appendChild(a); a.click(); a.remove();
    URL.revokeObjectURL(url);
  }

  async function init(opts) {
    const container = typeof opts.container === 'string' ? document.querySelector(opts.container) : opts.container;
    if (!container) return;
    container.innerHTML = '<div class="pipeline-loading"><div class="pipeline-spinner"></div> Chargement…</div>';

    await _loadTaskTrees();

    const incidentType = opts.incidentType && _taskTreesData.incidents[opts.incidentType]
      ? opts.incidentType
      : Object.keys(_taskTreesData.incidents)[0];
    const os = opts.os && OS_LABELS[opts.os] ? opts.os : 'windows';

    _state = {
      container, leadId: opts.leadId, incidentType, os,
      onSave: opts.onSave,
      phases: _mergeSavedPhases(_cloneStaticPhases(incidentType, os), opts.savedPhases),
    };

    _render();
  }

  function getPayload() {
    return {
      lead_id: _state.leadId,
      os: _state.os,
      incident_type: _state.incidentType,
      phases: _state.phases,
      completion_pct: _completionPct(_state.phases),
    };
  }

  function getCompletion() {
    return _completionPct(_state.phases);
  }

  function resetOS(newOS) {
    _confirmResetOS(newOS);
  }

  return { init, getPayload, getCompletion, resetOS };
})();
