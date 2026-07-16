// ==========================================================================
// CyberDesk — Génération du devis 17Cyber (arbre de tâches)
// POST { lead_id } → { success, filename, docx_base64 }
// Le détail de la prestation se complète automatiquement à partir des actes
// techniques cochés dans l'arbre de tâches (intervention_tasks) ; à défaut,
// repli sur la liste des prestations type du produit. Le tarif reste le forfait
// du produit (price_ht/price_ttc) — pas de tarification à l'acte.
// Document calculé à la volée et retourné dans la réponse HTTP : aucun stockage
// serveur (cohérent avec le registre RGPD T11).
// ==========================================================================
import { createClient } from "@supabase/supabase-js";
import { Document, Packer, Paragraph } from "docx";
import { h1, h2, p, bullet, infoTable, pricingTable, centered } from "../_shared/docx-helpers.ts";
import { renderCgsBlocks } from "../_shared/cgs-render.ts";
import { PRODUCT_TEXTS } from "../_shared/product-texts.ts";

const CORS = {
  "Access-Control-Allow-Origin": "*", // TODO: restreindre au domaine cyberdesk une fois déployé
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}

const SAFE = {
  nom: "S@FE SASU",
  adresse: "66 avenue des Champs-Élysées, 75008 Paris",
  siret: "104 699 558 00011",
  email: "contact@safe-digitalisation.fr",
  referencement: "Prestataire référencé cybermalveillance.gouv.fr / 17Cyber",
};

