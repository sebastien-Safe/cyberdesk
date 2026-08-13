// =========================================================
// S@FE CYBER PILOT — Modale « Comptable » (dashboard KPI)
// Accessible à tout utilisateur connecté : un utilisateur standard ne voit
// que ses propres résultats (dossiers qu'il a créés), un admin choisit
// entre la vue globale et celle d'un utilisateur en particulier.
//
// Le cloisonnement est fait côté serveur par des fonctions SECURITY
// DEFINER dédiées (cyberdesk_reporting_leads/payments, migration
// 010_accounting_scope.sql) — jamais par un simple filtre JS, puisque la
// RLS de cybervictim_leads reste volontairement ouverte à tout le staff
// pour le Kanban partagé.
// cyberdesk_reporting_reviews (même migration, même patron) est utilisée
// par la modale « Audit clients » (assets/js/audit-clients.js), pas ici.
// =========================================================

const PIPELINE_STAGES = ['signalement', 'qualification', 'devis_envoye', 'paiement_recu', 'rapport_livre', 'cloture'];
const PIPELINE_LABELS = {
  signalement:   'Signalement',
  qualification: 'Qualification',
  devis_envoye:  'Devis envoyé',
  paiement_recu: 'Paiement reçu',
  rapport_livre: 'Rapport livré',
  cloture:       'Clôturé',
};
const CHART_PALETTE = ['#000091', '#1212a5', '#18753c', '#b34000', '#e1000f', '#6a6af4', '#999999', '#c9a227', '#008080'];

let _acctCharts = {};
let _acctScopeUserId = ''; // '' = vue globale (admin) ou soi-même (non-admin) ; sinon uuid d'un utilisateur choisi par l'admin

function _acctChart(id, config) {
  if (_acctCharts[id]) _acctCharts[id].destroy();
  _acctCharts[id] = new Chart(document.getElementById(id), config);
}

/** Ouvre la modale Comptable et charge les indicateurs (scope selon le rôle). */
async function openAccountingModal() {
  document.getElementById('accounting-modal').classList.add('show');
  document.getElementById('accounting-user-select').style.display = _isAdmin ? '' : 'none';
  document.getElementById('accounting-tenants-section').style.display = _isAdmin ? '' : 'none';
  document.getElementById('accounting-commission-rates').style.display = _isAdmin ? '' : 'none';
  if (_isAdmin) {
    await _acctPopulateStaffSelect();
    await _acctLoadTenants();
    await _acctLoadRates();
  }
  await _acctLoad();
}

function closeAccountingModal() {
  document.getElementById('accounting-modal').classList.remove('show');
}

let _acctStaffEmailById = {};

async function _acctPopulateStaffSelect() {
  const select = document.getElementById('accounting-user-select');
  const { data, error } = await sb.rpc('cyberdesk_staff_list');
  if (error) { console.error('[cyberdesk_staff_list]', error); return; }
  _acctStaffEmailById = {};
  (data || []).forEach(u => { _acctStaffEmailById[u.user_id] = u.email; });
  select.innerHTML = '<option value="">Vue globale</option>'
    + (data || []).map(u => `<option value="${u.user_id}">${escapeHtml(u.email)}</option>`).join('');
  select.value = _acctScopeUserId;
}

function _acctOnScopeChange() {
  _acctScopeUserId = document.getElementById('accounting-user-select').value;
  _acctLoad();
}

async function _acctLoad() {
  document.getElementById('accounting-loading').style.display = 'flex';
  document.getElementById('accounting-content').style.display = 'none';

  const scopeParam = _acctScopeUserId || null;

  try {
    const [{ data: leads, error: eLeads }, { data: payments, error: ePay }, { data: commission, error: eCom }] = await Promise.all([
      sb.rpc('cyberdesk_reporting_leads', { p_user_id: scopeParam }),
      sb.rpc('cyberdesk_reporting_payments', { p_user_id: scopeParam }),
      sb.rpc('cyberdesk_reporting_commission', { p_user_id: scopeParam }),
    ]);
    if (eLeads) throw eLeads;
    if (ePay) throw ePay;
    if (eCom) throw eCom;

    _acctRenderScopeLabel();
    _acctRenderKpiCards(leads || [], payments || []);
    _acctRenderFunnelChart(leads || []);
    _acctRenderRevenueChart(payments || []);
    _acctRenderSourceChart(leads || []);
    _acctRenderAttackTypeChart(leads || []);
    _acctRenderCommission(commission || []);

    document.getElementById('accounting-loading').style.display = 'none';
    document.getElementById('accounting-content').style.display = 'block';
  } catch (e) {
    document.getElementById('accounting-loading').style.display = 'none';
    alert('Erreur chargement des indicateurs : ' + e.message);
    closeAccountingModal();
  }
}

