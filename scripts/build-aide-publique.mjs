#!/usr/bin/env node
// ==========================================================================
// S@FE CYBER PILOT — Générateur des pages publiques d'aide aux victimes.
//
//   node scripts/build-aide-publique.mjs
//
// Lit  : assets/data/task_trees.json      (arbre de tâches, source des étapes)
//        assets/data/aide-publique.json   (surcouche éditoriale publique)
//        assets/data/tarifs-cyberdesk.json (source unique de vérité tarifaire)
//        scripts/templates/aide.css       (feuille de style inlinée)
// Écrit: aide/index.html, aide/<slug>/index.html, sitemap.xml
//
// Pourquoi un générateur alors que le projet est « Vanilla JS, pas de
// bundler » : ces pages doivent être INDEXABLES, donc le contenu doit être
// présent dans le HTML servi, pas injecté par un fetch() côté navigateur.
// Le script est un outil de développement lancé à la main ; sa sortie est
// committée, et le site reste du HTML statique sans dépendance d'exécution.
//
// Les étapes ne sont jamais recopiées dans aide-publique.json : elles sont
// lues ici dans task_trees.json. Les libellés de tâches sont identiques sur
// les 4 systèmes (vérifié) et seuls les `detail` varient — on affiche donc
// une seule étape, avec les précisions par appareil regroupées dessous.
// ==========================================================================
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (p) => readFileSync(join(ROOT, p), "utf8");
const readJson = (p) => JSON.parse(read(p));

const TREES = readJson("assets/data/task_trees.json");
const AIDE = readJson("assets/data/aide-publique.json");
const TARIFS = readJson("assets/data/tarifs-cyberdesk.json");
const CSS = read("scripts/templates/aide.css");

const BASE = AIDE.site.base_url;
const OS_ORDER = ["windows", "mac", "ios", "android"];

// Projet Supabase partagé — mêmes valeurs publiques que avis-client.html
// et mission-cyber.html (clé « publishable », destinée au navigateur).
const SB_URL = "https://bgkijldrmdhklkadkeua.supabase.co";
const SB_ANON = "sb_publishable_0e2GVUwr3Tml870xyaEMwQ_LZDt0y32";

/** Échappe le texte destiné au HTML. */
const esc = (s) =>
  String(s ?? "")
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");

/** Sérialise un objet pour une balise <script type="application/ld+json">. */
const jsonLd = (o) => JSON.stringify(o, null, 0).replace(/</g, "\\u003c");

/** Catalogue des prestations, indexé par id (source : tarifs-cyberdesk.json). */
const PRESTATIONS = new Map();
for (const niv of TARIFS.niveaux) {
  for (const p of niv.prestations) {
    const ht = Number(p.ht);
    PRESTATIONS.set(p.id, {
      id: p.id,
      label: p.label,
      niveau: niv.label,
      ht,
      ttc: Math.round(ht * (1 + TARIFS.tva) * 100) / 100,
      // Seul le niveau 1 est achetable en libre-service depuis une page
      // publique — voir supabase/functions/_shared/public-prestations.ts,
      // qui refait la même restriction côté serveur (le client ne décide
      // jamais du prix ni de ce qui est vendable).
      achat_direct: p.id.startsWith("N1-"),
    });
  }
}

const eur = (n) =>
  n.toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " €";

/**
 * Construit les étapes publiques d'une phase de l'arbre de tâches.
 * Regroupe les 4 variantes système en une étape unique : un `detail`
 * commun quand les 4 sont identiques, sinon des précisions par appareil
 * (les systèmes qui partagent la même précision sont regroupés).
 */
