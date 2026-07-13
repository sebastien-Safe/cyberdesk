/* ============================================================
   Cybersec Clients — Checklist d'audit (ANSSI/CIS)
   23 points de contrôle, 6 catégories pondérées
   ============================================================ */

let _auditData = {}; // { item_key: { statut, notes, id } }

async function loadAudit() {
  if (!currentContact) return;
  const el = document.getElementById('audit-content');
  if (!el) return;
  el.innerHTML = '<div class="loader"><div class="spinner"></div>Chargement de l\'audit…</div>';

  const { data: rows } = await supa
    .from('cyber_client_audits')
    .select('*')
    .eq('contact_id', currentContact.id);

  _auditData = {};
  (rows || []).forEach(r => { _auditData[r.item_key] = r; });

  const { score, catScores } = await computeScoreCyber(currentContact.id);

  // Mettre à jour le score sidebar
  const scoreEl = document.getElementById('sidebar-score');
  if (scoreEl) { scoreEl.textContent = score + '%'; scoreEl.style.color = scoreColor(score); }

  // Progression globale
  const totalItems = Object.values(CYBER_CATS).flatMap(c => c.items).length;
  const verified   = Object.values(_auditData).filter(r => r.statut !== 'non_verifie').length;

  el.innerHTML = `
    <!-- Score global -->
    <div class="card" style="margin-bottom:16px">
      <div style="display:flex;align-items:center;gap:20px;flex-wrap:wrap">
        <div style="text-align:center;min-width:80px">
          <div style="font-family:var(--ff-disp);font-size:2.8rem;font-weight:800;
            color:${scoreColor(score)};line-height:1">${score}%</div>
          <div style="margin-top:4px">${scoreBadge(score)}</div>
        </div>
        <div style="flex:1;min-width:200px">
          <div style="font-size:.76rem;color:var(--mut);margin-bottom:8px;font-family:var(--ff-mono)">
            ${verified}/${totalItems} points vérifiés
          </div>
          <div class="score-bar-wrap" style="margin-bottom:12px">
            <div class="score-bar" style="width:${Math.round((verified/totalItems)*100)}%;background:var(--cyber)"></div>
          </div>
          ${Object.entries(CYBER_CATS).map(([catKey, cat]) => `
            <div style="display:flex;align-items:center;gap:8px;margin-bottom:5px">
              <span style="font-size:.74rem;color:var(--mut);min-width:170px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${cat.icon} ${cat.label}</span>
              <div class="score-bar-wrap" style="flex:1">
                <div class="score-bar" style="width:${catScores[catKey]||0}%;background:${scoreColor(catScores[catKey]||0)}"></div>
              </div>
              <span style="font-family:var(--ff-mono);font-size:.72rem;font-weight:700;
                color:${scoreColor(catScores[catKey]||0)};min-width:32px;text-align:right">${catScores[catKey]||0}%</span>
            </div>`).join('')}
        </div>
        <div style="display:flex;flex-direction:column;gap:6px">
          <button class="btn btn-pri btn-sm" onclick="saveAllAudit()">💾 Sauvegarder</button>
          <button class="btn btn-ghost btn-sm" onclick="exportAuditPDF()">📄 PDF</button>
        </div>
      </div>
    </div>

    <!-- Checklist par catégorie -->
    ${Object.entries(CYBER_CATS).map(([catKey, cat]) => renderCatBlock(catKey, cat, catScores[catKey]||0)).join('')}`;
}

function renderCatBlock(catKey, cat, catScore) {
  const catItems = cat.items.map(item => {
    const row    = _auditData[item.key] || {};
    const statut = row.statut || 'non_verifie';
    const notes  = row.notes  || '';
    return `
      <div class="checklist-item">
        <span style="font-size:1rem;flex-shrink:0">${statusIcon(statut)}</span>
        <span class="checklist-item-label">${escHtml(item.label)}</span>
        <select class="status-select ${statut}" id="st-${item.key}"
          onchange="onStatusChange('${item.key}','${catKey}',this)">
          <option value="non_verifie"  ${statut==='non_verifie'  ?'selected':''}>⚪ Non vérifié</option>
          <option value="conforme"     ${statut==='conforme'     ?'selected':''}>✅ Conforme</option>
          <option value="partiel"      ${statut==='partiel'      ?'selected':''}>🟡 Partiel</option>
          <option value="non_conforme" ${statut==='non_conforme' ?'selected':''}>❌ Non conforme</option>
          <option value="na"           ${statut==='na'           ?'selected':''}>➖ N/A</option>
        </select>
        <input class="checklist-notes-input" id="notes-${item.key}"
          value="${escHtml(notes)}" placeholder="Note…"
          onchange="onNotesChange('${item.key}',this.value)">
      </div>`;
  }).join('');

  return `
    <div class="checklist-cat">
      <div class="checklist-cat-head">
        <span class="checklist-cat-label">${cat.icon} ${cat.label}
          <span style="font-size:.72rem;color:var(--mut);font-weight:400">(${Math.round(cat.weight*100)}% du score)</span>
        </span>
        <span class="checklist-cat-score" style="color:${scoreColor(catScore)}">${catScore}%</span>
      </div>
      <div class="checklist-items">${catItems}</div>
    </div>`;
}

