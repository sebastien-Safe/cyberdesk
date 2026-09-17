// ==========================================================================
// S@FE CYBER PILOT — Génère le bordereau mensuel de commissionnement de
// chaque agent actif (un PDF par bénéficiaire, récapitulant
// cyberdesk_commission_ledger sur un mois calendaire). Déclenchée par
// pg_cron le 1er de chaque mois à 3h (cyberdesk_run_generate_commission_
// bordereaux(), migration 034), authentifiée par secret partagé — même
// schéma que purge-cybervictim-data / PURGE_SECRET.
//
// Document de calcul et de contrôle uniquement : ne modifie JAMAIS
// cyberdesk_commission_ledger.status (toujours piloté à la main par un
// admin, cyberdesk_update_commission_status). Reprend TOUTES les lignes
// du mois quel que soit leur statut — un récapitulatif complet, pas
// seulement les lignes en attente.
//
// POST { period?: 'YYYY-MM', force?: boolean }
//   period : mois calendaire cible, défaut = mois précédent (calculé ici,
//            jamais dupliqué côté SQL).
//   force  : régénère même si un bordereau existe déjà pour la période
//            (backfill/correction admin) — défaut false, sinon idempotent
//            (un ré-appel du cron sur une période déjà traitée ne
//            duplique rien).
//   → { period, beneficiaries_processed, beneficiaries_skipped_existing,
//       warnings, errors }
// ==========================================================================
import { createClient } from "@supabase/supabase-js";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

const SAFE = {
  nom: "S@FE SAS",
  adresse: "66 avenue des Champs-Élysées, 75008 Paris",
  siret: "104 699 558 00011",
};

const STATUS_LABELS: Record<string, string> = {
  a_facturer: "À facturer",
  facturee: "Facturée",
  payee: "Payée",
  a_verser: "À verser",
  verse: "Versé",
};

const MONTHS_FR = [
  "janvier", "février", "mars", "avril", "mai", "juin",
  "juillet", "août", "septembre", "octobre", "novembre", "décembre",
];

function periodLabelFr(period: string): string {
  const [y, m] = period.split("-").map(Number);
  return `${MONTHS_FR[m - 1]} ${y}`;
}

function computePreviousPeriod(): string {
  const now = new Date();
  const prev = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));
  return `${prev.getUTCFullYear()}-${String(prev.getUTCMonth() + 1).padStart(2, "0")}`;
}

function periodBounds(period: string): { start: Date; end: Date } {
  const [y, m] = period.split("-").map(Number);
  return {
    start: new Date(Date.UTC(y, m - 1, 1)),
    end: new Date(Date.UTC(y, m, 1)),
  };
}

function na(v: string | null | undefined): string {
  return (v && v.trim()) || "[à compléter]";
}

function eur(n: number): string {
  return n.toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " €";
}

interface LedgerLine {
  id: string;
  status: string;
  pct_applied: number;
  amount_due: number;
  created_at: string;
}

interface BeneficiarySettings {
  first_name?: string | null;
  last_name?: string | null;
  billing_name?: string | null;
  billing_address?: string | null;
  siret?: string | null;
  tva_number?: string | null;
  regime_tva?: string | null;
}