function etapesDePhase(situationKey, phaseId) {
  const incident = TREES.incidents[situationKey];
  if (!incident) throw new Error(`situation_key inconnue : ${situationKey}`);

  const parOs = {};
  for (const os of OS_ORDER) {
    const phase = (incident.os_tasks[os] || []).find((p) => p.phase_id === phaseId);
    if (!phase) throw new Error(`phase ${phaseId} absente pour ${situationKey}/${os}`);
    parOs[os] = phase.tasks;
  }

  return parOs.windows.map((ref, i) => {
    const details = {};
    for (const os of OS_ORDER) {
      const t = parOs[os][i];
      if (!t || t.label !== ref.label) {
        throw new Error(`ordre des tâches divergent (${situationKey}/${phaseId}/${os} #${i})`);
      }
      details[os] = (t.detail || "").trim();
    }

    const distinctes = [...new Set(Object.values(details).filter(Boolean))];
    const etape = { label: ref.label, critique: ref.priority === "critical" };

    if (distinctes.length === 0) return etape;
    if (distinctes.length === 1 && OS_ORDER.every((os) => details[os] === distinctes[0])) {
      etape.detail = distinctes[0];
      return etape;
    }
    // Regroupe les systèmes partageant la même précision, en conservant
    // l'ordre windows → mac → ios → android.
    const groupes = new Map();
    for (const os of OS_ORDER) {
      const d = details[os];
      if (!d) continue;
      if (!groupes.has(d)) groupes.set(d, []);
      groupes.get(d).push(os);
    }
    etape.groupes = [...groupes].map(([texte, oses]) => ({ texte, oses }));
    return etape;
  });
}

/** Normalise une section de aide-publique.json en { titre, intro, etapes }. */
function resoudreSection(fiche, section) {
  if (section.type === "custom") {
    return {
      titre: section.titre,
      intro: section.intro || "",
      etapes: section.etapes.map((e) => ({
        label: e.label,
        detail: e.detail,
        critique: !!e.critique,
        groupes: e.par_appareil
          ? OS_ORDER.filter((os) => e.par_appareil[os]).map((os) => ({
              texte: e.par_appareil[os],
              oses: [os],
            }))
          : null,
      })),
    };
  }
  if (section.type === "phase") {
    const meta = AIDE.phases_publiques[section.phase];
    if (!meta) throw new Error(`phase sans libellé public : ${section.phase}`);
    if (section.phase === "analyse" || section.phase === "rapport") {
      throw new Error(`phase interne non publiable : ${section.phase}`);
    }
    return {
      titre: meta.titre,
      intro: meta.intro || "",
      etapes: etapesDePhase(fiche.situation_key, section.phase),
    };
  }
  throw new Error(`type de section inconnu : ${section.type}`);
}

/** Rend une étape en <li>. */
function rendreEtape(e) {
  const groupes = (e.groupes || [])
    .map(
      (g) =>
        `<div class="ap"><b>${esc(g.oses.map((os) => AIDE.appareils[os]).join(" et "))}</b>${esc(g.texte)}</div>`,
    )
    .join("");
  return `      <li${e.critique ? ' class="et-critique"' : ""}>
        <div class="et-l">${esc(e.label)}</div>${
    e.detail ? `\n        <div class="et-d">${esc(e.detail)}</div>` : ""
  }${groupes ? `\n        <div class="appareils">${groupes}</div>` : ""}
      </li>`;
}

/** Rend une section en <section>. */
function rendreSection(s) {
  return `    <section>
      <h2>${esc(s.titre)}</h2>${s.intro ? `\n      <p class="sec-intro">${esc(s.intro)}</p>` : ""}
      <ol class="etapes">
${s.etapes.map(rendreEtape).join("\n")}
      </ol>
    </section>`;
}

