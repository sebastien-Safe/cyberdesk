/* ============================================================
   CyberDesk — Module Audit B2B : auth, navigation, helpers, score
   ============================================================ */

// Client Supabase partagé, défini dans assets/js/supabase.client.js
// (chargé avant ce fichier). Alias conservé pour compatibilité avec
// le reste du module.
const supa = sb;

let currentContact = null;
let allContacts    = [];

/* ============================================================
   RÉFÉRENTIEL — 23 points de contrôle, 6 catégories
   ============================================================ */
const CYBER_CATS = {
  acces: {
    label: 'Accès & Identités', icon: '🔐', weight: 0.25,
    items: [
      { key: 'pw_policy',     label: 'Politique de mots de passe (12 car. min, complexité)' },
      { key: 'mfa',           label: 'MFA activé sur les comptes critiques (admin, email, cloud)' },
      { key: 'no_generic',    label: 'Aucun compte générique ou partagé actif' },
      { key: 'access_review', label: 'Droits d\'accès revus au moins annuellement' },
      { key: 'admin_account', label: 'Compte admin dédié, distinct du compte courant' },
    ],
  },
  mises_a_jour: {
    label: 'Mises à jour & Correctifs', icon: '🔄', weight: 0.20,
    items: [
      { key: 'os_update',    label: 'Systèmes d\'exploitation à jour' },
      { key: 'app_update',   label: 'Applications et logiciels à jour' },
      { key: 'av_active',    label: 'Antivirus / EDR actif et mis à jour' },
      { key: 'patch_policy', label: 'Politique de patch définie et respectée' },
    ],
  },
  sauvegardes: {
    label: 'Sauvegardes', icon: '💾', weight: 0.20,
    items: [
      { key: 'backup_regular', label: 'Sauvegardes automatiques régulières (quotidienne pour données critiques)' },
      { key: 'backup_tested',  label: 'Restauration testée au moins une fois par an' },
      { key: 'backup_offsite', label: 'Sauvegardes hors-site ou cloud (règle 3-2-1)' },
      { key: 'backup_rto',     label: 'RTO et RPO définis et documentés' },
    ],
  },
  reseau: {
    label: 'Réseau & Accès distants', icon: '🌐', weight: 0.15,
    items: [
      { key: 'vpn',         label: 'VPN utilisé pour les accès distants' },
      { key: 'wifi_secure', label: 'Wi-Fi sécurisé (WPA2/WPA3, réseau invité séparé)' },
      { key: 'firewall',    label: 'Pare-feu configuré et actif' },
      { key: 'network_seg', label: 'Segmentation réseau (serveurs / postes / IoT)' },
    ],
  },
  sensibilisation: {
    label: 'Sensibilisation & Procédures', icon: '👥', weight: 0.10,
    items: [
      { key: 'training',  label: 'Formation cybersécurité des collaborateurs (≥ 1/an)' },
      { key: 'phishing',  label: 'Procédure anti-phishing connue et appliquée' },
      { key: 'charter',   label: 'Charte informatique signée par les utilisateurs' },
    ],
  },
  continuite: {
    label: 'Continuité & Gestion de crise', icon: '🚨', weight: 0.10,
    items: [
      { key: 'pca',           label: 'Plan de continuité (PCA/PRI) documenté' },
      { key: 'contacts_cyber',label: 'Contacts urgence cyber (ANSSI 3918, assureur, prestataire)' },
      { key: 'crisis_proc',   label: 'Procédure de crise définie et testée' },
    ],
  },
};

/* ============================================================
   NAVIGATION
   ============================================================ */
function showView(id) {
  document.querySelectorAll('.cyber-view').forEach(v => v.classList.remove('active'));
  const el = document.getElementById('view-' + id);
  if (el) el.classList.add('active');
}

function selectContact(contact) {
  currentContact = contact;
  allContacts.forEach(c => {
    const el = document.querySelector(`.sidebar-contact-item[data-id="${c.id}"]`);
    if (el) el.classList.toggle('active', c.id === contact.id);
  });
  const subnav = document.getElementById('cyber-subnav');
  if (subnav) subnav.style.display = '';
  const nameEl = document.getElementById('subnav-client-name');
  if (nameEl) nameEl.textContent = contact.nom || contact.prenom || '—';
  const topEl = document.getElementById('topbar-contact-name');
  if (topEl) topEl.textContent = contact.nom || '';
  switchSubView('audit', document.querySelector('.subnav-item[data-view="audit"]'));
}

function clearContact() {
  currentContact = null;
  document.querySelectorAll('.sidebar-contact-item').forEach(el => el.classList.remove('active'));
  document.getElementById('cyber-subnav').style.display = 'none';
  showView('dashboard');
  loadDashboard();
}

/* ============================================================
   TOAST
   ============================================================ */
