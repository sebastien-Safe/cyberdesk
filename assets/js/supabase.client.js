// =========================================================
// Configuration Supabase — S@FE CYBER PILOT
// =========================================================
// Projet partagé avec safe-crm (Safe-crm-V2, ref bgkijldrmdhklkadkeua,
// région Paris) — S@FE CYBER PILOT et le module Vente de safe-crm vivent dans
// la même base, avec un cloisonnement par module (voir has_module_access()
// / staff_module_access dans supabase/migrations/008_cyberdesk_on_safecrm.sql
// et la section "Cohabitation avec safe-crm" de CLAUDE.md).
//
// Cette clé "publishable/anon" est conçue pour être publique
// (protégée par les règles RLS définies dans les migrations) :
// seuls les comptes ayant une ligne staff_module_access(module='cyberdesk')
// (ou is_super_admin()) pourront réellement voir des données S@FE CYBER PILOT.
//
// ⚠️ Ne mettez JAMAIS ici la "secret key" / "service_role key" : elle
// donne un accès administrateur complet à TOUTES les données du projet
// partagé (y compris safe-crm/Vente), pas seulement à S@FE CYBER PILOT — ne
// doit jamais figurer dans du code public (GitHub, site déployé, etc.).
// =========================================================

const SUPABASE_URL = "https://bgkijldrmdhklkadkeua.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_0e2GVUwr3Tml870xyaEMwQ_LZDt0y32";

const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ── Lien de réinitialisation de mot de passe cliqué ──────────────────────
// Passe à true pendant le parcours "lien de réinitialisation cliqué" pour
// empêcher checkSession() (index.html) d'enchaîner automatiquement sur
// l'app avec la session de récupération avant que l'utilisateur ait choisi
// un nouveau mot de passe.
let inPasswordRecovery = false;

// Persisté (pas une simple variable JS) : un lien de récupération établit
// une session Supabase valide dès qu'il est cliqué. Si l'utilisateur ferme
// l'onglet sans avoir choisi de nouveau mot de passe, cette session reste
// valide en local — sans ce verrou, la rouvrir plus tard donnerait accès à
// l'app sans jamais repasser par une authentification réelle.
const PENDING_RECOVERY_KEY = 'cd_pending_recovery';

function _enterPasswordRecoveryUI() {
  inPasswordRecovery = true;
  localStorage.setItem(PENDING_RECOVERY_KEY, '1');
  document.getElementById('login-panel').classList.add('is-hidden');
  document.getElementById('forgot-password-panel').classList.add('is-hidden');
  document.getElementById('reset-password-panel').classList.remove('is-hidden');
  document.getElementById('login-screen').classList.remove('is-hidden');
  document.getElementById('app-shell').classList.add('is-hidden');
}

// Détection SYNCHRONE, immédiatement après createClient() et avant tout
// autre script de la page. Ne pas se fier uniquement à l'événement
// onAuthStateChange('PASSWORD_RECOVERY') ci-dessous : en interne,
// supabase-js programme cette notification via un setTimeout(0) que
// _initialize() n'attend PAS avant de résoudre sa promesse
// (vérifié dans le code source de @supabase/auth-js 2.108.2, la version
// chargée ici) — sb.auth.getSession() (donc checkSession()) peut donc
// résoudre AVANT que inPasswordRecovery ne soit mis à jour par
// l'événement, notamment quand les 11 autres <script src> de la page se
// chargent depuis le cache navigateur assez vite pour que checkSession()
// (appelée en toute fin de script, après leur exécution) s'exécute avant
// ce setTimeout(0). Constaté en usage réel : lien cliqué → accès direct au
// dashboard avec la session de récupération, sans jamais passer par
// l'écran "nouveau mot de passe". En lisant nous-mêmes le hash de l'URL de
// façon synchrone ici, avant tout autre code, on élimine cette course : le
// SDK ne vide window.location.hash qu'après un aller-retour réseau
// (_getUser(access_token) dans _getSessionFromURL), donc bien après ce
// point.
if (window.location.hash) {
  const hashParams = new URLSearchParams(window.location.hash.slice(1));
  if (hashParams.get('type') === 'recovery') {
    _enterPasswordRecoveryUI();
  }
}

// Gardé en complément (idempotent) : couvre le cas où une session de
// récupération serait établie autrement qu'au chargement initial de la
// page (ex. détection différée par le SDK).
sb.auth.onAuthStateChange((event) => {
  if (event === 'PASSWORD_RECOVERY') {
    _enterPasswordRecoveryUI();
  }
});

// Accès au module S@FE CYBER PILOT (cloisonné de Vente même si auth.users est
// partagé) — à appeler juste après une connexion réussie, voir index.html.
async function hasCyberdeskAccess() {
  const { data, error } = await sb.rpc('has_module_access', { p_module: 'cyberdesk' });
  return !error && data === true;
}

// ── Helpers partagés (remplacent les utilitaires du CRM parent safecrm) ──

function escapeHtml(s) {
  return String(s || '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function formatMoney(n) {
  return (Number(n) || 0).toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' });
}

let _cdToastTimer;
function showCrmToast(msg) {
  let el = document.getElementById('cd-toast');
  if (!el) {
    el = document.createElement('div');
    el.id = 'cd-toast';
    el.style.cssText = 'position:fixed;bottom:20px;left:50%;transform:translateX(-50%);'
      + 'background:#0a1628;color:#fff;border:1px solid rgba(255,255,255,.15);'
      + 'padding:10px 18px;border-radius:8px;font-size:.85rem;z-index:9999;'
      + 'opacity:0;transition:opacity .2s;pointer-events:none';
    document.body.appendChild(el);
  }
  el.textContent = msg;
  el.style.opacity = '1';
  clearTimeout(_cdToastTimer);
  _cdToastTimer = setTimeout(() => { el.style.opacity = '0'; }, 3000);
}

// Journal RGPD minimal — remplace logRgpd() de safecrm. Colonnes alignées
// sur celles utilisées par les Edge Functions (generate-cybervictim-*,
// purge-cybervictim-data) — voir supabase/migrations/001_cyber_schema.sql.
async function logRgpd(action, module, { entityType, entityId, donnees, criticite = 'Info', resultat = 'Succès', details = {} } = {}) {
  try {
    const { data: { user } } = await sb.auth.getUser();
    await sb.from('audit_logs').insert({
      action,
      module,
      entity_type: entityType || null,
      entity_id: entityId || null,
      donnees_concernees: donnees || null,
      criticite,
      resultat,
      details,
      user_id: user?.id || null,
    });
  } catch (e) {
    console.error('[logRgpd]', e);
  }
}
