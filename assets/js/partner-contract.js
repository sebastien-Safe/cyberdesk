// =========================================================
// S@FE CYBER PILOT — Tunnel d'onboarding partenaire (Mandataire /
// Associé SEP) : identité, choix de piste (avec explication
// juridique), compléments spécifiques à la piste (structure SEP,
// attestation casier judiciaire), puis signature électronique en
// boucle de chaque document requis (canvas → SVG, OTP par e-mail,
// hash serveur — cyberdesk-send-signature-otp / cyberdesk-verify-
// signature). Chaque étape est enregistrée dès sa validation
// (cyberdesk_user_settings) : le tunnel est repris là où il a été
// laissé à la prochaine ouverture, jamais redemandé depuis le début.
//
// Utilisé dans deux contextes :
//  - "voluntary" : ouvert depuis Paramétrage, fermable.
//  - "gate"      : ouvert par checkSession() tant que le tunnel n'est
//    pas complet (cyberdesk_feature_flags.contract_gate actif),
//    non fermable — pas de bouton de fermeture affiché.
// =========================================================

let _pcMode = 'voluntary';
let _pcStep = 1;
let _pcFields = {};
let _pcChosenStatus = null;
let _pcRates = { mandataire: 0, associe_sep: 0 };
let _pcSignedKeys = new Set();
let _pcDocs = [];
let _pcDocIndex = 0;
let _pcCanvas, _pcCtx;
let _pcPaths = [];
let _pcCurrentPath = null;
let _pcDrawing = false;

/** Ouvre le tunnel. mode: 'voluntary' (fermable) ou 'gate' (bloquant, première connexion). */
async function openPartnerContractModal(mode) {
  _pcMode = mode === 'gate' ? 'gate' : 'voluntary';
  document.getElementById('pc-cancel-btn').style.display = _pcMode === 'gate' ? 'none' : '';
  ['pc-step1-error', 'pc-step2-error', 'pc-step3-error', 'pc-error'].forEach(id => {
    document.getElementById(id).textContent = '';
  });

  const [{ data: statusRows }, { data: rateRows }] = await Promise.all([
    sb.rpc('cyberdesk_my_onboarding_status'),
    sb.from('cyberdesk_remuneration_rates').select('status, pct'),
  ]);
  const status = Array.isArray(statusRows) ? statusRows[0] : null;
  (rateRows || []).forEach(r => { _pcRates[r.status] = Number(r.pct); });
  document.getElementById('pc-pct-mandataire').textContent = _pcRates.mandataire.toFixed(2);
  document.getElementById('pc-pct-associe_sep').textContent = _pcRates.associe_sep.toFixed(2);

  _pcFields = {
    first_name: status?.first_name || '',
    last_name: status?.last_name || '',
    billing_name: status?.billing_name || '',
    siret: status?.siret || '',
    billing_address: status?.billing_address || '',
    sep_structure_nom: status?.sep_structure_nom || '',
    sep_structure_forme_juridique: status?.sep_structure_forme_juridique || '',
    sep_structure_siret: status?.sep_structure_siret || '',
    sep_structure_adresse: status?.sep_structure_adresse || '',
    sep_taux_apurement_pct: status?.sep_taux_apurement_pct ?? null,
  };
  _pcChosenStatus = status?.chosen_remuneration_status || null;
  const casierOk = !!status?.casier_judiciaire_atteste_at;

  _pcSignedKeys = new Set();
  (status?.signed_documents || []).forEach(d => {
    const def = _pcChosenStatus ? getPartnerDocument(_pcChosenStatus, d.document_key) : null;
    if (def && def.version === d.doc_version) _pcSignedKeys.add(d.document_key);
  });

  document.getElementById('pc-first-name').value = _pcFields.first_name;
  document.getElementById('pc-last-name').value = _pcFields.last_name;
  document.getElementById('pc-billing-name').value = _pcFields.billing_name;
  document.getElementById('pc-siret').value = _pcFields.siret;
  document.getElementById('pc-billing-address').value = _pcFields.billing_address;
  document.getElementById('pc-status-mandataire').checked = _pcChosenStatus === 'mandataire';
  document.getElementById('pc-status-associe_sep').checked = _pcChosenStatus === 'associe_sep';
  document.getElementById('pc-step2-continue').disabled = !_pcChosenStatus;
  document.getElementById('pc-sep-nom').value = _pcFields.sep_structure_nom;
  document.getElementById('pc-sep-forme').value = _pcFields.sep_structure_forme_juridique;
  document.getElementById('pc-sep-siret').value = _pcFields.sep_structure_siret;
  document.getElementById('pc-sep-adresse').value = _pcFields.sep_structure_adresse;
  document.getElementById('pc-sep-taux').value = _pcFields.sep_taux_apurement_pct ?? 10;
  document.getElementById('pc-sep-fields').style.display = _pcChosenStatus === 'associe_sep' ? 'block' : 'none';
  document.getElementById('pc-casier-judiciaire').checked = casierOk;

  document.getElementById('partner-contract-modal').classList.add('show');

  const resumeStep = _pcComputeResumeStep(casierOk);
  _pcGoToStep(resumeStep);
  if (resumeStep === 4) _pcRenderCurrentDoc();
}