/** Bloc des prestations proposées, avec achat direct pour le niveau 1. */
function rendrePrestations(fiche) {
  const items = fiche.prestations_proposees
    .map((id) => PRESTATIONS.get(id))
    .filter(Boolean)
    .map(
      (p) => `      <div class="p">
        <div class="p-txt"><div class="p-n">${esc(p.niveau)}</div><div class="p-l">${esc(p.label)}</div></div>
        <div class="p-prix">${esc(eur(p.ttc))}<small>TTC · ${esc(eur(p.ht))} HT</small></div>
        <button class="p-cta${p.achat_direct ? " direct" : ""}" data-presta="${esc(p.id)}" data-direct="${p.achat_direct ? "1" : "0"}">${
        p.achat_direct ? "Commander" : "Être rappelé"
      }</button>
      </div>`,
    )
    .join("\n");

  return `    <section>
      <h2>Faire intervenir un professionnel</h2>
      <p class="sec-intro">Le diagnostic est gratuit. Les prestations ci-dessous sont réalisées par S@FE, prestataire référencé cybermalveillance.gouv.fr / 17Cyber. Pour être recontacté, renseignez d'abord vos coordonnées dans le bloc ci-dessus.</p>
      <div class="presta">
${items}
      </div>
    </section>`;
}

/** Formulaire de question libre (assistant IA). */
function rendreFormulaireIa(fiche) {
  return `    <section class="ia" id="assistant">
      <h2>Ma question n'est pas dans cette fiche</h2>
      <p class="sec-intro">Décrivez votre situation en quelques lignes : notre assistant vous répond immédiatement, et un conseiller peut vous rappeler ensuite si nécessaire.</p>
      <form id="ia-form" autocomplete="on">
        <div class="grid2">
          <div class="field"><label for="f-prenom">Prénom *</label><input id="f-prenom" name="prenom" type="text" required autocomplete="given-name"></div>
          <div class="field"><label for="f-nom">Nom *</label><input id="f-nom" name="nom" type="text" required autocomplete="family-name"></div>
        </div>
        <div class="grid2">
          <div class="field"><label for="f-email">E-mail *</label><input id="f-email" name="email" type="email" required autocomplete="email"></div>
          <div class="field"><label for="f-appareil">Appareil concerné</label>
            <select id="f-appareil" name="appareil">
              <option value="">Je ne sais pas</option>
              <option value="windows">Ordinateur Windows</option>
              <option value="mac">Mac</option>
              <option value="ios">iPhone / iPad</option>
              <option value="android">Téléphone Android</option>
            </select>
          </div>
        </div>
        <div class="field"><label for="f-question">Votre question *</label><textarea id="f-question" name="question" required maxlength="1500" placeholder="Ex. : mon téléphone chauffe et une application inconnue est apparue hier, que dois-je vérifier ?"></textarea></div>
        <label class="consent" for="f-consent">
          <input type="checkbox" id="f-consent" required>
          <span>${esc(AIDE.consentement.texte)}</span>
        </label>
        <button class="btn" type="submit" id="ia-submit">Obtenir une réponse</button>
      </form>
      <div class="ia-msg" id="ia-msg"></div>
      <div class="ia-out" id="ia-out"></div>
      <p class="ia-note">Réponse générée automatiquement à partir de nos procédures d'intervention. Elle ne remplace pas un diagnostic personnalisé et n'a pas de valeur juridique. N'indiquez jamais de mot de passe ni de code de validation dans ce formulaire.</p>
    </section>`;
}

