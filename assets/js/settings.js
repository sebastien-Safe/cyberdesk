// =========================================================
// S@FE CYBER PILOT — Modale « Paramétrage » (fiche profil utilisateur)
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
  _settingsSwitchTab('profil');
  document.getElementById('settings-2fa-enroll-panel').style.display = 'none';
  document.getElementById('settings-dpo-panel').style.display = 'none';
  document.getElementById('settings-dpo-message').value = '';
  document.getElementById('settings-dpo-error').textContent = '';
  document.getElementById('settings-password-new').value = '';
  document.getElementById('settings-password-confirm').value = '';
  document.getElementById('settings-password-error').textContent = '';
  document.getElementById('settings-password-success').classList.add('is-hidden');

  const { data: { user } } = await sb.auth.getUser();
  if (!user) return;
  _settingsUserId = user.id;

  const { data: settings, error } = await sb.from('cyberdesk_user_settings')
    .select('*').eq('user_id', user.id).maybeSingle();
  if (error) alert('Erreur : ' + error.message);

  document.getElementById('settings-first-name').value = settings?.first_name || '';
  document.getElementById('settings-last-name').value = settings?.last_name || '';
  document.getElementById('settings-billing-name').value = settings?.billing_name || '';
  document.getElementById('settings-billing-address').value = settings?.billing_address || '';
  document.getElementById('settings-siret').value = settings?.siret || '';
  document.getElementById('settings-tva-number').value = settings?.tva_number || '';
  document.getElementById('settings-bank-iban').value = settings?.bank_iban || '';
  document.getElementById('settings-bank-holder').value = settings?.bank_account_holder || '';
  const travelCoef = settings?.travel_fee_coefficient_eur_km ?? 0.51;
  document.getElementById('settings-travel-coef').value = travelCoef;
  document.getElementById('settings-travel-coef-value').textContent = Number(travelCoef).toFixed(2).replace('.', ',') + ' €/km';
  document.getElementById('settings-travel-forfait').value = String(settings?.travel_fee_forfait_eur ?? 10);
  _settingsPhotoPath = settings?.photo_path || null;

  await _settingsRefreshAvatar();
  await _settingsRefresh2FAStatus();
  await _settingsRefreshSubscription();
  await _settingsRefreshContractStatus();
  await _settingsRenderCommissionDocs();
}

// ── Onglets (Profil / Finances / Documents légaux) ──
// Simple bascule d'affichage, aucun état à recharger entre onglets — les
// données sont toutes chargées une fois à l'ouverture de la modale.

function _settingsSwitchTab(tab) {
  ['profil', 'finances', 'documents'].forEach(t => {
    document.getElementById(`settings-tab-${t}`).style.display = t === tab ? 'block' : 'none';
    document.querySelector(`#settings-tabs button[data-tab="${t}"]`).className = 'btn btn-sm ' + (t === tab ? 'btn-pri' : 'btn-out');
  });
}

/** Ferme Paramétrage et ouvre le Comptable — accès raccourci depuis l'onglet Finances. */
function _settingsOpenAccounting() {
  closeSettingsModal();
  openAccountingModal();
}

// ── Bordereaux de commissionnement (cyberdesk_commission_bordereaux) ──
// Un bordereau PDF par mois calendaire, généré automatiquement le 1er de
// chaque mois (cron → cyberdesk-generate-commission-bordereaux, migration
// 034) à partir de cyberdesk_commission_ledger — document de calcul et de
// contrôle, jamais une facture. Téléchargement via URL signée, même
// patron que _settingsRefreshAvatar().

const _SETTINGS_COMMISSION_MONTHS_FR = [
  'janvier', 'février', 'mars', 'avril', 'mai', 'juin',
  'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre',
];

function _settingsCommissionPeriodLabel(period) {
  const [y, m] = period.split('-').map(Number);
  return `${_SETTINGS_COMMISSION_MONTHS_FR[m - 1]} ${y}`;
}

