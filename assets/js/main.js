// ==========================================================
// S@FE CYBER PILOT — Logique principale d'authentification
// Extrait de l'ancien bloc <script> inline d'index.html
// pour supprimer 'unsafe-inline' de la Content-Security-Policy.
// Chargé après supabase.client.js — partage le scope global
// avec les autres scripts classiques (non-module).
// ==========================================================

// Calculé dans checkSession() — conditionne l'affichage du
// bouton « Comptable » (assets/js/accounting.js).
let _isAdmin = false;

// Renseignés par maybeRequireRecoveryMFA(), consommés par
// verifyRecoveryMFA() à la soumission du code.
let _recoveryMfaFactorId = null;
let _recoveryMfaChallengeId = null;

async function checkSession() {
  const { data: { session } } = await sb.auth.getSession();
  if (inPasswordRecovery) {
    // Le hash contenait bien type=recovery (voir supabase.client.js), mais
    // le SDK n'a pas pu établir de session — lien déjà utilisé/expiré, ou
    // consommé par un scanner de liens avant le vrai clic.
    if (!session) { showRecoveryLinkInvalid(); return; }
    await maybeRequireRecoveryMFA();
    return;
  }
  if (localStorage.getItem(PENDING_RECOVERY_KEY)) {
    await sb.auth.signOut();
    localStorage.removeItem(PENDING_RECOVERY_KEY);
    showLoginPanel();
    showAuthLinkErrorIfAny();
    document.getElementById('login-screen').classList.remove('is-hidden');
    document.getElementById('app-shell').classList.add('is-hidden');
    return;
  }
  const errEl = document.getElementById('login-error');
  if (session) {
    const ok = await hasCyberdeskAccess();
    if (!ok) {
      let blockedMessage = "Ce compte n'a pas accès à S@FE CYBER PILOT.";
      try {
        const { data: subRows } = await sb.rpc('cyberdesk_my_tenant_status');
        const sub = Array.isArray(subRows) ? subRows[0] : null;
        if (sub && ['canceled', 'unpaid'].includes(sub.subscription_status)) {
          blockedMessage = 'Votre abonnement S@FE CYBER PILOT est suspendu — contactez-nous pour le réactiver.';
        }
      } catch (e) { /* repli sur le message générique */ }

      await sb.auth.signOut();
      showLoginPanel();
      if (errEl) errEl.textContent = blockedMessage;
      document.getElementById('login-screen').classList.remove('is-hidden');
      document.getElementById('app-shell').classList.add('is-hidden');
      return;
    }
    document.getElementById('login-screen').classList.add('is-hidden');

    const [{ data: isAdminData }, { data: isSuperAdminData }, { data: userSettings }] = await Promise.all([
      sb.rpc('is_admin'),
      sb.rpc('is_super_admin'),
      sb.from('cyberdesk_user_settings').select('first_name').eq('user_id', session.user.id).maybeSingle(),
    ]);
    _isAdmin = isAdminData === true || isSuperAdminData === true;
    const isSuperAdmin = isSuperAdminData === true;

    const greetingEl = document.getElementById('v17-greeting');
    if (greetingEl) greetingEl.textContent = `🕵️‍♂️ ${userSettings?.first_name || ''}`.trim();

    let onboardingOk = true;
    if (!isSuperAdmin) {
      const { data: gateRows } = await sb.rpc('cyberdesk_my_onboarding_status');
      const gateStatus = Array.isArray(gateRows) ? gateRows[0] : null;
      const gateEnabled = gateStatus?.gate_enabled === true;
      onboardingOk = !gateEnabled || (await isPartnerOnboardingComplete());
    }

    if (!onboardingOk) {
      document.getElementById('app-shell').classList.add('is-hidden');
      await openPartnerContractModal('gate');
      return;
    }

    document.getElementById('app-shell').classList.remove('is-hidden');
    initVictimes17();
  } else {
    showLoginPanel();
    showAuthLinkErrorIfAny();
    document.getElementById('login-screen').classList.remove('is-hidden');
    document.getElementById('app-shell').classList.add('is-hidden');
  }
}

/** Explique à l'utilisateur pourquoi il retombe sur l'écran de connexion après avoir cliqué un lien refusé par Supabase. */
function showAuthLinkErrorIfAny() {
  if (!authLinkError) return;
  authLinkError = null;
  document.getElementById('login-error').textContent =
    "Ce lien n'est plus valide : il a expiré, a déjà été utilisé, ou un e-mail plus récent l'a remplacé " +
    "(seul le dernier e-mail reçu fonctionne). Redemandez un lien de connexion ci-dessous.";
}