/** Script inline de la page (envoi du formulaire + commande). */
function rendreScript(fiche) {
  return `<script>
(function(){
  var SB='${SB_URL}', KEY='${SB_ANON}';
  var SITUATION=${JSON.stringify(fiche.situation_key)}, SLUG=${JSON.stringify(fiche.slug)};
  var form=document.getElementById('ia-form'), out=document.getElementById('ia-out'),
      msg=document.getElementById('ia-msg'), btn=document.getElementById('ia-submit');
  var leadId=null;

  function show(el,txt,cls){ el.textContent=txt; el.className=(cls||'')+' show'; }
  function note(txt,type){ msg.textContent=txt; msg.className='ia-msg '+(type||'')+' show'; }

  form.addEventListener('submit', function(ev){
    ev.preventDefault();
    if(!document.getElementById('f-consent').checked){ note('Merci de cocher la case de consentement.','err'); return; }
    btn.disabled=true; btn.textContent='Analyse en cours…'; msg.className='ia-msg'; out.className='ia-out';
    fetch(SB+'/functions/v1/cyberdesk-public-assistant',{
      method:'POST',
      headers:{'Content-Type':'application/json','apikey':KEY},
      body:JSON.stringify({
        first_name:document.getElementById('f-prenom').value.trim(),
        last_name:document.getElementById('f-nom').value.trim(),
        email:document.getElementById('f-email').value.trim(),
        consent:true,
        consent_version:${JSON.stringify(AIDE.consentement.version)},
        situation_key:SITUATION, page_slug:SLUG,
        device:document.getElementById('f-appareil').value||null,
        question:document.getElementById('f-question').value.trim()
      })
    }).then(function(r){ return r.json().then(function(j){ return {ok:r.ok,status:r.status,body:j}; }); })
      .then(function(res){
        if(res.body && res.body.lead_id) leadId=res.body.lead_id;
        if(res.ok && res.body.reply){ show(out,res.body.reply,'ia-out'); note('Vos coordonnées ont été enregistrées : un conseiller peut vous rappeler.','ok'); }
        else if(res.status===429){ note(res.body.message||"L'assistant a atteint sa limite d'utilisation. Les étapes de cette page restent valables — un conseiller peut aussi vous rappeler.",'err'); }
        else { note(res.body.message||"L'assistant est momentanément indisponible. Suivez les étapes de cette page : elles couvrent la très grande majorité des situations.",'err'); }
      })
      .catch(function(){ note("Connexion impossible. Suivez les étapes de cette page, elles ne nécessitent aucun outil.",'err'); })
      .finally(function(){ btn.disabled=false; btn.textContent='Obtenir une réponse'; });
  });

  Array.prototype.forEach.call(document.querySelectorAll('.p-cta'), function(b){
    b.addEventListener('click', function(){
      if(!leadId){ note('Renseignez d\\'abord vos coordonnées dans le formulaire ci-dessus.','err');
        document.getElementById('assistant').scrollIntoView({behavior:'smooth'}); return; }
      if(b.dataset.direct!=='1'){ note('Votre demande est enregistrée : un conseiller vous rappelle pour établir un devis gratuit.','ok'); return; }
      b.disabled=true; b.textContent='Redirection…';
      fetch(SB+'/functions/v1/cyberdesk-public-checkout',{
        method:'POST', headers:{'Content-Type':'application/json','apikey':KEY},
        body:JSON.stringify({lead_id:leadId, prestation_id:b.dataset.presta})
      }).then(function(r){ return r.json(); })
        .then(function(j){ if(j.checkout_url){ window.location.href=j.checkout_url; }
          else { note(j.message||'Commande indisponible pour le moment. Un conseiller vous rappellera.','err'); b.disabled=false; b.textContent='Commander'; } })
        .catch(function(){ note('Commande indisponible pour le moment. Un conseiller vous rappellera.','err'); b.disabled=false; b.textContent='Commander'; });
    });
  });
})();
</script>`;
}

const TOPBAR = `<header class="topbar">
  <a class="brand" href="/aide/">S<b>@</b>FE</a>
  <span class="chip">Aide aux victimes</span>
  <span class="spacer"></span>
  <a class="ret" href="/aide/">Toutes les situations</a>
</header>`;

const FOOTER = `<footer><div class="in">
  <div><strong>${esc(AIDE.site.nom)}</strong> — ${esc(AIDE.site.referencement)}.</div>
  <div>Urgence : en cas de danger immédiat, appelez le <strong>17</strong>. Cyberharcèlement : <strong>3018</strong> (gratuit, anonyme). Signalement : <a href="https://www.cybermalveillance.gouv.fr" rel="noopener">cybermalveillance.gouv.fr</a>.</div>
  <div>Éditeur ${esc(AIDE.site.editeur)} — <a href="mailto:${esc(AIDE.site.contact)}">${esc(AIDE.site.contact)}</a>. Conseils généraux issus de nos procédures d'intervention, sans valeur de diagnostic personnalisé ni de conseil juridique.</div>
</div></footer>`;