let _toastTimer;
function toast(msg, type = 'ok') {
  const el = document.getElementById('cyber-toast');
  if (!el) return;
  el.textContent = msg;
  el.className = 'show' + (type === 'err' ? ' err' : '');
  clearTimeout(_toastTimer);
  _toastTimer = setTimeout(() => { el.className = ''; }, 3200);
}

/* ============================================================
   MODAL
   ============================================================ */
function openModal(title, bodyHtml, footHtml = '') {
  document.getElementById('cyber-modal-title').textContent = title;
  document.getElementById('cyber-modal-body').innerHTML = bodyHtml;
  document.getElementById('cyber-modal-foot').innerHTML = footHtml;
  document.getElementById('cyber-modal-overlay').classList.add('open');
}
function closeModal() {
  document.getElementById('cyber-modal-overlay').classList.remove('open');
}

/* ============================================================
   HELPERS
   ============================================================ */
function escHtml(s) {
  return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
function fmtDate(d) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('fr-FR');
}
function today() {
  return new Date().toISOString().slice(0, 10);
}
function addDays(dateStr, n) {
  const d = new Date(dateStr);
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}
function scoreColor(s) {
  if (s >= 80) return 'var(--ok)';
  if (s >= 50) return 'var(--warn)';
  return 'var(--alert)';
}
function scoreBadge(s) {
  if (s >= 80) return '<span class="score-badge" style="background:rgba(24,117,60,.1);color:var(--ok)">🟢 Conforme</span>';
  if (s >= 50) return '<span class="score-badge" style="background:rgba(179,64,0,.1);color:var(--warn)">🟡 À améliorer</span>';
  return '<span class="score-badge" style="background:rgba(225,0,15,.1);color:var(--alert)">🔴 Action requise</span>';
}

/* ============================================================
   CALCUL DU SCORE CYBER
   ============================================================ */
async function computeScoreCyber(contactId) {
  const { data: auditRows } = await supa
    .from('cyber_client_audits')
    .select('item_key, statut, categorie')
    .eq('contact_id', contactId);

  const byKey = {};
  (auditRows || []).forEach(r => { byKey[r.item_key] = r.statut; });

  const catScores = {};
  for (const [catKey, cat] of Object.entries(CYBER_CATS)) {
    const items = cat.items;
    let sum = 0, total = 0;
    for (const item of items) {
      const st = byKey[item.key] || 'non_verifie';
      if (st === 'na') continue;
      total++;
      if      (st === 'conforme')     sum += 1.0;
      else if (st === 'partiel')      sum += 0.5;
    }
    catScores[catKey] = total > 0 ? Math.round((sum / total) * 100) : 0;
  }

  let weighted = 0;
  for (const [catKey, cat] of Object.entries(CYBER_CATS)) {
    weighted += (catScores[catKey] || 0) * cat.weight;
  }
  const score = Math.round(weighted);

  const { data: { user } } = await supa.auth.getUser();
  await supa.from('cyber_client_profiles').upsert({
    contact_id: contactId,
    score_global: score,
    updated_at: new Date().toISOString(),
    created_by: user?.id,
  }, { onConflict: 'contact_id' });

  return { score, catScores };
}

/* ============================================================
   INIT
   ============================================================ */
document.addEventListener('DOMContentLoaded', async () => {
  const { data: { session } } = await supa.auth.getSession();
  if (!session) { window.location.href = '/'; return; }

  const { data: contacts } = await supa
    .from('clients')
    .select('id, nom, prenom, entreprise')
    .order('nom');

  allContacts = contacts || [];

  const { data: profiles } = await supa
    .from('cyber_client_profiles')
    .select('contact_id, score_global');

  const scoreMap = {};
  (profiles || []).forEach(p => { scoreMap[p.contact_id] = p.score_global; });

  const listEl = document.getElementById('sidebar-contacts');
  if (listEl) {
    listEl.innerHTML = allContacts.map(c => {
      const score = scoreMap[c.id] ?? null;
      const nom = [c.nom, c.prenom].filter(Boolean).join(' ') || c.entreprise || '—';
      return `
        <div class="sidebar-contact-item" data-id="${c.id}" data-search="${nom.toLowerCase()}">
          <span style="flex:1;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${escHtml(nom)}</span>
          ${score !== null
            ? `<span class="sidebar-score-mini" style="color:${scoreColor(score)}">${score}%</span>`
            : '<span class="sidebar-score-mini" style="color:var(--mut)">—</span>'}
        </div>`;
    }).join('') || '<p style="padding:12px;font-size:.8rem;color:var(--mut)">Aucun client.</p>';

    listEl.querySelectorAll('.sidebar-contact-item').forEach((el, i) => {
      el.onclick = () => selectContact(allContacts[i]);
    });
  }

  loadDashboard();
  showView('dashboard');
});
