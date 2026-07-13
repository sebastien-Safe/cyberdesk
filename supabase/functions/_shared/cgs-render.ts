// ==========================================================================
// CyberDesk — Rendu docx des Conditions Générales de Services (cgs-content.ts)
// ==========================================================================
import { Paragraph, Table, PageBreak } from "docx";
import { h1, h2, h3, p, bullet, callout, infoTable, simpleTable } from "./docx-helpers.ts";
import { CGS_BLOCKS, CgsBlock } from "./cgs-content.ts";
import { PRODUCT_DISPLAY_ORDER } from "./product-texts.ts";

export interface TariffRow {
  code: string;
  alert_type: string;
  price_ttc: number;
}

/** Encart "cas" (Article 4) — même traitement visuel qu'un callout, teinte acier. */
function casBlock(title: string, body: string[]): Table {
  return callout(title, body, { color: "7C97C4", fill: "EEF1F8" });
}

function tariffTable(products: TariffRow[]): Table {
  const byCode = new Map(products.map((pr) => [pr.code, pr]));
  const ordered = PRODUCT_DISPLAY_ORDER.map((c) => byCode.get(c)).filter(Boolean) as TariffRow[];
  const rows = ordered.map((pr) => [pr.alert_type, `${Number(pr.price_ttc).toFixed(2).replace(".", ",")} €`]);
  return simpleTable(["Type d'incident", "Tarif TTC indicatif"], rows, [0.7, 0.3]);
}

/** Convertit les blocs CGS extraits du modèle .docx en éléments docx prêts à insérer. */
export function renderCgsBlocks(products: TariffRow[]): (Paragraph | Table)[] {
  const out: (Paragraph | Table)[] = [new Paragraph({ children: [new PageBreak()] })];
  for (const block of CGS_BLOCKS as CgsBlock[]) {
    switch (block.type) {
      case "h1":
        out.push(h1(block.text));
        break;
      case "h2":
        out.push(h2(block.text));
        break;
      case "h3":
        out.push(h3(block.text));
        break;
      case "p":
        out.push(p(block.text));
        break;
      case "p_italic":
        out.push(p(block.text, { italic: true, color: "666666" }));
        break;
      case "bullet":
        out.push(bullet(block.text));
        break;
      case "callout":
        out.push(callout(block.title, block.body));
        break;
      case "cas":
        out.push(casBlock(block.title, block.body));
        break;
      case "table":
        out.push(infoTable(block.rows.map((r) => [r[0], r.slice(1).join(" — ")] as [string, string])));
        break;
      case "tariff_table_dynamic":
        out.push(tariffTable(products));
        break;
    }
  }
  return out;
}