/** Pure : à quelle étape (1-5) reprendre le tunnel, à partir de champs/piste/documents donnés. Pas de dépendance à l'état du module — réutilisée par isPartnerOnboardingComplete() sans ouvrir la modale. */
function _pcComputeResumeStepPure(fields, chosenStatus, signedKeys, casierOk) {
  if (!fields.first_name || !fields.last_name) return 1;
  if (!chosenStatus) return 2;
  const sepComplete = chosenStatus !== 'associe_sep' || (
    fields.sep_structure_nom && fields.sep_structure_forme_juridique &&
    fields.sep_structure_siret && fields.sep_structure_adresse &&
    fields.sep_taux_apurement_pct != null
  );
  if (!casierOk || !sepComplete) return 3;
  const docs = getPartnerDocumentsForStatus(chosenStatus);
  return docs.every(d => signedKeys.has(d.key)) ? 5 : 4;
}

/** Détermine à quelle étape reprendre le tunnel (état du module) et prépare _pcDocs/_pcDocIndex si l'étape 4/5 est atteinte. */
function _pcComputeResumeStep(casierOk) {
  const step = _pcComputeResumeStepPure(_pcFields, _pcChosenStatus, _pcSignedKeys, casierOk);
  if (step === 4 || step === 5) {
    _pcDocs = getPartnerDocumentsForStatus(_pcChosenStatus);
    _pcDocIndex = _pcDocs.findIndex(d => !_pcSignedKeys.has(d.key));
  }
  return step;
}

/**
 * Utilisée par checkSession() (index.html) pour décider d'ouvrir ou non le
 * tunnel en mode "gate", sans effet de bord sur l'état du module (pas
 * d'ouverture de modale). Vrai seulement si identité + piste + compléments
 * + tous les documents requis pour la piste sont signés à la version
 * courante.
 */
async function isPartnerOnboardingComplete() {
  const { data: rows, error } = await sb.rpc('cyberdesk_my_onboarding_status');
  if (error || !Array.isArray(rows) || !rows[0]) return false;
  const status = rows[0];
  const fields = {
    first_name: status.first_name,
    last_name: status.last_name,
    sep_structure_nom: status.sep_structure_nom,
    sep_structure_forme_juridique: status.sep_structure_forme_juridique,
    sep_structure_siret: status.sep_structure_siret,
    sep_structure_adresse: status.sep_structure_adresse,
    sep_taux_apurement_pct: status.sep_taux_apurement_pct,
  };
  const chosenStatus = status.chosen_remuneration_status || null;
  const signedKeys = new Set(
    (status.signed_documents || [])
      .filter(d => {
        const def = chosenStatus ? getPartnerDocument(chosenStatus, d.document_key) : null;
        return def && def.version === d.doc_version;
      })
      .map(d => d.document_key)
  );
  return _pcComputeResumeStepPure(fields, chosenStatus, signedKeys, !!status.casier_judiciaire_atteste_at) === 5;
}

function closePartnerContractModal() {
  if (_pcMode === 'gate') return; // non fermable en mode bloquant
  document.getElementById('partner-contract-modal').classList.remove('show');
}

