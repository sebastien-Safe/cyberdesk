// Projet partagé avec safe-crm (Safe-crm-V2) — mêmes valeurs que
// assets/js/supabase.client.js. Page publique, aucune session requise :
// la validité vient uniquement du token dans l'URL, vérifié côté serveur
// par l'Edge Function (--no-verify-jwt, service_role).
const _SB_URL = 'https://bgkijldrmdhklkadkeua.supabase.co';
const _SB_ANON_KEY = 'sb_publishable_0e2GVUwr3Tml870xyaEMwQ_LZDt0y32';

// TODO : lien réel de la fiche Google Business Profile S@FE
// (search.google.com/local/writereview?placeid=... ou lien "Avis" fourni
// par Google). Laissé vide tant qu'il n'est pas communiqué — le bouton
// reste caché plutôt que de pointer vers un lien inventé. Affiché à TOUS
// les clients qui soumettent un avis ici, quelle que soit leur note : ne
// jamais filtrer par note avant d'afficher ce lien (review gating interdit
// par les règles Google Business Profile).
const _GOOGLE_REVIEW_URL = '';

const _token = new URLSearchParams(location.search).get('token');
let _rating = 0;

const starsEl = document.getElementById('stars');
starsEl.querySelectorAll('.star').forEach(btn => {
  btn.addEventListener('click', () => {
    _rating = Number(btn.dataset.value);
    starsEl.querySelectorAll('.star').forEach(s => {
      s.classList.toggle('active', Number(s.dataset.value) <= _rating);
    });
  });
});

function showMsg(text, type) {
  const el = document.getElementById('msg');
  el.textContent = text;
  el.className = 'msg' + (type ? ' ' + type : '');
}

if (!_token) {
  document.getElementById('submit-btn').disabled = true;
  showMsg('Lien invalide — le jeton est manquant.', 'err');
}

async function submitReview() {
  if (!_token) return;
  if (!_rating) { showMsg('Sélectionnez une note avant d\'envoyer.', 'err'); return; }

  const btn = document.getElementById('submit-btn');
  btn.disabled = true;
  showMsg('', '');

  try {
    const r = await fetch(`${_SB_URL}/functions/v1/cyberdesk-submit-review`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'apikey': _SB_ANON_KEY },
      body: JSON.stringify({
        token: _token,
        rating: _rating,
        comment: document.getElementById('comment').value.trim(),
      }),
    });
    const data = await r.json().catch(() => ({}));
    if (r.ok && data.success) {
      document.getElementById('form-card').style.display = 'none';
      document.getElementById('thanks-card').style.display = 'block';
      if (_GOOGLE_REVIEW_URL) {
        const googleLink = document.getElementById('google-review-link');
        googleLink.href = _GOOGLE_REVIEW_URL;
        googleLink.style.display = 'block';
      }
    } else {
      showMsg('Ce lien n\'est plus valable (déjà utilisé ou expiré).', 'err');
      btn.disabled = false;
    }
  } catch {
    showMsg('Une erreur est survenue, réessayez plus tard.', 'err');
    btn.disabled = false;
  }
}

document.getElementById('submit-btn').addEventListener('click', submitReview);
