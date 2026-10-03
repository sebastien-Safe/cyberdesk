// Projet partagé avec safe-crm (Safe-crm-V2) — mêmes valeurs que
// assets/js/supabase.client.js. Page publique, pas de gate module
// nécessaire ici (n'appelle qu'une Edge Function, aucune table protégée).
const _SB_URL = 'https://bgkijldrmdhklkadkeua.supabase.co';
const _SB_ANON_KEY = 'sb_publishable_0e2GVUwr3Tml870xyaEMwQ_LZDt0y32';

// Échappement HTML des champs libres du formulaire avant injection dans le
// rapport (document.write dans une fenêtre about:blank sans CSP) — page
// publique, saisie non fiable.
function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

async function sendAuditEmail(to_email, to_name, params) {
  try {
    const r = await fetch(`${_SB_URL}/functions/v1/cyberdesk-send-audit-email`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'apikey': _SB_ANON_KEY },
      body: JSON.stringify({ to_email, to_name, params }),
    });
    if (r.ok) showToast('Rapport envoyé par email ✓', 'ok');
    else showToast('PDF généré — email non envoyé', 'warn');
  } catch { showToast('PDF généré — email non envoyé', 'warn'); }
}

const Q = [
  {id:'c1', dom:'👤 Gouvernance', q:"Un responsable de la sécurité informatique est-il désigné dans votre structure ?",
   opts:[{ico:'✅',l:"Oui, formalisé",r:'ok'},{ico:'⚠️',l:"Informellement",r:'warn'},{ico:'❌',l:"Non",r:'alert'}]},
  {id:'c2', dom:'🔑 Authentification', q:"L'authentification à deux facteurs (MFA) est-elle activée sur vos comptes critiques ?",
   opts:[{ico:'✅',l:"Oui, sur tous les comptes admin",r:'ok'},{ico:'⚠️',l:"Partiellement",r:'warn'},{ico:'❌',l:"Non",r:'alert'}]},
  {id:'c3', dom:'💻 Postes de travail', q:"Vos postes et serveurs sont-ils à jour (OS, logiciels, antivirus) ?",
   opts:[{ico:'✅',l:"Oui, mises à jour automatiques",r:'ok'},{ico:'⚠️',l:"Manuellement / irrégulièrement",r:'warn'},{ico:'❌',l:"Non",r:'alert'}]},
  {id:'c4', dom:'📡 Réseau', q:"Le Wi-Fi professionnel est-il séparé du réseau invités / clients ?",
   opts:[{ico:'✅',l:"Oui, réseaux distincts",r:'ok'},{ico:'⚠️',l:"Même réseau avec mot de passe",r:'warn'},{ico:'❌',l:"Non",r:'alert'}]},
  {id:'c5', dom:'💾 Sauvegardes', q:"Des sauvegardes régulières sont-elles réalisées et testées (restauration) ?",
   opts:[{ico:'✅',l:"Oui, avec test de restauration",r:'ok'},{ico:'⚠️',l:"Sauvegardes sans test",r:'warn'},{ico:'❌',l:"Non / irrégulières",r:'alert'}]},
  {id:'c6', dom:'🎣 Sensibilisation', q:"Vos équipes ont-elles été sensibilisées aux tentatives de phishing ?",
   opts:[{ico:'✅',l:"Oui, formation réalisée",r:'ok'},{ico:'⚠️',l:"Information ponctuelle",r:'warn'},{ico:'❌',l:"Non",r:'alert'}]},
  {id:'c7', dom:'🌐 Sécurité web', q:"Votre site web est-il en HTTPS avec un certificat SSL valide et à jour ?",
   opts:[{ico:'✅',l:"Oui, note A / A+",r:'ok'},{ico:'⚠️',l:"HTTPS mais certificat faible",r:'warn'},{ico:'❌',l:"Non / HTTP",r:'alert'}]},
];

const W={ok:2,warn:1,alert:0};
const MAX=Q.length*2;
let cur=0, ans={};