/** Appelé par partner-contract.js après une signature réussie en mode 'gate'. */
async function continueAfterContractSigned() {
  await checkSession();
}

document.getElementById('login-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const email    = document.getElementById('login-email').value.trim();
  const password = document.getElementById('login-password').value;
  const errEl    = document.getElementById('login-error');
  const btn      = document.getElementById('login-btn');
  errEl.textContent = '';
  btn.disabled = true;
  const { error } = await sb.auth.signInWithPassword({ email, password });
  btn.disabled = false;
  if (error) { errEl.textContent = error.message; return; }
  localStorage.removeItem(PENDING_RECOVERY_KEY);
  inPasswordRecovery = false;
  checkSession();
});

async function logout() {
  await sb.auth.signOut();
  checkSession();
}

// ── Mot de passe oublié / navigation entre panneaux ──────────────────────
function showLoginPanel() {
  document.getElementById('forgot-password-panel').classList.add('is-hidden');
  document.getElementById('magic-link-panel').classList.add('is-hidden');
  document.getElementById('reset-password-panel').classList.add('is-hidden');
  document.getElementById('login-panel').classList.remove('is-hidden');
}

document.getElementById('forgot-password-link').addEventListener('click', (e) => {
  e.preventDefault();
  document.getElementById('forgot-email').value = document.getElementById('login-email').value.trim();
  document.getElementById('forgot-password-error').textContent = '';
  document.getElementById('login-panel').classList.add('is-hidden');
  document.getElementById('forgot-password-panel').classList.remove('is-hidden');
});

document.getElementById('back-to-login-link').addEventListener('click', (e) => {
  e.preventDefault();
  showLoginPanel();
});

document.getElementById('magic-link-link').addEventListener('click', (e) => {
  e.preventDefault();
  document.getElementById('magic-link-email').value = document.getElementById('login-email').value.trim();
  document.getElementById('magic-link-error').textContent = '';
  document.getElementById('login-panel').classList.add('is-hidden');
  document.getElementById('magic-link-panel').classList.remove('is-hidden');
  _magicLinkRefreshButton();
});

document.getElementById('back-to-login-link-magic').addEventListener('click', (e) => {
  e.preventDefault();
  showLoginPanel();
});

const MAGIC_LINK_COOLDOWN_MS = 60 * 1000;
const _magicLinkSentAt = {};
let _magicLinkBusy = false;
let _magicLinkTicker = null;

function _magicLinkRefreshButton() {
  const btn = document.getElementById('magic-link-btn');
  const email = document.getElementById('magic-link-email').value.trim().toLowerCase();
  const left = Math.ceil(((_magicLinkSentAt[email] || 0) + MAGIC_LINK_COOLDOWN_MS - Date.now()) / 1000);
  btn.disabled = _magicLinkBusy || left > 0;
  btn.textContent = left > 0 ? `Renvoyer le lien dans ${left} s` : 'Envoyer le lien de connexion';
  if (left > 0 && !_magicLinkTicker) {
    _magicLinkTicker = setInterval(_magicLinkRefreshButton, 1000);
  } else if (left <= 0 && _magicLinkTicker) {
    clearInterval(_magicLinkTicker);
    _magicLinkTicker = null;
  }
}

document.getElementById('magic-link-email').addEventListener('input', () => {
  document.getElementById('magic-link-error').textContent = '';
  _magicLinkRefreshButton();
});

document.getElementById('magic-link-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const email = document.getElementById('magic-link-email').value.trim();
  const errEl = document.getElementById('magic-link-error');
  const btn   = document.getElementById('magic-link-btn');
  errEl.style.color = '';
  errEl.textContent = '';
  if (!email) { errEl.textContent = "Renseignez votre e-mail."; return; }
  if (_magicLinkBusy || btn.disabled) return;
  _magicLinkBusy = true;
  _magicLinkRefreshButton();
  const { error } = await sb.functions.invoke('cyberdesk-magic-link', { body: { email } });
  _magicLinkBusy = false;
  if (error) {
    _magicLinkRefreshButton();
    errEl.textContent = "Une erreur est survenue, réessayez plus tard.";
    return;
  }
  _magicLinkSentAt[email.toLowerCase()] = Date.now();
  _magicLinkRefreshButton();
  errEl.style.color = 'var(--accent)';
  errEl.textContent = "Si un compte existe pour cet e-mail, un lien de connexion vient d'être envoyé. " +
    "Utilisez uniquement le lien du dernier e-mail reçu : en redemander un rend le précédent invalide.";
});

