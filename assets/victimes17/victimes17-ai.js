/* ============================================================
   S@FE CYBER PILOT — Assistant IA côté dossier victime 17Cyber
   Appel à l'Edge Function cyber-ia-assistant avec { lead_id, question }
   uniquement — le contexte du dossier (diagnostic + notes + chronologie)
   est désormais assemblé ET pseudonymisé côté serveur (voir
   supabase/functions/cyber-ia-assistant/index.ts), pas dans le navigateur.
   Le prompt système CYBER_SYSTEM n'est plus envoyé depuis ici non plus.
   ============================================================ */

let _victimAiLeadId = null;

function openVictimAiModal(leadId) {
  const lead = _v17Leads.find(l => l.id === leadId);
  if (!lead) return;
  _victimAiLeadId = leadId;

  document.getElementById('victim-ai-modal-title').textContent =
    `Assistant IA — ${lead.first_name || ''} ${lead.last_name || ''}`.trim();
  document.getElementById('victim-ai-input').value = '';
  document.getElementById('victim-ai-output').innerHTML = 'Prêt — posez votre question.';
  document.getElementById('victim-ai-output').style.fontStyle = 'italic';
  document.getElementById('victim-ai-modal').classList.add('show');
}

function closeVictimAiModal() {
  document.getElementById('victim-ai-modal').classList.remove('show');
}

function _victimAiDemoReply() {
  return "**Assistant IA momentanément indisponible**\n\nRéessayez dans quelques instants, ou vérifiez la configuration de l'API côté Edge Function (cyber-ia-assistant).";
}

async function sendVictimAiMessage() {
  const input = document.getElementById('victim-ai-input');
  const output = document.getElementById('victim-ai-output');
  const question = input?.value?.trim();
  if (!question || !output || !_victimAiLeadId) return;

  output.style.fontStyle = 'normal';
  output.innerHTML = '<span style="color:var(--mut)">⏳ Analyse en cours…</span>';
  input.disabled = true;
  document.getElementById('victim-ai-send').disabled = true;

  try {
    const { data: { session } } = await sb.auth.getSession();
    const resp = await fetch(`${SUPABASE_URL}/functions/v1/cyber-ia-assistant`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${session.access_token}`,
        'apikey': SUPABASE_ANON_KEY,
      },
      body: JSON.stringify({ lead_id: _victimAiLeadId, question }),
    });
    const result = await resp.json();
    if (!resp.ok || result.error) throw new Error(result.details || result.error || 'Erreur inconnue');

    _renderVictimAiReply(question, result.reply, 'Claude');
    input.value = '';
  } catch (err) {
    console.error('[victim-ai]', err);
    _renderVictimAiReply(question, _victimAiDemoReply(), 'Secours');
  } finally {
    input.disabled = false;
    document.getElementById('victim-ai-send').disabled = false;
    input.focus();
  }
}

function _renderVictimAiReply(question, reply, provider) {
  const output = document.getElementById('victim-ai-output');
  if (!output) return;
  output.innerHTML = `
    <div style="display:flex;gap:8px;margin-bottom:10px">
      <span style="font-size:.72rem;color:var(--mut);font-family:var(--ff-mono)">Vous :</span>
      <span style="font-size:.82rem;color:var(--mut-2)">${escapeHtml(question)}</span>
    </div>
    <div style="border-top:1px solid var(--line);padding-top:10px">
      <span style="font-size:.68rem;color:#18753c;font-family:var(--ff-mono)">🤖 ${escapeHtml(provider)} :</span>
      <div style="font-size:.83rem;color:var(--txt);line-height:1.65;margin-top:6px;white-space:pre-line">${escapeHtml(reply).replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')}</div>
    </div>
    <div style="margin-top:10px;display:flex;gap:8px">
      <button class="btn-diag-ghost" id="victim-ai-copy-btn">📋 Copier</button>
    </div>`;
  // reply passé par closure (pas interpolé dans le HTML) : évite toute
  // casse/injection si le texte de l'IA contient des guillemets ou des
  // caractères spéciaux HTML (ex. citation d'un email de phishing).
  output.querySelector('#victim-ai-copy-btn')?.addEventListener('click', () => {
    navigator.clipboard.writeText(reply).then(() => showCrmToast('📋 Copié'));
  });
}

// Attaché directement (pas de DOMContentLoaded) : ce script est chargé en
// fin de body, après le HTML de la modale — le DOM est déjà disponible.
document.getElementById('victim-ai-suggest')?.addEventListener('change', function () {
  if (this.value) {
    const inp = document.getElementById('victim-ai-input');
    if (inp) { inp.value = this.value; this.value = ''; inp.focus(); }
  }
});