const AVERT = `    <div class="avert">Ces étapes sont des conseils généraux, établis d'après les bonnes pratiques de l'ANSSI et de Cybermalveillance.gouv.fr. Elles ne remplacent pas l'examen de votre appareil par un professionnel. <strong>Ne communiquez jamais vos mots de passe ni les codes reçus par SMS</strong>, à personne — pas même à un technicien.</div>`;

/** Squelette HTML commun. */
function page({ title, description, canonical, body, ld, script = "" }) {
  return `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'self' https:; script-src 'self' 'unsafe-inline' https:; style-src 'self' 'unsafe-inline' https:; img-src 'self' data: https:; font-src 'self' data: https:; connect-src 'self' https:;">
<meta name="referrer" content="strict-origin-when-cross-origin">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)}</title>
<meta name="description" content="${esc(description)}">
<meta name="robots" content="index,follow">
<link rel="canonical" href="${esc(canonical)}">
<meta property="og:type" content="article">
<meta property="og:locale" content="fr_FR">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(description)}">
<meta property="og:url" content="${esc(canonical)}">
<link rel="icon" href="/favicon.svg" type="image/svg+xml">
<style>
${CSS}</style>
${ld.map((o) => `<script type="application/ld+json">${jsonLd(o)}</script>`).join("\n")}
</head>
<body>
${TOPBAR}
<main class="wrap">
${body}
</main>
${FOOTER}
${script}
</body>
</html>
`;
}

/** Génère une fiche. */
function genererFiche(fiche) {
  const url = `${BASE}/aide/${fiche.slug}/`;
  const sections = fiche.sections.map((s) => resoudreSection(fiche, s));
  const toutesEtapes = sections.flatMap((s) => s.etapes);

  const body = [
    `    <nav class="bc"><a href="/aide/">Aide aux victimes</a> › ${esc(fiche.h1)}</nav>`,
    `    <h1><span class="ico-h1">${fiche.icone}</span>${esc(fiche.h1)}</h1>`,
    `    <p class="lede">${esc(fiche.intro)}</p>`,
    fiche.urgence?.length
      ? `    <div class="urgence"><div class="urgence-t">À faire en priorité</div><ul>${fiche.urgence
          .map((u) => `<li>${esc(u)}</li>`)
          .join("")}</ul></div>`
      : "",
    AVERT,
    ...sections.map(rendreSection),
    rendreFormulaireIa(fiche),
    rendrePrestations(fiche),
    fiche.aussi_voir?.length
      ? `    <section><h2>Autres situations</h2><div class="liens">${fiche.aussi_voir
          .map((slug) => {
            const f = AIDE.fiches.find((x) => x.slug === slug);
            return f ? `<a href="/aide/${esc(f.slug)}/">${f.icone} ${esc(f.h1)}</a>` : "";
          })
          .join("")}</div></section>`
      : "",
    fiche.requetes_associees?.length
      ? `    <section><h2>Cette page répond aussi à</h2><p class="req">${fiche.requetes_associees
          .map((q) => `<span>« ${esc(q)} »</span>`)
          .join("")}</p></section>`
      : "",
  ]
    .filter(Boolean)
    .join("\n\n");

  const ld = [
    {
      "@context": "https://schema.org",
      "@type": "HowTo",
      name: fiche.h1,
      description: fiche.meta_description,
      inLanguage: "fr-FR",
      totalTime: "PT30M",
      publisher: { "@type": "Organization", name: AIDE.site.nom, url: BASE },
      step: toutesEtapes.map((e, i) => ({
        "@type": "HowToStep",
        position: i + 1,
        name: e.label,
        text: e.detail || (e.groupes || []).map((g) => g.texte).join(" ") || e.label,
      })),
    },
    {
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      itemListElement: [
        { "@type": "ListItem", position: 1, name: "Aide aux victimes", item: `${BASE}/aide/` },
        { "@type": "ListItem", position: 2, name: fiche.h1, item: url },
      ],
    },
  ];

  const html = page({
    title: fiche.titre_seo,
    description: fiche.meta_description,
    canonical: url,
    body,
    ld,
    script: rendreScript(fiche),
  });

  const dir = join(ROOT, "aide", fiche.slug);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "index.html"), html, "utf8");
  return { url, etapes: toutesEtapes.length };
}