interface TaskRecord {
  task_id: string;
  label: string;
  checked?: boolean;
}
interface PhaseRecord {
  phase_id: string;
  phase_label: string;
  tasks: TaskRecord[];
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "bad_method" }, 405);

  const SB_URL = Deno.env.get("SUPABASE_URL")!;
  const SB_ANON = Deno.env.get("SUPABASE_ANON_KEY")!;
  const SB_SR = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return json({ error: "unauthorized" }, 401);

  const sbAnon = createClient(SB_URL, SB_ANON, { global: { headers: { Authorization: authHeader } } });
  const { data: { user }, error: authErr } = await sbAnon.auth.getUser();
  if (authErr || !user) return json({ error: "unauthorized" }, 401);

  let body: any;
  try {
    body = await req.json();
  } catch {
    return json({ error: "bad_json" }, 400);
  }
  const leadId = body.lead_id;
  if (!leadId) return json({ error: "missing_lead_id" }, 400);

  const sb = createClient(SB_URL, SB_SR);
  const { data: lead, error: eLead } = await sb
    .from("cybervictim_leads")
    .select("id, first_name, last_name, email, phone, ticket_number, intervention_tasks, created_at, product_id, cybervictim_products(code, alert_type, price_ht, price_ttc)")
    .eq("id", leadId)
    .single();
  if (eLead || !lead) return json({ error: "not_found" }, 404);

  const { data: allProducts, error: eProducts } = await sb
    .from("cybervictim_products")
    .select("code, alert_type, price_ttc");
  if (eProducts) return json({ error: "products_fetch_failed" }, 500);

  const product = (lead as any).cybervictim_products || {};
  const it = lead.intervention_tasks || {};
  const phases: PhaseRecord[] = it.phases || [];
  const texts = PRODUCT_TEXTS[product.code] || { objet: `Intervention S@FE suite à un signalement 17Cyber — ${product.alert_type}.`, prestationsType: [] };

  const dossierRef = `S@FE-CYB-${new Date(lead.created_at || Date.now()).getFullYear()}-${leadId.slice(0, 8).toUpperCase()}`;
  const quoteRef = `DEV-${new Date().toISOString().slice(0, 10).replace(/-/g, "")}-17C-${leadId.slice(0, 4).toUpperCase()}`;
  const clientNom = `${lead.first_name || ""} ${lead.last_name || ""}`.trim() || "—";
  const dateEmission = new Date().toLocaleDateString("fr-FR", { day: "2-digit", month: "long", year: "numeric" });
  const dateValidite = new Date(Date.now() + 30 * 86400000).toLocaleDateString("fr-FR", { day: "2-digit", month: "long", year: "numeric" });

  const checkedByPhase = phases
    .map((ph) => ({ phase_label: ph.phase_label, tasks: (ph.tasks || []).filter((t) => t.checked) }))
    .filter((ph) => ph.tasks.length);

  const detailChildren: Paragraph[] = [];
  if (checkedByPhase.length) {
    for (const ph of checkedByPhase) {
      detailChildren.push(p(ph.phase_label, { bold: true, color: "030D26", size: 20 }));
      for (const t of ph.tasks) detailChildren.push(bullet(t.label));
    }
  } else {
    detailChildren.push(p("Prestation type comprenant notamment :", { italic: true, color: "666666" }));
    for (const item of texts.prestationsType) detailChildren.push(bullet(item));
  }

  const ht = Number(product.price_ht) || 0;
  const ttc = Number(product.price_ttc) || 0;

  const doc = new Document({
    sections: [
      {
        properties: { page: { size: { width: 11906, height: 16838 }, margin: { top: 1134, bottom: 1134, left: 1134, right: 1134 } } },
        children: [
          centered("S@FE", { bold: true, size: 22 }),
          centered("Cybersécurité · RGPD · Prestataire référencé cybermalveillance.gouv.fr", { color: "666666", size: 16 }),
          h1(`DEVIS — ${product.alert_type || "Intervention 17Cyber"}`),

          infoTable([
            ["Référence devis", quoteRef],
            ["Référence dossier S@FE", dossierRef],
            ["N° ticket 17Cyber", lead.ticket_number || "—"],
            ["Client", clientNom],
            ["Date d'émission", dateEmission],
            ["Validité", `30 jours — jusqu'au ${dateValidite}`],
          ]),

          h2("Objet"),
          p(texts.objet),

          h2("Détail de la prestation"),
          ...detailChildren,

          h2("Tarif"),
          pricingTable(ht, ttc, product.alert_type || "Intervention S@FE"),

          h2("Modalités de règlement"),
          bullet("Acompte de 50 % à la signature du présent devis ; solde à la remise du rapport d'intervention."),
          bullet("Moyens de paiement acceptés : virement bancaire ou carte (paiement sécurisé Stripe, option paiement en plusieurs fois dont 3x sans frais selon éligibilité de la carte)."),
          bullet("Devis gratuit et sans engagement, valable 30 jours à compter de sa date d'émission."),
          bullet("Conformément à l'art. L.221-18 du Code de la consommation, le client particulier dispose d'un délai de rétractation de 14 jours, sauf demande expresse d'exécution immédiate."),

          p(`Fait à Paris, le ${dateEmission}`, { size: 20 }),

          ...renderCgsBlocks((allProducts || []) as any),
        ],
      },
    ],
  });

  const base64 = await Packer.toBase64String(doc);
  const filename = `17C_${(product.code || "incident").toUpperCase()}_${(lead.last_name || "").replace(/\s+/g, "")}_${(lead.first_name || "").replace(/\s+/g, "")}_${new Date().toISOString().slice(0, 10).replace(/-/g, "")}_DEVIS.docx`;

  await sb.from("audit_logs").insert({
    user_id: user.id,
    action: "victim_devis_genere",
    module: "Victimes17Cyber",
    entity_type: "cybervictim_lead",
    entity_id: leadId,
    donnees_concernees: "Génération du devis (détail depuis l'arbre de tâches)",
    criticite: "Info",
    resultat: "Succès",
    details: { filename, tasks_checked: checkedByPhase.reduce((s, ph) => s + ph.tasks.length, 0) },
  });

  await sb.from("cybervictim_leads").update({ quote_generated_at: new Date().toISOString() }).eq("id", leadId);

  return json({ success: true, filename, docx_base64: base64 });
});