async function _settingsRenderCommissionDocs() {
  const listEl = document.getElementById('settings-commission-docs-list');
  const { data, error } = await sb.rpc('cyberdesk_reporting_commission_bordereaux');
  if (error) {
    listEl.innerHTML = '<div class="diag-label-hint">Erreur de chargement des bordereaux.</div>';
    return;
  }
  if (!data || !data.length) {
    listEl.innerHTML = '<div class="diag-label-hint">Aucun bordereau généré pour le moment.</div>';
    return;
  }
  listEl.innerHTML = data.map(b => {
    const montant = b.total_ttc != null ? b.total_ttc : b.total_amount_due;
    const suffix = b.total_ttc != null ? '' : ' (HT)';
    const warning = b.generation_warning === 'regime_tva_non_renseigne'
      ? '<div class="diag-label-hint" style="color:#a33">⚠ Régime de TVA non renseigné pour ce mois — complétez votre profil (onglet Finances).</div>'
      : '';
    return `
      <div style="display:flex;align-items:center;justify-content:space-between;gap:12px;border:1px solid var(--line);border-radius:10px;padding:12px;margin-bottom:8px">
        <div>
          <strong>${escapeHtml(_settingsCommissionPeriodLabel(b.period))}</strong>
          <div class="diag-label-hint">${Number(montant).toFixed(2)} €${suffix} — ${b.line_count} commission(s)</div>
          ${warning}
        </div>
        <button type="button" class="btn btn-out btn-sm" onclick="_settingsDownloadBordereau('${b.file_path}')">Télécharger</button>
      </div>`;
  }).join('');
}

async function _settingsDownloadBordereau(filePath) {
  const { data, error } = await sb.storage.from('cyberdesk-commission-bordereaux').createSignedUrl(filePath, 3600);
  if (error || !data) { alert('Erreur : impossible de générer le lien de téléchargement.'); return; }
  window.open(data.signedUrl, '_blank');
}

// ── Statut du tunnel d'onboarding (Mandataire / Associé SEP) ──
// cf. cyberdesk_partner_contracts (un document signé par ligne) /
// cyberdesk_my_onboarding_status() — piste et documents signés jamais
// éditables directement (voir partner-contract.js).

const _SETTINGS_CONTRACT_LABELS = {
  mandataire: 'Mandataire',
  associe_sep: 'Associé SEP',
};

async function _settingsRefreshContractStatus() {
  const badge = document.getElementById('settings-contract-badge');
  const detail = document.getElementById('settings-contract-detail');
  const docPanel = document.getElementById('settings-contract-doc-panel');
  const { data, error } = await sb.rpc('cyberdesk_my_onboarding_status');
  const status = !error && Array.isArray(data) ? data[0] : null;
  if (!status || !status.chosen_remuneration_status) {
    badge.textContent = 'Non démarré';
    badge.className = 'badge badge-gray';
    detail.textContent = '';
    docPanel.textContent = 'Signez un statut de rémunération pour voir votre contrat ici.';
    return;
  }
  const label = _SETTINGS_CONTRACT_LABELS[status.chosen_remuneration_status] || status.chosen_remuneration_status;
  const docs = getPartnerDocumentsForStatus(status.chosen_remuneration_status);
  const signedKeys = new Set(
    (status.signed_documents || [])
      .filter(d => {
        const def = getPartnerDocument(status.chosen_remuneration_status, d.document_key);
        return def && def.version === d.doc_version;
      })
      .map(d => d.document_key)
  );
  const nSigned = docs.filter(d => signedKeys.has(d.key)).length;
  const complete = nSigned === docs.length;
  badge.textContent = `${label} — ${complete ? 'complet' : 'en cours'}`;
  badge.className = 'badge ' + (complete ? 'badge-green' : 'badge-orange');
  detail.textContent = `${nSigned}/${docs.length} document(s) signé(s)`;
  await _settingsRenderContractDocs(status, docs, signedKeys);
}

/**
 * Remplit « Mon contrat » (onglet Documents légaux) : un bloc dépliable par
 * document déjà signé, texte reconstruit à partir des champs actuels
 * (même patron que _pcRenderCurrentDoc() dans partner-contract.js — le
 * texte signé n'est jamais stocké verbatim, seul son hash l'est) + la
 * signature capturée (cyberdesk_partner_contracts.signature_svg, lecture
 * directe autorisée par la RLS cyberdesk_partner_contracts_select_own_or_admin).
 */
