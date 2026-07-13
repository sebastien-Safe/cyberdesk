// =========================================================
// Configuration Supabase — CyberDesk
// =========================================================
// 1. Projet Supabase CyberDesk (jamais celui de safecrm) :
//    Project Settings > API Keys
// 2. Renseignez les deux valeurs ci-dessous avant déploiement.
//
// Cette clé "publishable/anon" est conçue pour être publique
// (protégée par les règles RLS définies dans les migrations) :
// seuls les comptes utilisateurs créés dans Authentication > Users
// pourront se connecter et voir les données.
//
// ⚠️ Ne mettez JAMAIS ici la "secret key" / "service_role key" :
// elle donne un accès administrateur complet et ne doit jamais
// figurer dans du code public (GitHub, site déployé, etc.).
// =========================================================

const SUPABASE_URL = "https://rxxciopqqqpsmyisxtcc.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_a0fVnXW4OVIaFuxJhkH8fw_7i3l5wen";

const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

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