function init(){
  const wiz=document.getElementById('wiz');
  wiz.innerHTML=Q.map((q,i)=>`
    <div class="q-screen" id="qs-${i}">
      <div class="domaine">${q.dom}</div>
      <div class="q-text">${q.q}</div>
      <div class="opts">
        ${q.opts.map((o,j)=>`<button class="opt" id="opt-${i}-${j}" data-qi="${i}" data-oi="${j}" data-r="${o.r}" data-l="${o.l.replace(/"/g,'&quot;')}">
          <span class="opt-ico">${o.ico}</span><span>${o.l}</span>
        </button>`).join('')}
      </div>
      <button class="prev-btn" data-back="1" ${i===0?'disabled':''}>← Question précédente</button>
    </div>`).join('');

  wiz.querySelectorAll('.opt').forEach(btn => {
    btn.addEventListener('click', () => pick(+btn.dataset.qi, +btn.dataset.oi, btn.dataset.r, btn.dataset.l));
  });
  wiz.querySelectorAll('.prev-btn').forEach(btn => {
    btn.addEventListener('click', goBack);
  });

  show(0);
}

function show(i){
  document.querySelectorAll('.q-screen').forEach(el=>el.classList.remove('active'));
  document.getElementById(`qs-${i}`)?.classList.add('active');
  const saved=ans[Q[i]?.id];
  if(saved){ Q[i].opts.forEach((o,j)=>{ const b=document.getElementById(`opt-${i}-${j}`); if(b){ b.classList.remove('sel-ok','sel-warn','sel-alert'); if(o.l===saved.l) b.classList.add('sel-'+saved.r); } }); }
  const pct=Math.round(Object.keys(ans).length/Q.length*100);
  document.getElementById('q-label').textContent=`Question ${i+1} / ${Q.length}`;
  document.getElementById('q-pct').textContent=pct+' %';
  document.getElementById('prog').style.width=pct+'%';
}

function pick(qi,oi,risk,label){
  ans[Q[qi].id]={r:risk,l:label,q:Q[qi].q};
  Q[qi].opts.forEach((_,j)=>{ const b=document.getElementById(`opt-${qi}-${j}`); if(b) b.classList.remove('sel-ok','sel-warn','sel-alert'); });
  document.getElementById(`opt-${qi}-${oi}`).classList.add('sel-'+risk);
  setTimeout(()=>{ if(qi===Q.length-1) showResults(); else{ cur=qi+1; show(cur); } },380);
}

function goBack(){ if(cur>0){ cur--; show(cur); } }

function showResults(){
  document.getElementById('prog-wrap').style.display='none';
  document.getElementById('wiz').style.display='none';
  document.getElementById('results').style.display='block';
  const total=Object.values(ans).reduce((s,a)=>s+W[a.r],0);
  const pct=Math.round(total/MAX*100);
  let rColor,rLabel,rBg,rBorder;
  if(pct>=80){rColor='#18753c';rLabel='✅ Posture satisfaisante';rBg='rgba(24,117,60,.1)';rBorder='var(--ok)'}
  else if(pct>=60){rColor='#b34000';rLabel='⚠️ Risque modéré';rBg='rgba(179,64,0,.1)';rBorder='var(--warn)'}
  else if(pct>=40){rColor='#e1000f';rLabel='🔴 Risque élevé';rBg='rgba(225,0,15,.08)';rBorder='var(--alert)'}
  else{rColor='#e1000f';rLabel='🚨 Critique';rBg='rgba(225,0,15,.12)';rBorder='var(--alert)'}
  const ring=document.getElementById('score-ring');
  ring.style.borderColor=rBorder;ring.style.background=rBg;ring.style.color=rColor;
  document.getElementById('score-n').textContent=pct+'%';
  const chip=document.getElementById('risk-chip');
  chip.textContent=rLabel;chip.style.background=rBg;chip.style.border='1px solid '+rBorder;chip.style.color=rColor;
  const crit=Object.values(ans).filter(a=>a.r==='alert');
  const warn=Object.values(ans).filter(a=>a.r==='warn');
  let html='<div class="findings-title">Points à corriger</div>';
  if(!crit.length&&!warn.length){ html+='<div class="fi">✅ Aucun point critique — bonne posture de sécurité</div>'; }
  else{ crit.forEach(a=>html+=`<div class="fi"><span style="color:var(--alert);flex-shrink:0">❌</span><span>${a.q}</span></div>`); warn.forEach(a=>html+=`<div class="fi"><span style="color:var(--warn);flex-shrink:0">⚠️</span><span>${a.q}</span></div>`); }
  document.getElementById('findings').innerHTML=html;
}