/** Affiche le message « lien invalide » à la place du formulaire de réinitialisation. */
function showRecoveryLinkInvalid() {
  localStorage.removeItem(PENDING_RECOVERY_KEY);
  inPasswordRecovery = false;
  document.getElementById('reset-password-mfa').classList.add('is-hidden');
  document.getElementById('reset-password-form').classList.add('is-hidden');
  document.getElementById('reset-password-invalid').classList.remove('is-hidden');
}

document.getElementById('reset-password-retry-link').addEventListener('click', (e) => {
  e.preventDefault();
  document.getElementById('reset-password-panel').classList.add('is-hidden');
  document.getElementById('reset-password-mfa').classList.add('is-hidden');
  document.getElementById('reset-password-form').classList.remove('is-hidden');
  document.getElementById('reset-password-invalid').classList.add('is-hidden');
  document.getElementById('forgot-password-error').textContent = '';
  document.getElementById('forgot-password-panel').classList.remove('is-hidden');
});

/** Si la 2FA est activée sur le compte, affiche l'étape de code MFA avant le formulaire « nouveau mot de passe ». */
async function maybeRequireRecoveryMFA() {
  const { data: factorsData, error: factorsErr } = await sb.auth.mfa.listFactors();
  if (factorsErr) return;
  const factor = (factorsData.totp || []).find(f => f.status === 'verified');
  if (!factor) return;

  const { data: aal } = await sb.auth.mfa.getAuthenticatorAssuranceLevel();
  if (aal && aal.currentLevel === 'aal2') return;

  const { data: challenge, error: challengeErr } = await sb.auth.mfa.challenge({ factorId: factor.id });
  if (challengeErr) return;

  _recoveryMfaFactorId = factor.id;
  _recoveryMfaChallengeId = challenge.id;
  document.getElementById('reset-password-form').classList.add('is-hidden');
  document.getElementById('reset-password-mfa-code').value = '';
  document.getElementById('reset-password-mfa-error').textContent = '';
  document.getElementById('reset-password-mfa').classList.remove('is-hidden');
}

async function verifyRecoveryMFA() {
  const code = document.getElementById('reset-password-mfa-code').value.trim();
  const errEl = document.getElementById('reset-password-mfa-error');
  errEl.textContent = '';
  if (!/^\d{6}$/.test(code)) { errEl.textContent = 'Saisissez le code à 6 chiffres.'; return; }

  const btn = document.getElementById('reset-password-mfa-btn');
  btn.disabled = true;
  const { error } = await sb.auth.mfa.verify({
    factorId: _recoveryMfaFactorId,
    challengeId: _recoveryMfaChallengeId,
    code,
  });
  btn.disabled = false;
  if (error) { errEl.textContent = 'Code invalide, réessayez.'; return; }

  document.getElementById('reset-password-mfa').classList.add('is-hidden');
  document.getElementById('reset-password-form').classList.remove('is-hidden');
}

document.getElementById('forgot-password-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const email = document.getElementById('forgot-email').value.trim();
  const errEl = document.getElementById('forgot-password-error');
  const btn   = document.getElementById('forgot-password-btn');
  errEl.style.color = '';
  errEl.textContent = '';
  if (!email) { errEl.textContent = "Renseignez votre e-mail."; return; }
  btn.disabled = true;
  const { error } = await sb.functions.invoke('cyberdesk-forgot-password', { body: { email } });
  btn.disabled = false;
  if (error) { errEl.textContent = "Une erreur est survenue, réessayez plus tard."; return; }
  errEl.style.color = 'var(--accent)';
  errEl.textContent = "Si un compte existe pour cet e-mail, un lien de réinitialisation vient d'être envoyé.";
});

document.getElementById('reset-password-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const pw1   = document.getElementById('reset-password-new').value;
  const pw2   = document.getElementById('reset-password-confirm').value;
  const errEl = document.getElementById('reset-password-error');
  const btn   = document.getElementById('reset-password-btn');
  errEl.textContent = '';
  if (pw1.length < 8) { errEl.textContent = "Le mot de passe doit contenir au moins 8 caractères."; return; }
  if (pw1 !== pw2) { errEl.textContent = "Les mots de passe ne correspondent pas."; return; }
  btn.disabled = true;
  const { error } = await sb.auth.updateUser({ password: pw1 });
  btn.disabled = false;
  if (error) {
    if (error.name === 'AuthSessionMissingError') { showRecoveryLinkInvalid(); return; }
    errEl.textContent = error.message;
    return;
  }
  document.getElementById('reset-password-panel').classList.add('is-hidden');
  localStorage.removeItem(PENDING_RECOVERY_KEY);
  inPasswordRecovery = false;
  checkSession();
});

checkSession();
