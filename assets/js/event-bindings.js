// ==========================================================
// S@FE CYBER PILOT — Liaisons d'événements
// Remplace tous les attributs onclick=/oninput=/onchange=
// retirés d'index.html pour supprimer 'unsafe-inline' de la CSP.
// Chargé en dernier (après main.js et tous les modules fonctionnels).
// ==========================================================

// ── Topbar ────────────────────────────────────────────────────────────────
document.getElementById('topbar-reviews-btn').addEventListener('click', openReviewsModal);
document.getElementById('topbar-accounting-btn').addEventListener('click', openAccountingModal);
document.getElementById('topbar-settings-btn').addEventListener('click', openSettingsModal);
document.getElementById('topbar-logout-btn').addEventListener('click', logout);

// ── Pipeline Kanban ───────────────────────────────────────────────────────
document.getElementById('v17-search').addEventListener('input', _v17ApplySearch);
document.getElementById('v17-add-btn').addEventListener('click', openVictimLeadModal);

// ── Modale diagnostic dossier victime ─────────────────────────────────────
document.getElementById('vl-modal-close-x').addEventListener('click', closeVictimLeadModal);
document.getElementById('vl-owner-select').addEventListener('change', reassignLeadOwner);
document.getElementById('vl-transfer-btn').addEventListener('click', transferVictimLead);

// ── Modale devis ──────────────────────────────────────────────────────────
document.getElementById('quote-modal-close-x').addEventListener('click', closeQuoteModal);
document.getElementById('btn-quote-o4-recalc').addEventListener('click', _quoteComputeO4);

// ── Modale suivi d'intervention (arbre de tâches) ─────────────────────────
document.getElementById('task-tree-modal-close-btn').addEventListener('click', closeTaskTreeModal);

// ── Modale paiement manuel ────────────────────────────────────────────────
document.getElementById('manual-payment-cancel-btn').addEventListener('click', closeManualPaymentModal);
document.getElementById('manual-payment-save-btn').addEventListener('click', saveManualPayment);

// ── Modale assistant IA ───────────────────────────────────────────────────
document.getElementById('ai-modal-close-x').addEventListener('click', closeVictimAiModal);
document.getElementById('victim-ai-send').addEventListener('click', sendVictimAiMessage);

// ── Modale Paramétrage ────────────────────────────────────────────────────
document.getElementById('settings-modal-close-x').addEventListener('click', closeSettingsModal);
document.getElementById('settings-modal-close-footer').addEventListener('click', closeSettingsModal);
document.getElementById('settings-avatar-input').addEventListener('change', function () { uploadAvatar(this.files[0]); });
document.getElementById('settings-save-btn').addEventListener('click', saveUserSettings);
document.getElementById('settings-password-btn').addEventListener('click', changeAccountPassword);
document.getElementById('settings-2fa-btn').addEventListener('click', toggle2FA);
document.getElementById('settings-2fa-verify-btn').addEventListener('click', verify2FAEnrollment);
document.getElementById('settings-dpo-toggle-btn').addEventListener('click', toggleDpoPanel);
document.getElementById('settings-dpo-submit-btn').addEventListener('click', submitDpoRequest);
document.getElementById('settings-subscription-btn').addEventListener('click', openBillingPortal);
document.getElementById('settings-open-accounting-btn').addEventListener('click', _settingsOpenAccounting);
document.getElementById('settings-contract-btn').addEventListener('click', () => openPartnerContractModal('voluntary'));

// Onglets Paramétrage — utilise l'attribut data-tab déjà présent
document.querySelectorAll('[data-tab]').forEach(btn => {
  btn.addEventListener('click', () => _settingsSwitchTab(btn.dataset.tab));
});

// Curseur coefficient kilométrique
document.getElementById('settings-travel-coef').addEventListener('input', function () {
  document.getElementById('settings-travel-coef-value').textContent =
    Number(this.value).toFixed(2).replace('.', ',') + ' €/km';
});

// ── Modale Comptable ──────────────────────────────────────────────────────
document.getElementById('accounting-modal-close-x').addEventListener('click', closeAccountingModal);
document.getElementById('accounting-modal-close-footer').addEventListener('click', closeAccountingModal);
document.getElementById('accounting-user-select').addEventListener('change', _acctOnScopeChange);
document.getElementById('accounting-rates-save-btn').addEventListener('click', _acctSaveRates);

// ── Modale Audit clients ──────────────────────────────────────────────────
document.getElementById('reviews-modal-close-x').addEventListener('click', closeReviewsModal);
document.getElementById('reviews-modal-close-footer').addEventListener('click', closeReviewsModal);
document.getElementById('reviews-user-select').addEventListener('change', _rvOnScopeChange);

// ── Bouton MFA (écran réinitialisation mot de passe) ─────────────────────
document.getElementById('reset-password-mfa-btn').addEventListener('click', verifyRecoveryMFA);

// ── Modale onboarding partenaire ──────────────────────────────────────────
document.getElementById('pc-step1-continue').addEventListener('click', _pcSaveStep1);
document.getElementById('pc-step2-back').addEventListener('click', _pcGoBack);
document.getElementById('pc-step2-continue').addEventListener('click', _pcSaveStep2);
document.getElementById('pc-step3-back').addEventListener('click', _pcGoBack);
document.getElementById('pc-step3-continue').addEventListener('click', _pcSaveStep3);
document.getElementById('pc-clear-signature-btn').addEventListener('click', _pcClearSignature);
document.getElementById('pc-step4-back').addEventListener('click', _pcGoBack);
document.getElementById('pc-continue-btn').addEventListener('click', _pcSendOtp);
document.getElementById('pc-verify-btn').addEventListener('click', _pcSubmitSignature);
document.getElementById('pc-finish-btn').addEventListener('click', _pcFinish);
document.getElementById('pc-cancel-btn').addEventListener('click', closePartnerContractModal);

document.getElementById('pc-status-mandataire').addEventListener('change', () => _pcSelectStatus('mandataire'));
document.getElementById('pc-status-associe_sep').addEventListener('change', () => _pcSelectStatus('associe_sep'));