function _acctRenderScopeLabel() {
  const el = document.getElementById('accounting-scope-label');
  if (!_isAdmin) {
    el.textContent = 'Mes résultats';
    return;
  }
  if (!_acctScopeUserId) {
    el.textContent = 'Vue globale — tous les utilisateurs';
    return;
  }
  const select = document.getElementById('accounting-user-select');
  const label = select.options[select.selectedIndex]?.textContent || '';
  el.textContent = `Résultats de ${label}`;
}

function _acctKpiCard(label, value) {
  return `<div style="border:1px solid var(--line);border-radius:10px;padding:14px;text-align:center">
    <div style="font-size:1.4rem;font-weight:700">${value}</div>
    <div class="diag-label-hint" style="margin-top:4px">${label}</div>
  </div>`;
}

function _acctRenderKpiCards(leads, payments) {
  const total = leads.length;
  const paidLeads = leads.filter(l => l.payment_status === 'paye');
  const tauxTransformation = total ? Math.round((paidLeads.length / total) * 100) : 0;
  const panierMoyen = paidLeads.length
    ? paidLeads.reduce((sum, l) => sum + (Number(l.amount_paid_ttc) || 0), 0) / paidLeads.length
    : 0;
  const caTotal = payments
    .filter(p => p.status === 'paye')
    .reduce((sum, p) => sum + (Number(p.amount_ttc) || 0), 0);
  const delais = paidLeads
    .filter(l => l.paid_at && l.created_at)
    .map(l => (new Date(l.paid_at) - new Date(l.created_at)) / 86400000);
  const delaiMoyen = delais.length ? Math.round(delais.reduce((a, b) => a + b, 0) / delais.length) : null;

  const cards = [
    _acctKpiCard('Dossiers au total', total),
    _acctKpiCard('Taux de transformation', tauxTransformation + '%'),
    _acctKpiCard('Panier moyen', formatMoney(panierMoyen)),
    _acctKpiCard('CA encaissé', formatMoney(caTotal)),
  ];
  if (delaiMoyen !== null) cards.push(_acctKpiCard('Délai moyen signalement → paiement', delaiMoyen + ' j'));

  document.getElementById('accounting-kpi-cards').innerHTML = cards.join('');
}

function _acctRenderFunnelChart(leads) {
  const counts = PIPELINE_STAGES.map(stage => leads.filter(l => l.pipeline_stage === stage).length);
  _acctChart('chart-funnel', {
    type: 'bar',
    data: {
      labels: PIPELINE_STAGES.map(s => PIPELINE_LABELS[s]),
      datasets: [{ label: 'Dossiers', data: counts, backgroundColor: '#000091' }],
    },
    options: {
      responsive: true,
      plugins: { title: { display: true, text: 'Entonnoir de conversion' }, legend: { display: false } },
      scales: { y: { beginAtZero: true, ticks: { precision: 0 } } },
    },
  });
}

// payments = lignes brutes (une par paiement) renvoyées par
// cyberdesk_reporting_payments — agrégation par mois faite ici (la vue
// pré-agrégée v_payments_reporting reste réservée au reporting admin de
// Vente, on ne la réutilise pas pour un scope par utilisateur).
function _acctRenderRevenueChart(payments) {
  const byPeriod = {};
  payments.filter(p => p.status === 'paye').forEach(p => {
    const key = p.period;
    byPeriod[key] = (byPeriod[key] || 0) + (Number(p.amount_ttc) || 0);
  });
  const periods = Object.keys(byPeriod).sort();
  _acctChart('chart-revenue', {
    type: 'line',
    data: {
      labels: periods.map(p => new Date(p).toLocaleDateString('fr-FR', { month: 'short', year: '2-digit' })),
      datasets: [{
        label: 'CA encaissé TTC (€)',
        data: periods.map(p => byPeriod[p]),
        borderColor: '#000091',
        backgroundColor: 'rgba(0,0,145,.1)',
        fill: true,
        tension: .3,
      }],
    },
    options: {
      responsive: true,
      plugins: { title: { display: true, text: 'CA encaissé par mois' } },
      scales: { y: { beginAtZero: true } },
    },
  });
}