function openModal(){ document.getElementById('modal').classList.add('open'); }
function closeModal(){ document.getElementById('modal').classList.remove('open'); }

function genPDF(){
  const nom=document.getElementById('f-nom').value.trim();
  const email=document.getElementById('f-email').value.trim();
  const ent=document.getElementById('f-ent').value.trim();
  const tel=document.getElementById('f-tel').value.trim();
  const rgpd=document.getElementById('f-rgpd').checked;
  if(!nom||!email){ showToast('Nom et e-mail obligatoires','err'); return; }
  if(!rgpd){ showToast('Consentement RGPD requis','err'); return; }
  const total=Object.values(ans).reduce((s,a)=>s+W[a.r],0);
  const pct=Math.round(total/MAX*100);
  const now=new Date().toLocaleDateString('fr-FR',{day:'2-digit',month:'long',year:'numeric'});
  const lvlColor=pct>=80?'#065f46':pct>=60?'#92400e':pct>=40?'#991b1b':'#7f1d1d';
  const lvl=pct>=80?'Posture satisfaisante':pct>=60?'Risque modéré':pct>=40?'Risque élevé':'Critique';
  const rows=Q.map(q=>{ const a=ans[q.id]; if(!a) return '';
    const badge=a.r==='ok'?`<span style="background:#d1fae5;color:#065f46;padding:2px 9px;border-radius:99px;font-size:11px">✅ OK</span>`:a.r==='warn'?`<span style="background:#fef3c7;color:#92400e;padding:2px 9px;border-radius:99px;font-size:11px">⚠️ Partiel</span>`:`<span style="background:#fee2e2;color:#991b1b;padding:2px 9px;border-radius:99px;font-size:11px">❌ À corriger</span>`;
    return `<tr><td style="padding:8px 10px;border-bottom:1px solid #f3f4f6;font-size:12px;width:55%">${q.q}</td><td style="padding:8px 10px;border-bottom:1px solid #f3f4f6;font-size:12px">${a.l}</td><td style="padding:8px 10px;border-bottom:1px solid #f3f4f6">${badge}</td></tr>`;}).join('');
  const rowsData=Q.map(q=>{ const a=ans[q.id]; if(!a) return null; const s=a.r==='ok'?{text:'✅ OK',bg:'#d1fae5',color:'#065f46'}:a.r==='warn'?{text:'⚠️ Partiel',bg:'#fef3c7',color:'#92400e'}:{text:'❌ À corriger',bg:'#fee2e2',color:'#991b1b'}; return {question:q.q,reponse:a.l,...s}; }).filter(Boolean);
  const html=`<!DOCTYPE html><html lang="fr"><head><meta charset="utf-8"><title>Rapport Cyber — ${esc(nom)}</title>
<style>@page{margin:18mm 16mm}body{font-family:Arial,sans-serif;color:#1f2937;font-size:13px;line-height:1.5}
.header{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:3px solid #000091;padding-bottom:10px;margin-bottom:16px}
.logo{font-size:20px;font-weight:900}.logo b{color:#e1000f}.logo small{display:block;font-size:9px;font-weight:400;color:#6b7280;letter-spacing:2px;text-transform:uppercase;margin-top:1px}
.prospect{background:#f0f0ff;border:1px solid #c7c7f5;border-radius:8px;padding:12px 14px;margin-bottom:16px;display:grid;grid-template-columns:1fr 1fr;gap:4px}
.pf label{font-size:9px;text-transform:uppercase;letter-spacing:1px;color:#000091;font-weight:700}.pf span{font-size:13px;display:block;margin-top:1px}
.score-box{text-align:center;padding:16px;border:2px solid;border-radius:12px;margin-bottom:16px}
.score-pct{font-size:38px;font-weight:900}.score-lbl{font-size:11px;color:#6b7280;margin-top:4px}
table{width:100%;border-collapse:collapse}th{background:#000091;color:#fff;padding:7px 10px;text-align:left;font-size:10px;text-transform:uppercase;letter-spacing:.5px}
.consent{background:#eff6ff;border:1px solid #bfdbfe;border-radius:8px;padding:10px 12px;font-size:11px;color:#1e40af;margin-top:14px}
.footer{margin-top:14px;padding-top:8px;border-top:1px solid #e5e7eb;font-size:10px;color:#9ca3af;display:flex;justify-content:space-between}
</style></head><body>
<div class="header"><div><div class="logo">S<b>@</b>FE<small>Safe Digitalisation</small></div></div><div style="text-align:right"><div style="font-size:15px;font-weight:700;color:#000091">Diagnostic Cybersécurité</div><small style="color:#6b7280">${now}</small></div></div>
<div class="prospect"><div class="pf"><label>Prospect</label><span>${esc(nom)}</span></div><div class="pf"><label>Entreprise</label><span>${esc(ent||'—')}</span></div><div class="pf"><label>E-mail</label><span>${esc(email)}</span></div><div class="pf"><label>Téléphone</label><span>${esc(tel||'—')}</span></div></div>
<div class="score-box" style="border-color:${pct>=80?'#22c55e':pct>=60?'#f59e0b':'#ef4444'};background:${pct>=80?'#f0fdf4':pct>=60?'#fffbeb':'#fef2f2'}">
<div class="score-pct" style="color:${lvlColor}">${pct}%</div><div class="score-lbl">Score de sécurité — ${lvl}</div></div>
<table><thead><tr><th>Question</th><th>Réponse</th><th>Statut</th></tr></thead><tbody>${rows}</tbody></table>
<div class="consent">✓ Consentement RGPD recueilli le ${now}. ${esc(nom)} (${esc(email)}) autorise S@FE à conserver ses coordonnées. Données non transmises à des tiers — Art. 13 RGPD.</div>
<div class="footer"><span>S@FE — Safe Digitalisation · contact@safe-digitalisation.fr</span><span>Rapport du ${now}</span></div>
</body></html>`;
  const w=window.open('','_blank');w.document.write(html);w.document.close();w.onload=()=>w.print();
  closeModal();showToast('Rapport généré !','ok');

  const niveauBg     = pct>=80?'#f0fdf4':pct>=60?'#fffbeb':pct>=40?'#fef2f2':'#fdf4ff';
  const niveauBorder = pct>=80?'#22c55e':pct>=60?'#f59e0b':'#ef4444';
  sendAuditEmail(email, nom, {
    nom, entreprise: ent||'—', email, telephone: tel||'—',
    mission: 'Cybersécurité', mission_color: '#000091',
    score: String(pct), niveau: lvl, niveau_color: lvlColor,
    niveau_bg: niveauBg, niveau_border: niveauBorder,
    rows: rowsData, recommandations: [],
    date: now, conseiller: 'Safe Digitalisation',
  });
}

function restart(){
  ans={}; cur=0;
  document.getElementById('prog-wrap').style.display='block';
  document.getElementById('wiz').style.display='flex';
  document.getElementById('results').style.display='none';
  show(0);
}

let _tt;
function showToast(msg,type='info'){ const t=document.getElementById('toast'); clearTimeout(_tt); t.textContent=msg; t.className='toast '+type+' show'; _tt=setTimeout(()=>t.classList.remove('show'),2800); }

// Liaisons événements — boutons statiques
document.getElementById('results').querySelector('.btn-pdf').addEventListener('click', openModal);
document.getElementById('results').querySelector('.btn-rst').addEventListener('click', restart);
document.getElementById('modal').querySelector('.btn-gen').addEventListener('click', genPDF);
document.getElementById('modal').querySelector('.btn-cancel').addEventListener('click', closeModal);

init();
