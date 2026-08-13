// =========================================================
// CyberDesk — Modale « Audit clients » (Avis Client + NPS)
//
// Remplace l'ancien bouton "🛡 Audit clients" qui pointait vers
// modules/Cyber/module-cyber-clients.html (module B2B hors périmètre
// CyberDesk depuis la migration 008, jamais branché sur les données
// CyberDesk — voir CLAUDE.md).
//
// Réutilise cyberdesk_reporting_reviews (migration 010_accounting_scope.sql),
// déjà cloisonnée par utilisateur/admin — même patron que la modale
// Comptable (assets/js/accounting.js), dont la section "Avis clients" a
// été déplacée ici pour donner sa propre entrée de menu au sujet.
// =========================================================

let _rvScopeUserId = '';
let _rvChart = null;

/** Ouvre la modale Audit clients et charge les avis (scope selon le rôle). */
async function openReviewsModal() {
  document.getElementById('reviews-modal').classList.add('show');
  document.getElementById('reviews-user-select').style.display = _isAdmin ? '' : 'none';
  if (_isAdmin) await _rvPopulateStaffSelect();
  await _rvLoad();
}

function closeReviewsModal() {
  document.getElementById('reviews-modal').classList.remove('show');
}

async function _rvPopulateStaffSelect() {
  const select = document.getElementById('reviews-user-select');
  const { data, error } = await sb.rpc('cyberdesk_staff_list');
  if (error) { console.error('[cyberdesk_staff_list]', error); return; }
  select.innerHTML = '<option value="">Vue globale</option>'
    + (data || []).map(u => `<option value="${u.user_id}">${escapeHtml(u.email)}</option>`).join('');
  select.value = _rvScopeUserId;
}

function _rvOnScopeChange() {
  _rvScopeUserId = document.getElementById('reviews-user-select').value;
  _rvLoad();
}

function _rvRenderScopeLabel() {
  const el = document.getElementById('reviews-scope-label');
  if (!_isAdmin) { el.textContent = 'Mes avis clients'; return; }
  const select = document.getElementById('reviews-user-select');
  const label = select.options[select.selectedIndex]?.textContent || '';
  el.textContent = _rvScopeUserId ? `Avis de ${label}` : 'Vue globale';
}

async function _rvLoad() {
  document.getElementById('reviews-loading').style.display = 'flex';
  document.getElementById('reviews-content').style.display = 'none';

  const { data: reviews, error } = await sb.rpc('cyberdesk_reporting_reviews', { p_user_id: _rvScopeUserId || null });
  if (error) {
    document.getElementById('reviews-loading').style.display = 'none';
    alert('Erreur chargement des avis : ' + error.message);
    return;
  }

  _rvRenderScopeLabel();
  _rvRenderKpiCards(reviews || []);
  _rvRenderChart(reviews || []);
  _rvRenderList(reviews || []);

  document.getElementById('reviews-loading').style.display = 'none';
  document.getElementById('reviews-content').style.display = 'block';
}

function _rvKpiCard(label, value) {
  return `<div style="border:1px solid var(--line);border-radius:10px;padding:14px;text-align:center">
    <div style="font-size:1.4rem;font-weight:700">${value}</div>
    <div class="diag-label-hint" style="margin-top:4px">${label}</div>
  </div>`;
}

/**
 * Score de satisfaction adapté à l'échelle 1-5 de cybervictim_reviews.rating —
 * PAS un NPS® standard (qui repose sur une question de recommandation notée
 * sur 10, absente du formulaire avis-client.html actuel). Mapping usuel pour
 * une conversion étoiles → NPS : 5★ = promoteur, 4★ = passif (exclu du
 * calcul), 1-3★ = détracteur. Score = %promoteurs - %détracteurs, [-100, 100].
 */
function _rvComputeAdaptedNps(reviews) {
  const count = reviews.length;
  if (!count) return null;
  const promoteurs = reviews.filter(r => r.rating === 5).length;
  const detracteurs = reviews.filter(r => r.rating <= 3).length;
  return Math.round((promoteurs / count - detracteurs / count) * 100);
}

function _rvRenderKpiCards(reviews) {
  const count = reviews.length;
  const avg = count ? reviews.reduce((sum, r) => sum + (r.rating || 0), 0) / count : 0;
  const nps = _rvComputeAdaptedNps(reviews);

  document.getElementById('reviews-kpi-cards').innerHTML = [
    _rvKpiCard('Note moyenne', count ? avg.toFixed(1) + ' / 5' : '—'),
    _rvKpiCard('Avis reçus', count),
    _rvKpiCard('Score adapté', nps === null ? '—' : (nps > 0 ? '+' : '') + nps),
  ].join('');
}

function _rvRenderChart(reviews) {
  const distribution = [1, 2, 3, 4, 5].map(n => reviews.filter(r => r.rating === n).length);
  if (_rvChart) _rvChart.destroy();
  _rvChart = new Chart(document.getElementById('chart-reviews-audit'), {
    type: 'bar',
    data: {
      labels: ['1 ★', '2 ★', '3 ★', '4 ★', '5 ★'],
      datasets: [{ label: 'Avis', data: distribution, backgroundColor: '#18753c' }],
    },
    options: {
      responsive: true,
      indexAxis: 'y',
      plugins: { legend: { display: false }, title: { display: true, text: 'Distribution des notes' } },
      scales: { x: { beginAtZero: true, ticks: { precision: 0 } } },
    },
  });
}

function _rvRenderList(reviews) {
  const listEl = document.getElementById('reviews-list');
  const withComments = reviews
    .filter(r => r.comment)
    .sort((a, b) => new Date(b.submitted_at) - new Date(a.submitted_at));

  if (!withComments.length) {
    listEl.innerHTML = '<div class="diag-label-hint">Aucun avis avec commentaire pour l\'instant.</div>';
    return;
  }

  listEl.innerHTML = withComments.map(r => `
    <div style="border-bottom:1px solid var(--line);padding:10px 0">
      <div>${'★'.repeat(r.rating)}${'☆'.repeat(5 - r.rating)}</div>
      <div style="font-size:.85rem;margin-top:4px">${escapeHtml(r.comment)}</div>
    </div>
  `).join('');
}