function statusIcon(st) {
  return { conforme:'✅', partiel:'🟡', non_conforme:'❌', na:'➖', non_verifie:'⚪' }[st] || '⚪';
}

/* ---- Changements inline ---- */
function onStatusChange(itemKey, catKey, selectEl) {
  const newSt = selectEl.value;
  // Mettre à jour l'icône
  const itemEl = selectEl.closest('.checklist-item');
  if (itemEl) itemEl.querySelector('span').textContent = statusIcon(newSt);
  // Mettre à jour classe du select
  selectEl.className = `status-select ${newSt}`;
  // Mettre en cache
  if (!_auditData[itemKey]) _auditData[itemKey] = {};
  _auditData[itemKey].statut   = newSt;
  _auditData[itemKey].categorie = catKey;
}

function onNotesChange(itemKey, val) {
  if (!_auditData[itemKey]) _auditData[itemKey] = {};
  _auditData[itemKey].notes = val;
}

/* ---- Sauvegarde de toute la checklist ---- */
async function saveAllAudit() {
  if (!currentContact) return;
  const { data: { user } } = await supa.auth.getUser();
  const now = new Date().toISOString();

  const upserts = [];
  for (const [catKey, cat] of Object.entries(CYBER_CATS)) {
    for (const item of cat.items) {
      const cached = _auditData[item.key] || {};
      upserts.push({
        contact_id: currentContact.id,
        categorie:  catKey,
        item_key:   item.key,
        statut:     cached.statut || 'non_verifie',
        notes:      cached.notes  || null,
        updated_at: now,
        created_by: user?.id,
      });
    }
  }

  const { error } = await supa.from('cyber_client_audits')
    .upsert(upserts, { onConflict: 'contact_id,item_key' });

  if (error) { toast('Erreur sauvegarde : ' + error.message, 'err'); return; }

  toast('Audit sauvegardé ✅');
  loadAudit(); // recalcul score
}