async function _settingsRenderContractDocs(status, docs, signedKeys) {
  const panel = document.getElementById('settings-contract-doc-panel');
  const signedDocs = docs.filter(d => signedKeys.has(d.key));
  if (!signedDocs.length) {
    panel.textContent = 'Signez un statut de rémunération pour voir votre contrat ici.';
    return;
  }

  const [{ data: rateRow }, { data: rows }] = await Promise.all([
    sb.from('cyberdesk_remuneration_rates').select('pct').eq('status', status.chosen_remuneration_status).maybeSingle(),
    sb.from('cyberdesk_partner_contracts')
      .select('document_key, signature_svg, signed_at')
      .eq('user_id', _settingsUserId)
      .order('signed_at', { ascending: false }),
  ]);
  const pct = Number(rateRow?.pct || 0);
  const latestByKey = new Map();
  (rows || []).forEach(r => { if (!latestByKey.has(r.document_key)) latestByKey.set(r.document_key, r); });

  const fields = {
    first_name: status.first_name, last_name: status.last_name, billing_name: status.billing_name,
    siret: status.siret, billing_address: status.billing_address,
    sep_structure_nom: status.sep_structure_nom, sep_structure_forme_juridique: status.sep_structure_forme_juridique,
    sep_structure_siret: status.sep_structure_siret, sep_structure_adresse: status.sep_structure_adresse,
    sep_taux_apurement_pct: status.sep_taux_apurement_pct,
  };

  panel.innerHTML = signedDocs.map((d, i) => {
    const row = latestByKey.get(d.key);
    const dateStr = row?.signed_at ? new Date(row.signed_at).toLocaleString('fr-FR') : '';
    const text = buildPartnerDocumentText(status.chosen_remuneration_status, d.key, fields, pct);
    const sigImg = row?.signature_svg
      ? `<img src="data:image/svg+xml;charset=utf-8,${encodeURIComponent(row.signature_svg)}" alt="Signature" style="max-width:200px;border:1px solid var(--line);border-radius:6px;background:#fff;display:block;margin-top:8px">`
      : '';
    const docId = `settings-contract-doc-${i}`;
    return `
      <div style="border:1px solid var(--line);border-radius:10px;padding:12px;margin-bottom:10px">
        <div style="display:flex;align-items:center;justify-content:space-between;gap:12px">
          <div>
            <strong>${escapeHtml(d.title)}</strong>
            <div class="diag-label-hint">Signé le ${dateStr}</div>
          </div>
          <button type="button" class="btn btn-out btn-sm" onclick="_settingsToggleContractDoc('${docId}')">Voir</button>
        </div>
        <div id="${docId}" style="display:none;margin-top:10px">
          <pre style="white-space:pre-wrap;font-family:inherit;font-size:.85rem;border:1px solid var(--line);border-radius:10px;padding:14px;max-height:220px;overflow-y:auto">${escapeHtml(text)}</pre>
          ${sigImg}
        </div>
      </div>`;
  }).join('');
}