function _acctGroupCount(items, key) {
  const map = {};
  items.forEach(item => {
    const k = item[key] || 'Non renseigné';
    map[k] = (map[k] || 0) + 1;
  });
  return map;
}

function _acctRenderSourceChart(leads) {
  const map = _acctGroupCount(leads, 'source');
  const labels = Object.keys(map);
  _acctChart('chart-source', {
    type: 'pie',
    data: { labels, datasets: [{ data: labels.map(l => map[l]), backgroundColor: CHART_PALETTE }] },
    options: { responsive: true, plugins: { title: { display: true, text: 'Répartition par canal' } } },
  });
}

function _acctRenderAttackTypeChart(leads) {
  const map = _acctGroupCount(leads, 'attack_type');
  const labels = Object.keys(map);
  _acctChart('chart-attack-type', {
    type: 'bar',
    data: { labels, datasets: [{ label: 'Dossiers', data: labels.map(l => map[l]), backgroundColor: '#b34000' }] },
    options: {
      responsive: true,
      indexAxis: 'y',
      plugins: { title: { display: true, text: "Répartition par type d'incident" }, legend: { display: false } },
      scales: { x: { beginAtZero: true, ticks: { precision: 0 } } },
    },
  });
}

// ── Abonnements S@FE CYBER PILOT (tenants) — admin uniquement ──
// Pas de MRR en €  ici : cyberdesk_tenants ne stocke que l'id du Price
// Stripe (stripe_price_id), pas son montant — calculer un MRR fiable
// demanderait soit de le dupliquer en base, soit un appel à l'API Stripe
// depuis le navigateur (à éviter, clé secrète). On affiche donc des
// compteurs par statut, pas un chiffre d'affaires récurrent estimé.
// _SETTINGS_SUB_STATUS_LABELS est défini dans settings.js, chargé avant
// ce fichier (scripts classiques, même scope global) — réutilisé tel quel
// pour ne pas dupliquer le mapping statut → libellé/couleur.

async function _acctLoadTenants() {
  const { data, error } = await sb.rpc('cyberdesk_reporting_tenants');
  if (error) { console.error('[cyberdesk_reporting_tenants]', error); return; }
  _acctRenderTenants(data || []);
}

function _acctRenderTenants(tenants) {
  const counts = { trialing: 0, active: 0, past_due: 0, canceled: 0, unpaid: 0, incomplete: 0 };
  tenants.forEach(t => { if (t.subscription_status in counts) counts[t.subscription_status]++; });

  document.getElementById('accounting-tenants-kpi-cards').innerHTML = [
    _acctKpiCard('Tenants actifs', counts.active),
    _acctKpiCard('En période d\'essai', counts.trialing),
    _acctKpiCard('Paiement en retard', counts.past_due),
    _acctKpiCard('Résiliés / impayés', counts.canceled + counts.unpaid),
  ].join('');

  const listEl = document.getElementById('accounting-tenants-list');
  if (!tenants.length) {
    listEl.innerHTML = '<div class="diag-label-hint">Aucun tenant créé pour l\'instant.</div>';
    return;
  }

  listEl.innerHTML = tenants.map(t => {
    const info = _SETTINGS_SUB_STATUS_LABELS[t.subscription_status] || { label: t.subscription_status, cls: 'badge-gray' };
    const dateLabel = t.subscription_status === 'trialing' && t.trial_ends_at
      ? 'Essai jusqu\'au ' + new Date(t.trial_ends_at).toLocaleDateString('fr-FR')
      : t.current_period_end
        ? 'Renouvellement le ' + new Date(t.current_period_end).toLocaleDateString('fr-FR')
        : '—';
    return `
      <div style="display:flex;align-items:center;justify-content:space-between;gap:12px;border-bottom:1px solid var(--line);padding:10px 0">
        <div>
          <div style="font-weight:600">${escapeHtml(t.name)}</div>
          <div class="diag-label-hint">${t.member_count} membre${t.member_count > 1 ? 's' : ''} · créé le ${new Date(t.created_at).toLocaleDateString('fr-FR')}</div>
        </div>
        <div style="text-align:right">
          <span class="badge ${info.cls}">${info.label}</span>
          <div class="diag-label-hint" style="margin-top:4px">${dateLabel}</div>
        </div>
      </div>`;
  }).join('');
}

// ── Rémunération partenaires (cyberdesk_commission_ledger) ──
// Visible par tout utilisateur (ses propres lignes, cf. RLS/RPC scope déjà
// géré comme pour leads/payments/reviews) ; barème et progression de
// statut réservés à l'admin (cyberdesk_remuneration_rates,
// cyberdesk_update_commission_status — vérifié côté serveur, pas seulement
// masqué côté UI).