function _pcGoToStep(step) {
  _pcStep = step;
  document.querySelectorAll('#partner-contract-modal .diag-section').forEach((s, i) => {
    s.classList.toggle('active', i + 1 === step);
  });
  document.querySelectorAll('#partner-contract-modal .diag-step').forEach((s, i) => {
    s.classList.remove('active', 'done');
    if (i + 1 < step) s.classList.add('done');
    if (i + 1 === step) s.classList.add('active');
    const dot = s.querySelector('.diag-step-dot');
    if (dot) dot.innerHTML = (i + 1 < step) ? '✓' : String(i + 1);
  });
  const counter = document.getElementById('pc-step-counter');
  if (counter) counter.textContent = `Étape ${step} / 5`;
}

// ── Étape 1 — Identité ──

async function _pcSaveStep1() {
  const errEl = document.getElementById('pc-step1-error');
  errEl.textContent = '';
  const firstName = document.getElementById('pc-first-name').value.trim();
  const lastName = document.getElementById('pc-last-name').value.trim();
  if (!firstName || !lastName) { errEl.textContent = 'Prénom et nom sont obligatoires.'; return; }

  _pcFields.first_name = firstName;
  _pcFields.last_name = lastName;
  _pcFields.billing_name = document.getElementById('pc-billing-name').value.trim();
  _pcFields.siret = document.getElementById('pc-siret').value.trim();
  _pcFields.billing_address = document.getElementById('pc-billing-address').value.trim();

  try {
    const { data: { user } } = await sb.auth.getUser();
    const { error } = await sb.from('cyberdesk_user_settings').upsert({
      user_id: user.id,
      first_name: firstName,
      last_name: lastName,
      billing_name: _pcFields.billing_name || null,
      siret: _pcFields.siret || null,
      billing_address: _pcFields.billing_address || null,
      updated_at: new Date().toISOString(),
    });
    if (error) throw error;
  } catch (e) {
    errEl.textContent = 'Erreur : ' + e.message;
    return;
  }
  _pcGoToStep(2);
}

// ── Étape 2 — Choix de la piste ──

function _pcSelectStatus(status) {
  _pcChosenStatus = status;
  document.getElementById('pc-step2-continue').disabled = false;
}

async function _pcSaveStep2() {
  const errEl = document.getElementById('pc-step2-error');
  errEl.textContent = '';
  if (!_pcChosenStatus) { errEl.textContent = 'Choisissez une piste avant de continuer.'; return; }

  try {
    const { data: { user } } = await sb.auth.getUser();
    const { error } = await sb.from('cyberdesk_user_settings').upsert({
      user_id: user.id,
      chosen_remuneration_status: _pcChosenStatus,
      updated_at: new Date().toISOString(),
    });
    if (error) throw error;
  } catch (e) {
    errEl.textContent = 'Erreur : ' + e.message;
    return;
  }
  document.getElementById('pc-sep-fields').style.display = _pcChosenStatus === 'associe_sep' ? 'block' : 'none';
  _pcGoToStep(3);
}

// ── Étape 3 — Compléments (structure SEP + attestation casier judiciaire) ──

