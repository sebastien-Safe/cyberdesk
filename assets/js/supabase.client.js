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

const SUPABASE_URL = "https://xxxx.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_xxxx";

const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