const _ACCT_COMMISSION_STATUS_LABELS = {
  a_facturer: { label: 'À facturer', cls: 'badge-orange' },
  facturee:   { label: 'Facturée', cls: 'badge-blue' },
  payee:      { label: 'Payée', cls: 'badge-green' },
  a_verser:   { label: 'À verser', cls: 'badge-orange' },
  verse:      { label: 'Versé', cls: 'badge-green' },
};
const _ACCT_COMMISSION_NEXT = {
  a_facturer: { status: 'facturee', label: 'Marquer facturée' },
  facturee:   { status: 'payee', label: 'Marquer payée' },
  a_verser:   { status: 'verse', label: 'Marquer versée' },
};

async function _acctLoadRates() {
  const { data, error } = await sb.from('cyberdesk_remuneration_rates').select('status, pct');
  if (error) { console.error('[cyberdesk_remuneration_rates]', error); return; }
  (data || []).forEach(r => {
    const input = document.getElementById(`accounting-rate-${r.status}`);
    if (input) input.value = Number(r.pct).toFixed(2);
  });
}

async function _acctSaveRates() {
  const mandataire = parseFloat(document.getElementById('accounting-rate-mandataire').value);
  const associeSep = parseFloat(document.getElementById('accounting-rate-associe_sep').value);
  if (isNaN(mandataire) || isNaN(associeSep) || mandataire < 0 || associeSep < 0) {
    alert('Saisissez des pourcentages valides.');
    return;
  }
  const { error } = await sb.from('cyberdesk_remuneration_rates').upsert([
    { status: 'mandataire', pct: mandataire, updated_at: new Date().toISOString() },
    { status: 'associe_sep', pct: associeSep, updated_at: new Date().toISOString() },
  ]);
  if (error) { alert('Erreur : ' + error.message); return; }
  showCrmToast('✅ Barème mis à jour');
}

function _acctRenderCommission(rows) {
  const totalDue = rows.reduce((sum, r) => sum + (Number(r.amount_due) || 0), 0);
  const enAttente = rows.filter(r => ['a_facturer', 'a_verser'].includes(r.status)).length;
  const regle = rows.filter(r => ['payee', 'verse'].includes(r.status)).length;

  document.getElementById('accounting-commission-kpi-cards').innerHTML = [
    _acctKpiCard('Total dû', formatMoney(totalDue)),
    _acctKpiCard('En attente', enAttente),
    _acctKpiCard('Réglé', regle),
  ].join('');

  const listEl = document.getElementById('accounting-commission-list');
  if (!rows.length) {
    listEl.innerHTML = '<div class="diag-label-hint">Aucune commission pour l\'instant.</div>';
    return;
  }

  listEl.innerHTML = rows
    .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
    .map(r => {
      const info = _ACCT_COMMISSION_STATUS_LABELS[r.status] || { label: r.status, cls: 'badge-gray' };
      const next = _ACCT_COMMISSION_NEXT[r.status];
      const beneficiaryLabel = _isAdmin ? (_acctStaffEmailById[r.beneficiary_user_id] || r.beneficiary_user_id) : null;
      return `
        <div style="display:flex;align-items:center;justify-content:space-between;gap:12px;border-bottom:1px solid var(--line);padding:10px 0">
          <div>
            ${beneficiaryLabel ? `<div style="font-weight:600">${escapeHtml(beneficiaryLabel)}</div>` : ''}
            <div class="diag-label-hint">${formatMoney(r.amount_due)} (${Number(r.pct_applied).toFixed(2)}% de ${formatMoney(r.amount_ht)} HT) · ${new Date(r.created_at).toLocaleDateString('fr-FR')}</div>
          </div>
          <div style="text-align:right;display:flex;align-items:center;gap:10px">
            <span class="badge ${info.cls}">${info.label}</span>
            ${_isAdmin && next ? `<button type="button" class="btn btn-out btn-sm" onclick="_acctUpdateCommissionStatus('${r.id}','${next.status}')">${next.label}</button>` : ''}
          </div>
        </div>`;
    }).join('');
}

async function _acctUpdateCommissionStatus(id, newStatus) {
  const { error } = await sb.rpc('cyberdesk_update_commission_status', { p_id: id, p_status: newStatus });
  if (error) { alert('Erreur : ' + error.message); return; }
  showCrmToast('✅ Statut mis à jour');
  await _acctLoad();
}
