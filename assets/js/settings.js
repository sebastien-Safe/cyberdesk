// =========================================================
// CyberDesk — Modale « Paramétrage » (fiche profil utilisateur)
// Facturation/contrat (cyberdesk_user_settings), photo de profil
// (bucket cyberdesk-avatars), 2FA (MFA natif Supabase Auth), et
// demande d'exercice de droits RGPD (Edge Function cyberdesk-dpo-request).
// =========================================================

let _settingsUserId = null;
let _settingsPhotoPath = null;
let _settings2faFactorId = null; // facteur en cours d'enrôlement, pas encore vérifié

/** Ouvre la modale Paramétrage et charge la fiche profil de l'utilisateur courant. */
async function openSettingsModal() {
  document.getElementById('settings-modal').classList.add('show');
  document.getElementById('settings-2fa-enroll-panel').style.display = 'none';
  document.getElementById('settings-dpo-panel').style.display = 'none';
  document.getElementById('settings-dpo-message').value = '';
  document.getElementById('settings-dpo-error').textContent = '';

  const { data: { user } } = await sb.auth.getUser();
  if (!user) return;
  _settingsUserId = user.id;

  const { data: settings, error } = await sb.from('cyberdesk_user_settings')
    .select('*').eq('user_id', user.id).maybeSingle();
  if (error) alert('Erreur : ' + error.message);

  document.getElementById('settings-billing-name').value = settings?.billing_name || '';
  document.getElementById('settings-billing-address').value = settings?.billing_address || '';
  document.getElementById('settings-siret').value = settings?.siret || '';
  document.getElementById('settings-tva-number').value = settings?.tva_number || '';
  _settingsPhotoPath = settings?.photo_path || null;

  await _settingsRefreshAvatar();
  await _settingsRefresh2FAStatus();
}

function closeSettingsModal() {
  document.getElementById('settings-modal').classList.remove('show');
}

async function saveUserSettings() {
  if (!_settingsUserId) return;
  const btn = document.getElementById('settings-save-btn');
  btn.disabled = true;
  btn.textContent = 'Enregistrement…';
  try {
    const payload = {
      user_id: _settingsUserId,
      billing_name: document.getElementById('settings-billing-name').value.trim() || null,
      billing_address: document.getElementById('settings-billing-address').value.trim() || null,
      siret: document.getElementById('settings-siret').value.trim() || null,
      tva_number: document.getElementById('settings-tva-number').value.trim() || null,
      photo_path: _settingsPhotoPath,
      updated_at: new Date().toISOString(),
    };
    const { error } = await sb.from('cyberdesk_user_settings').upsert(payload);
    if (error) throw error;
    await logRgpd('profil_utilisateur_modifie', 'CyberDesk', {
      entityType: 'cyberdesk_user_settings',
      entityId:   _settingsUserId,
      donnees:    'Mise à jour de la fiche profil (facturation/contrat)',
      criticite:  'Info',
    });
    showCrmToast('✅ Profil mis à jour');
  } catch (e) {
    alert('Erreur : ' + e.message);
  } finally {
    btn.disabled = false;
    btn.textContent = 'Enregistrer';
  }
}

// ── Photo de profil (bucket privé cyberdesk-avatars) ──

async function _settingsRefreshAvatar() {
  const img = document.getElementById('settings-avatar-preview');
  const placeholder = document.getElementById('settings-avatar-placeholder');
  if (!_settingsPhotoPath) {
    img.style.display = 'none';
    placeholder.style.display = 'flex';
    return;
  }
  const { data, error } = await sb.storage.from('cyberdesk-avatars').createSignedUrl(_settingsPhotoPath, 3600);
  if (error || !data) {
    img.style.display = 'none';
    placeholder.style.display = 'flex';
    return;
  }
  img.src = data.signedUrl;
  img.style.display = 'block';
  placeholder.style.display = 'none';
}

async function uploadAvatar(file) {
  if (!file || !_settingsUserId) return;
  const ext = (file.name.split('.').pop() || 'jpg').toLowerCase();
  const path = `${_settingsUserId}/avatar.${ext}`;
  try {
    const { error } = await sb.storage.from('cyberdesk-avatars').upload(path, file, { upsert: true });
    if (error) throw error;
    _settingsPhotoPath = path;
    await _settingsRefreshAvatar();
    showCrmToast('📸 Photo mise à jour — pensez à Enregistrer');
  } catch (e) {
    alert('Erreur upload photo : ' + e.message);
  }
}