/** PDF canonique du bordereau — un document par bénéficiaire, pas de donnée de victime/dossier nominative. */
async function buildBordereauPdf(params: {
  displayReference: string;
  period: string;
  beneficiary: BeneficiarySettings;
  remunerationStatus: "mandataire" | "associe_sep";
  lines: LedgerLine[];
  totals: { total_amount_due: number; total_tva: number | null; total_ttc: number | null };
  warning: string | null;
}): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  let page = doc.addPage([595.28, 841.89]);
  const fB = await doc.embedFont(StandardFonts.HelveticaBold);
  const fR = await doc.embedFont(StandardFonts.Helvetica);
  const cNavy = rgb(0x03 / 255, 0x0d / 255, 0x26 / 255);
  const cGrey = rgb(0.45, 0.45, 0.45);
  const cBlack = rgb(0.1, 0.1, 0.1);
  const cWarn = rgb(0.6, 0.2, 0.1);

  const marginX = 50;
  const colDate = marginX;
  const colStatut = marginX + 90;
  const colTaux = marginX + 230;
  const colMontant = marginX + 300;
  let y = 780;

  const t = (text: string, x: number, yy: number, opts: { font?: any; size?: number; color?: any } = {}) => {
    page.drawText(text, { x, y: yy, font: opts.font || fR, size: opts.size || 10, color: opts.color || cBlack });
  };

  t(SAFE.nom, marginX, y, { font: fB, size: 22, color: cNavy });
  t("Bordereau de commissionnement", marginX, y - 20, { size: 11, color: cGrey });
  t(params.displayReference, 380, y, { size: 10 });
  t(`Période : ${periodLabelFr(params.period)}`, 380, y - 16, { size: 10 });
  y -= 55;

  t("BÉNÉFICIAIRE", marginX, y, { font: fB, size: 8, color: cGrey });
  y -= 14;
  t(`${na(params.beneficiary.first_name)} ${na(params.beneficiary.last_name)}`, marginX, y, { size: 10 });
  y -= 13;
  t(na(params.beneficiary.billing_name), marginX, y, { size: 9, color: cGrey });
  y -= 13;
  t(na(params.beneficiary.billing_address), marginX, y, { size: 9, color: cGrey });
  y -= 13;
  t(`SIRET : ${na(params.beneficiary.siret)}`, marginX, y, { size: 9, color: cGrey });
  if (params.remunerationStatus === "mandataire" && params.beneficiary.tva_number) {
    y -= 13;
    t(`N° TVA : ${params.beneficiary.tva_number}`, marginX, y, { size: 9, color: cGrey });
  }
  y -= 30;

  t("Date", colDate, y, { font: fB, size: 9 });
  t("Statut", colStatut, y, { font: fB, size: 9 });
  t("Taux", colTaux, y, { font: fB, size: 9 });
  t("Montant dû", colMontant, y, { font: fB, size: 9 });
  y -= 6;
  page.drawLine({ start: { x: marginX, y }, end: { x: 545, y }, thickness: 0.5, color: cGrey });
  y -= 16;

  for (const line of params.lines) {
    if (y < 100) {
      page = doc.addPage([595.28, 841.89]);
      y = 780;
    }
    t(new Date(line.created_at).toLocaleDateString("fr-FR"), colDate, y, { size: 9 });
    t(STATUS_LABELS[line.status] || line.status, colStatut, y, { size: 9 });
    t(`${Number(line.pct_applied).toFixed(2)} %`, colTaux, y, { size: 9 });
    t(eur(Number(line.amount_due)), colMontant, y, { size: 9 });
    y -= 16;
  }

  y -= 14;
  page.drawLine({ start: { x: marginX, y }, end: { x: 545, y }, thickness: 0.5, color: cGrey });
  y -= 20;

  t("Total HT :", colTaux, y, { font: fB, size: 10 });
  t(eur(params.totals.total_amount_due), colMontant, y, { size: 10 });

  if (params.totals.total_tva != null && params.totals.total_ttc != null) {
    y -= 16;
    t("TVA :", colTaux, y, { size: 10 });
    t(eur(params.totals.total_tva), colMontant, y, { size: 10 });
    y -= 16;
    t("Total TTC :", colTaux, y, { font: fB, size: 11, color: cNavy });
    t(eur(params.totals.total_ttc), colMontant, y, { font: fB, size: 11, color: cNavy });
  } else if (params.remunerationStatus === "associe_sep") {
    y -= 16;
    t("(Versement automatique, sans facture)", colTaux, y, { size: 8, color: cGrey });
  }

  if (params.warning === "regime_tva_non_renseigne") {
    y -= 30;
    t("⚠ Régime de TVA non renseigné — merci de compléter votre profil", marginX, y, { size: 8, color: cWarn });
    y -= 11;
    t("(Paramétrage → Profil → Facturation) pour le détail TVA/TTC.", marginX, y, { size: 8, color: cWarn });
  }

  y -= 36;
  t("Ce bordereau est un document de calcul et de contrôle ; il ne constitue en aucun cas une", marginX, y, { size: 7, color: cGrey });
  y -= 10;
  t("convention d'autofacturation au sens de l'article 289 du Code général des impôts.", marginX, y, { size: 7, color: cGrey });
  y -= 18;
  t(`${SAFE.nom} — ${SAFE.adresse} — SIRET ${SAFE.siret}`, marginX, y, { size: 7, color: cGrey });

  return doc.save();
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return new Response("not allowed", { status: 405 });

  const SECRET = Deno.env.get("BORDEREAU_CRON_SECRET");
  if (!SECRET || req.headers.get("x-bordereau-secret") !== SECRET) {
    return new Response("forbidden", { status: 403 });
  }

  let body: any = {};
  try {
    body = await req.json();
  } catch {
    // corps vide accepté (appel cron sans body significatif)
  }

  const period: string =
    typeof body.period === "string" && /^\d{4}-(0[1-9]|1[0-2])$/.test(body.period)
      ? body.period
      : computePreviousPeriod();
  const force = body.force === true;
  const { start, end } = periodBounds(period);

  const SB_URL = Deno.env.get("SUPABASE_URL")!;
  const SB_SR = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const sb = createClient(SB_URL, SB_SR);

  const result = {
    period,
    beneficiaries_processed: [] as string[],
    beneficiaries_skipped_existing: [] as string[],
    warnings: [] as string[],
    errors: [] as string[],
  };

  const { data: ledgerRows, error: ledgerErr } = await sb
    .from("cyberdesk_commission_ledger")
    .select("id, beneficiary_user_id, remuneration_status, pct_applied, amount_due, status, created_at")
    .gte("created_at", start.toISOString())
    .lt("created_at", end.toISOString())
    .order("created_at", { ascending: true });

  if (ledgerErr) {
    return new Response(JSON.stringify({ error: "db_error", details: ledgerErr.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }

  const byBeneficiary = new Map<string, (typeof ledgerRows)[number][]>();
  for (const row of ledgerRows || []) {
    const list = byBeneficiary.get(row.beneficiary_user_id) || [];
    list.push(row);
    byBeneficiary.set(row.beneficiary_user_id, list);
  }

  for (const [beneficiaryId, lines] of byBeneficiary) {
    try {
      const { data: existing } = await sb
        .from("cyberdesk_commission_bordereaux")
        .select("id")
        .eq("beneficiary_user_id", beneficiaryId)
        .eq("period", period)
        .maybeSingle();

      if (existing && !force) {
        result.beneficiaries_skipped_existing.push(beneficiaryId);
        continue;
      }

      const { data: settings } = await sb
        .from("cyberdesk_user_settings")
        .select("first_name, last_name, billing_name, billing_address, siret, tva_number, regime_tva")
        .eq("user_id", beneficiaryId)
        .maybeSingle();

      // Statut de la ligne la plus récente incluse (lines triées par created_at croissant).
      const remunerationStatus = lines[lines.length - 1].remuneration_status as "mandataire" | "associe_sep";
      const totalAmountDue = Math.round(lines.reduce((s, l) => s + Number(l.amount_due), 0) * 100) / 100;

      let totalTva: number | null = null;
      let totalTtc: number | null = null;
      let warning: string | null = null;

      if (remunerationStatus === "mandataire") {
        const regime = settings?.regime_tva;
        if (regime === "reel") {
          totalTva = Math.round(totalAmountDue * 0.2 * 100) / 100;
          totalTtc = Math.round((totalAmountDue + totalTva) * 100) / 100;
        } else if (regime === "franchise_base") {
          totalTva = 0;
          totalTtc = totalAmountDue;
        } else {
          warning = "regime_tva_non_renseigne";
        }
      }

      const displayReference = `CyberPilot-${period}-${beneficiaryId.replace(/-/g, "").slice(0, 8)}`;

      const pdfBytes = await buildBordereauPdf({
        displayReference,
        period,
        beneficiary: settings || {},
        remunerationStatus,
        lines,
        totals: { total_amount_due: totalAmountDue, total_tva: totalTva, total_ttc: totalTtc },
        warning,
      });

      const filePath = `${beneficiaryId}/${period}.pdf`;
      const { error: uploadErr } = await sb.storage
        .from("cyberdesk-commission-bordereaux")
        .upload(filePath, pdfBytes, { contentType: "application/pdf", upsert: true });
      if (uploadErr) throw new Error(`upload: ${uploadErr.message}`);

      const { data: bordereauRow, error: upsertErr } = await sb
        .from("cyberdesk_commission_bordereaux")
        .upsert(
          {
            beneficiary_user_id: beneficiaryId,
            period,
            remuneration_status: remunerationStatus,
            line_count: lines.length,
            total_amount_due: totalAmountDue,
            regime_tva_snapshot: settings?.regime_tva ?? null,
            total_tva: totalTva,
            total_ttc: totalTtc,
            display_reference: displayReference,
            file_path: filePath,
            generation_warning: warning,
          },
          { onConflict: "beneficiary_user_id,period" },
        )
        .select("id")
        .single();
      if (upsertErr) throw new Error(`upsert: ${upsertErr.message}`);

      const { error: linkErr } = await sb
        .from("cyberdesk_commission_ledger")
        .update({ bordereau_id: bordereauRow.id })
        .in(
          "id",
          lines.map((l) => l.id),
        );
      if (linkErr) throw new Error(`link: ${linkErr.message}`);

      result.beneficiaries_processed.push(beneficiaryId);
      if (warning) result.warnings.push(`${beneficiaryId}: ${warning}`);
    } catch (e) {
      result.errors.push(`${beneficiaryId}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  return new Response(JSON.stringify(result), {
    status: result.errors.length ? 207 : 200,
    headers: { "Content-Type": "application/json" },
  });
});