function _settingsToggleContractDoc(id) {
  const el = document.getElementById(id);
  if (el) el.style.display = el.style.display === 'none' ? 'block' : 'none';
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
      first_name: document.getElementById('settings-first-name').value.trim() || null,
      last_name: document.getElementById('settings-last-name').value.trim() || null,
      billing_name: document.getElementById('settings-billing-name').value.trim() || null,
      billing_address: document.getElementById('settings-billing-address').value.trim() || null,
      siret: document.getElementById('settings-siret').value.trim() || null,
      tva_number: document.getElementById('settings-tva-number').value.trim() || null,
      bank_iban: document.getElementById('settings-bank-iban').value.trim() || null,
      bank_account_holder: document.getElementById('settings-bank-holder').value.trim() || null,
      travel_fee_coefficient_eur_km: Number(document.getElementById('settings-travel-coef').value),
      travel_fee_forfait_eur: Number(document.getElementById('settings-travel-forfait').value),
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

// ── Changement de mot de passe (utilisateur déjà connecté) ──

async function changeAccountPassword() {
  const pw1 = document.getElementById('settings-password-new').value;
  const pw2 = document.getElementById('settings-password-confirm').value;
  const errEl = document.getElementById('settings-password-error');
  const successEl = document.getElementById('settings-password-success');
  const btn = document.getElementById('settings-password-btn');
  errEl.textContent = '';
  successEl.classList.add('is-hidden');
  if (pw1.length < 8) { errEl.textContent = "Le mot de passe doit contenir au moins 8 caractères."; return; }
  if (pw1 !== pw2) { errEl.textContent = "Les mots de passe ne correspondent pas."; return; }

  btn.disabled = true;
  try {
    const { error } = await sb.auth.updateUser({ password: pw1 });
    if (error) throw error;
    document.getElementById('settings-password-new').value = '';
    document.getElementById('settings-password-confirm').value = '';
    successEl.classList.remove('is-hidden');
    showCrmToast('🔑 Mot de passe mis à jour');
    await logRgpd('mot_de_passe_modifie', 'CyberDesk', {
      entityType: 'auth_user',
      entityId:   _settingsUserId,
      donnees:    'Changement de mot de passe depuis Paramétrage',
      criticite:  'Info',
    });
  } catch (e) {
    errEl.textContent = 'Erreur : ' + e.message;
  } finally {
    btn.disabled = false;
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

// ── Abonnement SaaS (cyberdesk_tenants) ──
// N'affiche le bloc que pour un utilisateur rattaché à un tenant
// (tenant_id non nul sur staff_module_access) — un accès accordé hors
// facturation SaaS (tenant_id NULL) n'a rien à gérer ici.

const _SETTINGS_SUB_STATUS_LABELS = {
  trialing:   { label: 'Période d\'essai', cls: 'badge-blue' },
  active:     { label: 'Actif', cls: 'badge-green' },
  past_due:   { label: 'Paiement en retard', cls: 'badge-orange' },
  canceled:   { label: 'Résilié', cls: 'badge-red' },
  unpaid:     { label: 'Impayé', cls: 'badge-red' },
  incomplete: { label: 'Incomplet', cls: 'badge-gray' },
};

async function _settingsRefreshSubscription() {
  const field = document.getElementById('settings-subscription-field');
  const { data, error } = await sb.rpc('cyberdesk_my_tenant_status');
  const status = !error && Array.isArray(data) ? data[0] : null;
  if (!status) { field.style.display = 'none'; return; }
  field.style.display = '';

  const info = _SETTINGS_SUB_STATUS_LABELS[status.subscription_status] || { label: status.subscription_status, cls: 'badge-gray' };
  const badge = document.getElementById('settings-subscription-badge');
  badge.textContent = info.label;
  badge.className = 'badge ' + info.cls;

  const dateEl = document.getElementById('settings-subscription-date');
  if (status.subscription_status === 'trialing' && status.trial_ends_at) {
    dateEl.textContent = 'Essai jusqu\'au ' + new Date(status.trial_ends_at).toLocaleDateString('fr-FR');
  } else if (status.current_period_end) {
    dateEl.textContent = 'Renouvellement le ' + new Date(status.current_period_end).toLocaleDateString('fr-FR');
  } else {
    dateEl.textContent = '';
  }
}

/** Ouvre le portail client Stripe (changement de plan / résiliation en self-service). */
async function openBillingPortal() {
  const btn = document.getElementById('settings-subscription-btn');
  btn.disabled = true;
  btn.textContent = 'Ouverture…';
  try {
    const { data, error } = await sb.functions.invoke('cyberdesk-billing-portal', { body: {} });
    if (error) throw error;
    if (!data?.portal_url) throw new Error('lien indisponible.');
    window.open(data.portal_url, '_blank');
  } catch (e) {
    alert('Erreur : ' + (e.message || 'réessayez plus tard.'));
  } finally {
    btn.disabled = false;
    btn.textContent = 'Gérer mon abonnement';
  }
}
