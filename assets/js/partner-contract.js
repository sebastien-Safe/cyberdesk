// =========================================================
// S@FE CYBER PILOT — Signature électronique du contrat partenaire
// (Mandataire / Associé SEP) : choix du statut, capture de
// signature (canvas → SVG), envoi/vérification d'un code OTP
// (cyberdesk-send-signature-otp / cyberdesk-verify-signature).
//
// Utilisé dans deux contextes :
//  - "voluntary" : ouvert depuis Paramétrage, annulable.
//  - "gate"      : ouvert par checkSession() tant qu'aucun contrat
//    valide n'existe (cyberdesk_feature_flags.contract_gate actif),
//    non annulable — pas de bouton de fermeture affiché.
// =========================================================

let _pcMode = 'voluntary';
let _pcSelectedStatus = null;
let _pcRates = { mandataire: 0, associe_sep: 0 };
let _pcCanvas, _pcCtx;
let _pcPaths = [];      // chaque trait : "M x y L x y L x y ..."
let _pcCurrentPath = null;
let _pcDrawing = false;

/** Ouvre la modale de signature. mode: 'voluntary' (annulable) ou 'gate' (bloquant). */
async function openPartnerContractModal(mode) {
  _pcMode = mode === 'gate' ? 'gate' : 'voluntary';
  _pcSelectedStatus = null;
  document.getElementById('pc-cancel-btn').style.display = _pcMode === 'gate' ? 'none' : '';
  document.getElementById('pc-status-mandataire').checked = false;
  document.getElementById('pc-status-associe_sep').checked = false;
  document.getElementById('pc-contract-text').textContent = 'Choisissez un statut pour afficher le contrat correspondant.';
  document.getElementById('pc-otp-panel').style.display = 'none';
  document.getElementById('pc-otp-code').value = '';
  document.getElementById('pc-error').textContent = '';
  document.getElementById('pc-continue-btn').disabled = true;

  const { data } = await sb.from('cyberdesk_remuneration_rates').select('status, pct');
  (data || []).forEach(r => { _pcRates[r.status] = Number(r.pct); });
  document.getElementById('pc-pct-mandataire').textContent = _pcRates.mandataire.toFixed(2);
  document.getElementById('pc-pct-associe_sep').textContent = _pcRates.associe_sep.toFixed(2);

  _pcInitCanvas();
  document.getElementById('partner-contract-modal').classList.add('show');
}

function closePartnerContractModal() {
  if (_pcMode === 'gate') return; // non fermable en mode bloquant
  document.getElementById('partner-contract-modal').classList.remove('show');
}

function _pcSelectStatus(status) {
  _pcSelectedStatus = status;
  document.getElementById('pc-contract-text').textContent =
    buildPartnerContractText(status, _pcRates[status]);
  document.getElementById('pc-continue-btn').disabled = false;
}

// ── Capture de signature (canvas libre → SVG) ──

function _pcInitCanvas() {
  _pcCanvas = document.getElementById('pc-signature-canvas');
  _pcCtx = _pcCanvas.getContext('2d');
  _pcPaths = [];
  _pcCurrentPath = null;
  _pcCtx.clearRect(0, 0, _pcCanvas.width, _pcCanvas.height);
  _pcCtx.lineWidth = 2;
  _pcCtx.lineCap = 'round';
  _pcCtx.strokeStyle = '#1d1d1b';

  _pcCanvas.onpointerdown = _pcPointerDown;
  _pcCanvas.onpointermove = _pcPointerMove;
  _pcCanvas.onpointerup = _pcPointerUp;
  _pcCanvas.onpointerleave = _pcPointerUp;
}

function _pcCanvasPoint(e) {
  const rect = _pcCanvas.getBoundingClientRect();
  return {
    x: Math.round(e.clientX - rect.left),
    y: Math.round(e.clientY - rect.top),
  };
}

function _pcPointerDown(e) {
  _pcDrawing = true;
  const p = _pcCanvasPoint(e);
  _pcCurrentPath = `M ${p.x} ${p.y}`;
  _pcCtx.beginPath();
  _pcCtx.moveTo(p.x, p.y);
}

function _pcPointerMove(e) {
  if (!_pcDrawing) return;
  const p = _pcCanvasPoint(e);
  _pcCurrentPath += ` L ${p.x} ${p.y}`;
  _pcCtx.lineTo(p.x, p.y);
  _pcCtx.stroke();
}

function _pcPointerUp() {
  if (!_pcDrawing) return;
  _pcDrawing = false;
  if (_pcCurrentPath) _pcPaths.push(_pcCurrentPath);
  _pcCurrentPath = null;
}

function _pcClearSignature() {
  _pcInitCanvas();
}

function _pcSignatureToSvg() {
  if (!_pcPaths.length) return null;
  const paths = _pcPaths.map(d => `<path d="${d}" stroke="#1d1d1b" stroke-width="2" fill="none" stroke-linecap="round"/>`).join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${_pcCanvas.width}" height="${_pcCanvas.height}">${paths}</svg>`;
}

// ── OTP ──

async function _pcSendOtp() {
  const errEl = document.getElementById('pc-error');
  errEl.textContent = '';
  if (!_pcSelectedStatus) { errEl.textContent = 'Choisissez un statut avant de continuer.'; return; }
  if (!_pcPaths.length) { errEl.textContent = 'Signez dans le cadre prévu avant de continuer.'; return; }

  const btn = document.getElementById('pc-continue-btn');
  btn.disabled = true;
  btn.textContent = 'Envoi du code…';
  try {
    const { data, error } = await sb.functions.invoke('cyberdesk-send-signature-otp', { body: {} });
    if (error) throw error;
    if (!data?.success) throw new Error("échec de l'envoi du code.");
    document.getElementById('pc-otp-panel').style.display = 'block';
    showCrmToast('📧 Code envoyé par e-mail');
  } catch (e) {
    errEl.textContent = 'Erreur : ' + (e.message || 'réessayez plus tard.');
  } finally {
    btn.disabled = false;
    btn.textContent = 'Continuer';
  }
}

async function _pcSubmitSignature() {
  const code = document.getElementById('pc-otp-code').value.trim();
  const errEl = document.getElementById('pc-error');
  errEl.textContent = '';
  if (!/^\d{6}$/.test(code)) { errEl.textContent = 'Saisissez le code à 6 chiffres reçu par e-mail.'; return; }

  const svg = _pcSignatureToSvg();
  if (!svg) { errEl.textContent = 'Signature manquante — recommencez.'; return; }

  const btn = document.getElementById('pc-verify-btn');
  btn.disabled = true;
  btn.textContent = 'Validation…';
  try {
    const { data, error } = await sb.functions.invoke('cyberdesk-verify-signature', {
      body: { code, remuneration_status: _pcSelectedStatus, signature_svg: svg },
    });
    if (error) throw error;
    if (!data?.success) throw new Error("échec de la vérification.");

    showCrmToast('✅ Contrat signé');
    if (_pcMode === 'gate') {
      document.getElementById('partner-contract-modal').classList.remove('show');
      if (typeof continueAfterContractSigned === 'function') await continueAfterContractSigned();
    } else {
      closePartnerContractModal();
      if (typeof _settingsRefreshContractStatus === 'function') await _settingsRefreshContractStatus();
    }
  } catch (e) {
    errEl.textContent = 'Erreur : ' + (e.message || 'code invalide ou expiré.');
  } finally {
    btn.disabled = false;
    btn.textContent = 'Valider la signature';
  }
}