// ── 2FA — MFA natif Supabase Auth (TOTP) ──

async function _settingsRefresh2FAStatus() {
  const statusEl = document.getElementById('settings-2fa-status');
  const btn = document.getElementById('settings-2fa-btn');
  const { data, error } = await sb.auth.mfa.listFactors();
  if (error) {
    statusEl.textContent = 'Impossible de vérifier le statut 2FA.';
    btn.disabled = true;
    return;
  }
  const verified = (data.totp || []).find(f => f.status === 'verified');
  if (verified) {
    statusEl.textContent = 'Activée';
    btn.textContent = 'Désactiver';
    btn.dataset.factorId = verified.id;
  } else {
    statusEl.textContent = 'Non activée';
    btn.textContent = 'Activer';
    btn.dataset.factorId = '';
  }
  btn.disabled = false;
  document.getElementById('settings-2fa-enroll-panel').style.display = 'none';
}

async function toggle2FA() {
  const btn = document.getElementById('settings-2fa-btn');
  const factorId = btn.dataset.factorId;

  if (factorId) {
    if (!confirm('Désactiver la double authentification sur ce compte ?')) return;
    const { error } = await sb.auth.mfa.unenroll({ factorId });
    if (error) { alert('Erreur : ' + error.message); return; }
    showCrmToast('🔓 2FA désactivée');
    await _settingsRefresh2FAStatus();
    return;
  }

  const { data, error } = await sb.auth.mfa.enroll({ factorType: 'totp' });
  if (error) { alert('Erreur : ' + error.message); return; }
  _settings2faFactorId = data.id;
  document.getElementById('settings-2fa-qr').src = data.totp.qr_code;
  document.getElementById('settings-2fa-code').value = '';
  document.getElementById('settings-2fa-error').textContent = '';
  document.getElementById('settings-2fa-enroll-panel').style.display = 'block';
}

async function verify2FAEnrollment() {
  const code = document.getElementById('settings-2fa-code').value.trim();
  const errEl = document.getElementById('settings-2fa-error');
  errEl.textContent = '';
  if (!/^\d{6}$/.test(code)) { errEl.textContent = 'Saisissez le code à 6 chiffres.'; return; }

  const btn = document.getElementById('settings-2fa-verify-btn');
  btn.disabled = true;
  try {
    const { data: challenge, error: challengeErr } = await sb.auth.mfa.challenge({ factorId: _settings2faFactorId });
    if (challengeErr) throw challengeErr;
    const { error: verifyErr } = await sb.auth.mfa.verify({
      factorId: _settings2faFactorId,
      challengeId: challenge.id,
      code,
    });
    if (verifyErr) throw verifyErr;
    showCrmToast('🔒 2FA activée');
    await _settingsRefresh2FAStatus();
  } catch (e) {
    errEl.textContent = e.message || 'Code invalide.';
  } finally {
    btn.disabled = false;
  }
}

// ── RGPD — demande d'exercice de droits (cyberdesk-dpo-request) ──

function toggleDpoPanel() {
  const panel = document.getElementById('settings-dpo-panel');
  panel.style.display = panel.style.display === 'none' ? 'block' : 'none';
}

async function submitDpoRequest() {
  const requestType = document.getElementById('settings-dpo-type').value;
  const message = document.getElementById('settings-dpo-message').value.trim();
  const errEl = document.getElementById('settings-dpo-error');
  const btn = document.getElementById('settings-dpo-submit-btn');
  errEl.textContent = '';
  btn.disabled = true;
  btn.textContent = 'Envoi…';
  try {
    const { data, error } = await sb.functions.invoke('cyberdesk-dpo-request', {
      body: { request_type: requestType, message },
    });
    if (error) throw error;
    if (!data?.success) throw new Error("échec de l'envoi.");
    showCrmToast('✅ Demande envoyée au DPO');
    document.getElementById('settings-dpo-message').value = '';
    document.getElementById('settings-dpo-panel').style.display = 'none';
  } catch (e) {
    errEl.textContent = 'Erreur : ' + (e.message || 'réessayez plus tard.');
  } finally {
    btn.disabled = false;
    btn.textContent = 'Envoyer la demande au DPO';
  }
}
