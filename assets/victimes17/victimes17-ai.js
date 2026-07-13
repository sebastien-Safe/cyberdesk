/* ============================================================
   CyberDesk — Assistant IA côté dossier victime 17Cyber
   Appel direct à l'Edge Function cyber-ia-assistant, même prompt
   système que le module B2B (assets/js/cyber-ai-system-prompt.js,
   à charger avant ce fichier), mais contexte enrichi avec les
   données réelles du diagnostic collecté par le CRM.
   ============================================================ */

let _victimAiLeadId = null;

// Construit un résumé texte du dossier (diagnostic + notes + chronologie)
// injecté avant la question — c'est le contexte "CRM" attendu par le
// prompt système partagé.
function _buildVictimAiContext(lead) {
  const lines = [];
  lines.push(`Type de victime : ${lead.victim_type || 'non renseigné'}.`);
  if (lead.attack_type) lines.push(`Type d'attaque (diagnostic) : ${lead.attack_type}.`);
  if (lead.attack_description) lines.push(`Description de l'incident : ${lead.attack_description}`);
  if (lead.severity) lines.push(`Gravité déclarée : ${lead.severity}.`);
  if (lead.targeted_services) lines.push(`Services/plateformes visés : ${lead.targeted_services}.`);
  if (Array.isArray(lead.impacted_systems) && lead.impacted_systems.length) {
    lines.push(`Systèmes touchés : ${lead.impacted_systems.join(', ')}.`);
  }
  if (lead.financial_loss) lines.push(`Préjudice financier estimé : ${lead.financial_loss}.`);
  if (lead.activity_impacted) lines.push(`Activité professionnelle impactée : ${lead.activity_impacted}.`);
  if (lead.third_party_data_exposed && lead.third_party_data_exposed !== 'non') {
    lines.push(`Données personnelles de tiers exposées : ${lead.third_party_data_exposed}.`);
  }
  if (lead.os_victim) lines.push(`Système d'exploitation de la victime : ${lead.os_victim}.`);
  if (lead.complaint_status) lines.push(`Dépôt de plainte : ${lead.complaint_status}.`);
  if (lead.birth_year) lines.push(`Âge approximatif de la victime : ${new Date().getFullYear() - lead.birth_year} ans.`);
  if (Array.isArray(lead.timeline_events) && lead.timeline_events.length) {
    const chrono = lead.timeline_events.map(e => `${e.date || '?'} — ${e.description || ''}`).filter(Boolean).join(' ; ');
    if (chrono) lines.push(`Chronologie connue : ${chrono}`);
  }
  if (lead.notes) lines.push(`Notes dossier (compte-rendu des échanges avec la victime) : ${lead.notes}`);
  if (lead.internal_notes) lines.push(`Notes internes conseiller : ${lead.internal_notes}`);

  return lines.length ? `Contexte du dossier CRM :\n${lines.join('\n')}\n\n` : '';
}

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

  const lead = _v17Leads.find(l => l.id === _victimAiLeadId);
  if (!lead) return;

  output.style.fontStyle = 'normal';
  output.innerHTML = '<span style="color:var(--mut)">⏳ Analyse en cours…</span>';
  input.disabled = true;
  document.getElementById('victim-ai-send').disabled = true;

  const context = _buildVictimAiContext(lead);

  try {
    const { data: { session } } = await sb.auth.getSession();
    const resp = await fetch(`${SUPABASE_URL}/functions/v1/cyber-ia-assistant`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${session.access_token}`,
        'apikey': SUPABASE_ANON_KEY,
      },
      body: JSON.stringify({ system: CYBER_SYSTEM, message: context + question }),
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
      <button class="btn-diag-ghost" onclick="navigator.clipboard.writeText(${JSON.stringify(reply)}).then(()=>showCrmToast('📋 Copié'))">📋 Copier</button>
    </div>`;
}

// Attaché directement (pas de DOMContentLoaded) : ce script est chargé en
// fin de body, après le HTML de la modale — le DOM est déjà disponible.
document.getElementById('victim-ai-suggest')?.addEventListener('change', function () {
  if (this.value) {
    const inp = document.getElementById('victim-ai-input');
    if (inp) { inp.value = this.value; this.value = ''; inp.focus(); }
  }
});