/** Génère l'accueil /aide/. */
function genererAccueil() {
  const cards = AIDE.fiches
    .map(
      (f) => `      <a class="card" href="/aide/${esc(f.slug)}/">
        <div class="card-i">${f.icone}</div>
        <div class="card-t">${esc(f.h1)}</div>
        <div class="card-d">${esc(f.meta_description.split(":")[0].slice(0, 110))}</div>
      </a>`,
    )
    .join("\n");

  const body = `    <h1>Victime d'une cyberattaque ? Commencez ici.</h1>
    <p class="lede">Choisissez la situation qui ressemble le plus à la vôtre. Chaque fiche donne les gestes à faire tout de suite, appareil par appareil, puis les démarches pour faire valoir vos droits. C'est gratuit et vous n'avez rien à installer.</p>
    <div class="urgence"><div class="urgence-t">Vous ne savez pas où vous situer ?</div><ul>
      <li>De l'argent a bougé sur vos comptes : appelez votre banque, puis voyez la fiche carte bancaire ou faux conseiller.</li>
      <li>Vous êtes menacé ou harcelé : le <strong>3018</strong> est gratuit et anonyme, 7 jours sur 7. Danger immédiat : le <strong>17</strong>.</li>
      <li>Vous avez un doute sur un appareil : commencez par la fiche de vérification du smartphone ou de l'appareil infecté.</li>
    </ul></div>
${AVERT}
    <section>
      <h2>Les situations couvertes</h2>
      <div class="cards">
${cards}
      </div>
    </section>`;

  const html = page({
    title: "Victime d'une cyberattaque : que faire ? Aide gratuite pas à pas",
    description:
      "Compte piraté, phishing, faux support technique, rançongiciel, smartphone suspect : les gestes à faire immédiatement, appareil par appareil, et vos démarches. Gratuit, sans inscription.",
    canonical: `${BASE}/aide/`,
    body,
    ld: [
      {
        "@context": "https://schema.org",
        "@type": "CollectionPage",
        name: "Aide aux victimes de cybermalveillance",
        inLanguage: "fr-FR",
        url: `${BASE}/aide/`,
        publisher: { "@type": "Organization", name: AIDE.site.nom, url: BASE },
      },
    ],
  });

  mkdirSync(join(ROOT, "aide"), { recursive: true });
  writeFileSync(join(ROOT, "aide", "index.html"), html, "utf8");
}

// ── Exécution ─────────────────────────────────────────────────────────────
genererAccueil();
const urls = [`${BASE}/aide/`];
let total = 0;
for (const fiche of AIDE.fiches) {
  const { url, etapes } = genererFiche(fiche);
  urls.push(url);
  total += etapes;
  console.log(`  ✓ /aide/${fiche.slug}/  (${etapes} étapes)`);
}

// Sitemap : uniquement les pages publiques d'aide. Les pages applicatives
// (index.html, mission-cyber.html, avis-client.html…) restent en noindex et
// n'y figurent volontairement pas.
const sitemap =
  '<?xml version="1.0" encoding="UTF-8"?>\n' +
  '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
  urls
    .map(
      (u) =>
        `  <url><loc>${u}</loc><changefreq>monthly</changefreq>` +
        `<priority>${u.endsWith("/aide/") ? "1.0" : "0.8"}</priority></url>`,
    )
    .join("\n") +
  "\n</urlset>\n";
writeFileSync(join(ROOT, "sitemap.xml"), sitemap, "utf8");
console.log(`\n${AIDE.fiches.length} fiches, ${total} étapes publiées, accueil + sitemap générés.`);