async function _pcSaveStep3() {
  const errEl = document.getElementById('pc-step3-error');
  errEl.textContent = '';

  if (!document.getElementById('pc-casier-judiciaire').checked) {
    errEl.textContent = "L'attestation du casier judiciaire est obligatoire pour continuer.";
    return;
  }

  const payload = { updated_at: new Date().toISOString(), casier_judiciaire_atteste_at: new Date().toISOString() };

  if (_pcChosenStatus === 'associe_sep') {
    _pcFields.sep_structure_nom = document.getElementById('pc-sep-nom').value.trim();
    _pcFields.sep_structure_forme_juridique = document.getElementById('pc-sep-forme').value.trim();
    _pcFields.sep_structure_siret = document.getElementById('pc-sep-siret').value.trim();
    _pcFields.sep_structure_adresse = document.getElementById('pc-sep-adresse').value.trim();
    _pcFields.sep_taux_apurement_pct = Number(document.getElementById('pc-sep-taux').value);

    if (!_pcFields.sep_structure_nom || !_pcFields.sep_structure_forme_juridique ||
        !_pcFields.sep_structure_siret || !_pcFields.sep_structure_adresse) {
      errEl.textContent = 'Renseignez tous les champs de votre structure.';
      return;
    }
    if (!(_pcFields.sep_taux_apurement_pct >= 10 && _pcFields.sep_taux_apurement_pct <= 30)) {
      errEl.textContent = "Le taux d'apurement doit être compris entre 10 et 30 %.";
      return;
    }
    Object.assign(payload, {
      sep_structure_nom: _pcFields.sep_structure_nom,
      sep_structure_forme_juridique: _pcFields.sep_structure_forme_juridique,
      sep_structure_siret: _pcFields.sep_structure_siret,
      sep_structure_adresse: _pcFields.sep_structure_adresse,
      sep_taux_apurement_pct: _pcFields.sep_taux_apurement_pct,
    });
  }

  try {
    const { data: { user } } = await sb.auth.getUser();
    payload.user_id = user.id;
    const { error } = await sb.from('cyberdesk_user_settings').upsert(payload);
    if (error) throw error;
  } catch (e) {
    errEl.textContent = 'Erreur : ' + e.message;
    return;
  }

  _pcDocs = getPartnerDocumentsForStatus(_pcChosenStatus);
  _pcDocIndex = _pcDocs.findIndex(d => !_pcSignedKeys.has(d.key));
  if (_pcDocIndex === -1) { _pcGoToStep(5); return; }
  _pcGoToStep(4);
  _pcRenderCurrentDoc();
}

// ── Étape 4 — Signature (boucle sur les documents de la piste choisie) ──

function _pcRenderCurrentDoc() {
  const doc = _pcDocs[_pcDocIndex];
  if (!doc) return;
  document.getElementById('pc-doc-progress').textContent = `Document ${_pcDocIndex + 1} / ${_pcDocs.length}`;
  document.getElementById('pc-doc-title').textContent = doc.title;
  document.getElementById('pc-contract-text').textContent =
    buildPartnerDocumentText(_pcChosenStatus, doc.key, _pcFields, _pcRates[_pcChosenStatus]);
  document.getElementById('pc-otp-panel').style.display = 'none';
  document.getElementById('pc-otp-code').value = '';
  document.getElementById('pc-error').textContent = '';
  document.getElementById('pc-continue-btn').disabled = false;
  document.getElementById('pc-continue-btn').textContent = 'Continuer';
  _pcInitCanvas();
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

// ── OTP + vérification (un cycle par document) ──

async function _pcSendOtp() {
  const errEl = document.getElementById('pc-error');
  errEl.textContent = '';
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

  const doc = _pcDocs[_pcDocIndex];
  const btn = document.getElementById('pc-verify-btn');
  btn.disabled = true;
  btn.textContent = 'Validation…';
  try {
    const { data, error } = await sb.functions.invoke('cyberdesk-verify-signature', {
      body: { code, remuneration_status: _pcChosenStatus, document_key: doc.key, signature_svg: svg },
    });
    if (error) throw error;
    if (!data?.success) throw new Error("échec de la vérification.");

    _pcSignedKeys.add(doc.key);
    showCrmToast(`✅ ${doc.title} signé`);
    _pcDocIndex++;
    if (_pcDocIndex < _pcDocs.length) {
      _pcRenderCurrentDoc();
    } else {
      _pcGoToStep(5);
      if (_pcMode === 'voluntary' && typeof _settingsRefreshContractStatus === 'function') {
        await _settingsRefreshContractStatus();
      }
    }
  } catch (e) {
    errEl.textContent = 'Erreur : ' + (e.message || 'code invalide ou expiré.');
  } finally {
    btn.disabled = false;
    btn.textContent = 'Valider la signature';
  }
}

// ── Étape 5 — Confirmation ──

async function _pcFinish() {
  if (_pcMode === 'gate') {
    document.getElementById('partner-contract-modal').classList.remove('show');
    if (typeof continueAfterContractSigned === 'function') await continueAfterContractSigned();
  } else {
    closePartnerContractModal();
  }
}