/* ---- Export PDF (brandé S@FE) ---- */
async function exportAuditPDF(returnBase64 = false) {
  const jsPDF = window.jspdf?.jsPDF || window.jsPDF;
  if (!jsPDF) { toast('jsPDF non disponible', 'err'); return null; }
  if (!currentContact) { toast('Sélectionnez un client', 'err'); return null; }

  const { score, catScores } = await computeScoreCyber(currentContact.id);
  const clientNom   = currentContact.entreprise || `${currentContact.prenom || ''} ${currentContact.nom || ''}`.trim() || 'Client';
  const dateRapport = new Date().toLocaleDateString('fr-FR');
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const W = 210;
  const navy = [13, 27, 54], white = [255, 255, 255];
  const scoreClr = score >= 80 ? [22, 163, 74] : score >= 50 ? [217, 119, 6] : [220, 38, 38];

  // ── En-tête ──
  doc.setFillColor(...navy); doc.rect(0, 0, W, 42, 'F');
  doc.setFont('helvetica', 'bold'); doc.setFontSize(18); doc.setTextColor(...white);
  doc.text('S@FE — Rapport Cybersécurité', 14, 16);
  doc.setFont('helvetica', 'normal'); doc.setFontSize(8.5); doc.setTextColor(148, 163, 184);
  doc.text(`Référentiel ANSSI / CIS Controls — ${dateRapport}`, 14, 24);
  doc.text(`Client : ${clientNom}`, 14, 31);

  // Score badge
  doc.setFillColor(30, 41, 59); doc.roundedRect(W - 52, 7, 40, 28, 4, 4, 'F');
  doc.setFont('helvetica', 'bold'); doc.setFontSize(22); doc.setTextColor(...scoreClr);
  doc.text(`${score}%`, W - 32, 23, { align: 'center' });
  doc.setFontSize(6.5); doc.setTextColor(148, 163, 184);
  const badge = score >= 80 ? 'SATISFAISANT' : score >= 50 ? 'À AMÉLIORER' : 'CRITIQUE';
  doc.text(badge, W - 32, 30, { align: 'center' });

  let y = 51;

  // ── Synthèse catégories ──
  const sumH = 8 + Object.keys(CYBER_CATS).length * 8;
  doc.setFillColor(248, 250, 252); doc.rect(14, y, W - 28, sumH, 'F');
  doc.setDrawColor(226, 232, 240); doc.rect(14, y, W - 28, sumH);
  y += 6;
  doc.setFont('helvetica', 'bold'); doc.setFontSize(8); doc.setTextColor(...navy);
  doc.text('Synthèse par catégorie', 18, y); y += 7;

  for (const [catKey, cat] of Object.entries(CYBER_CATS)) {
    const cs = catScores[catKey] || 0;
    const cc = cs >= 80 ? [22, 163, 74] : cs >= 50 ? [217, 119, 6] : [220, 38, 38];
    doc.setFont('helvetica', 'normal'); doc.setFontSize(7.5); doc.setTextColor(51, 65, 85);
    doc.text(cat.label, 18, y);
    const bx = 105, bw = 72, bh = 3;
    doc.setFillColor(226, 232, 240); doc.rect(bx, y - 3, bw, bh, 'F');
    doc.setFillColor(...cc); doc.rect(bx, y - 3, bw * cs / 100, bh, 'F');
    doc.setFont('helvetica', 'bold'); doc.setFontSize(7.5); doc.setTextColor(...cc);
    doc.text(`${cs}%`, bx + bw + 4, y);
    y += 8;
  }
  y += 6;

  // ── Détail par catégorie ──
  const stColors = { conforme: [22,163,74], partiel: [217,119,6], non_conforme: [220,38,38], na: [100,116,139], non_verifie: [148,163,184] };
  const stLabels = { conforme: '✓ Conforme', partiel: '~ Partiel', non_conforme: '✗ Non conforme', na: 'N/A', non_verifie: '? Non vérifié' };

  for (const [catKey, cat] of Object.entries(CYBER_CATS)) {
    if (y > 255) { doc.addPage(); y = 14; }
    doc.setFillColor(...navy); doc.rect(14, y, W - 28, 8, 'F');
    doc.setFont('helvetica', 'bold'); doc.setFontSize(8.5); doc.setTextColor(...white);
    doc.text(`${cat.label}  —  ${catScores[catKey] || 0}%  (poids ${Math.round(cat.weight * 100)}%)`, 18, y + 5.5);
    y += 11;

    for (const item of cat.items) {
      if (y > 268) { doc.addPage(); y = 14; }
      const row = _auditData[item.key] || {};
      const st  = row.statut || 'non_verifie';
      const cc  = stColors[st] || [148, 163, 184];
      const lbl = stLabels[st] || '?';
      doc.setFont('helvetica', 'normal'); doc.setFontSize(7.8); doc.setTextColor(51, 65, 85);
      const lines = doc.splitTextToSize(item.label, 128);
      doc.text(lines, 18, y);
      doc.setFont('helvetica', 'bold'); doc.setFontSize(7.8); doc.setTextColor(...cc);
      doc.text(lbl, W - 58, y);
      y += 4.8 * lines.length;
      if (row.notes) {
        doc.setFont('helvetica', 'italic'); doc.setFontSize(7); doc.setTextColor(100, 116, 139);
        const nl = doc.splitTextToSize(`Note : ${row.notes}`, 148);
        doc.text(nl, 22, y); y += 4.2 * nl.length;
      }
      y += 2;
    }
    y += 5;
  }

  // ── Pied de page ──
  const pages = doc.internal.getNumberOfPages();
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i);
    doc.setFillColor(248, 250, 252); doc.rect(0, 284, W, 13, 'F');
    doc.setFont('helvetica', 'normal'); doc.setFontSize(6.5); doc.setTextColor(148, 163, 184);
    doc.text('S@FE Digitalisation — Document confidentiel Cybersécurité', 14, 290);
    doc.text(`Page ${i}/${pages}`, W - 14, 290, { align: 'right' });
  }

  if (returnBase64) return doc.output('datauristring').split(',')[1];
  doc.save(`Audit-Cyber-${clientNom.replace(/[^a-z0-9]/gi, '_')}-${dateRapport.replace(/\//g, '-')}.pdf`);
}
