// Assistant des pages d'aide publiques (/aide/<slug>/) — logique partagée par
// les 10 fiches, extraite du <script> inline généré par
// scripts/build-aide-publique.mjs pour permettre une CSP stricte
// (script-src 'self', sans 'unsafe-inline').
//
// Les valeurs propres à chaque page (situation, slug, version de consentement)
// sont lues sur les attributs data-* de la balise <script> elle-même —
// aucune donnée inline, donc compatible CSP stricte.
(function () {
  var SB = 'https://bgkijldrmdhklkadkeua.supabase.co';
  var KEY = 'sb_publishable_0e2GVUwr3Tml870xyaEMwQ_LZDt0y32';

  var _s = document.currentScript;
  var SITUATION = _s.dataset.situation;
  var SLUG = _s.dataset.slug;
  var CONSENT_VERSION = _s.dataset.consentVersion;

  var form = document.getElementById('ia-form'),
      out = document.getElementById('ia-out'),
      msg = document.getElementById('ia-msg'),
      btn = document.getElementById('ia-submit');
  var leadId = null;

  function show(el, txt, cls) { el.textContent = txt; el.className = (cls || '') + ' show'; }
  function note(txt, type) { msg.textContent = txt; msg.className = 'ia-msg ' + (type || '') + ' show'; }

  form.addEventListener('submit', function (ev) {
    ev.preventDefault();
    if (!document.getElementById('f-consent').checked) { note('Merci de cocher la case de consentement.', 'err'); return; }
    btn.disabled = true; btn.textContent = 'Analyse en cours…'; msg.className = 'ia-msg'; out.className = 'ia-out';
    fetch(SB + '/functions/v1/cyberdesk-public-assistant', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'apikey': KEY },
      body: JSON.stringify({
        first_name: document.getElementById('f-prenom').value.trim(),
        last_name: document.getElementById('f-nom').value.trim(),
        email: document.getElementById('f-email').value.trim(),
        consent: true,
        consent_version: CONSENT_VERSION,
        situation_key: SITUATION, page_slug: SLUG,
        device: document.getElementById('f-appareil').value || null,
        question: document.getElementById('f-question').value.trim()
      })
    }).then(function (r) { return r.json().then(function (j) { return { ok: r.ok, status: r.status, body: j }; }); })
      .then(function (res) {
        if (res.body && res.body.lead_id) leadId = res.body.lead_id;
        if (res.ok && res.body.reply) { show(out, res.body.reply, 'ia-out'); note('Vos coordonnées ont été enregistrées : un conseiller peut vous rappeler.', 'ok'); }
        else if (res.status === 429) { note(res.body.message || "L'assistant a atteint sa limite d'utilisation. Les étapes de cette page restent valables — un conseiller peut aussi vous rappeler.", 'err'); }
        else { note(res.body.message || "L'assistant est momentanément indisponible. Suivez les étapes de cette page : elles couvrent la très grande majorité des situations.", 'err'); }
      })
      .catch(function () { note("Connexion impossible. Suivez les étapes de cette page, elles ne nécessitent aucun outil.", 'err'); })
      .finally(function () { btn.disabled = false; btn.textContent = 'Obtenir une réponse'; });
  });

  Array.prototype.forEach.call(document.querySelectorAll('.p-cta'), function (b) {
    b.addEventListener('click', function () {
      if (!leadId) {
        note('Renseignez d\'abord vos coordonnées dans le formulaire ci-dessus.', 'err');
        document.getElementById('assistant').scrollIntoView({ behavior: 'smooth' }); return;
      }
      if (b.dataset.direct !== '1') { note('Votre demande est enregistrée : un conseiller vous rappelle pour établir un devis gratuit.', 'ok'); return; }
      b.disabled = true; b.textContent = 'Redirection…';
      fetch(SB + '/functions/v1/cyberdesk-public-checkout', {
        method: 'POST', headers: { 'Content-Type': 'application/json', 'apikey': KEY },
        body: JSON.stringify({ lead_id: leadId, prestation_id: b.dataset.presta })
      }).then(function (r) { return r.json(); })
        .then(function (j) {
          if (j.checkout_url) { window.location.href = j.checkout_url; }
          else { note(j.message || 'Commande indisponible pour le moment. Un conseiller vous rappellera.', 'err'); b.disabled = false; b.textContent = 'Commander'; }
        })
        .catch(function () { note('Commande indisponible pour le moment. Un conseiller vous rappellera.', 'err'); b.disabled = false; b.textContent = 'Commander'; });
    });
  });
})();
