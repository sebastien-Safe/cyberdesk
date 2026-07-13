// ==========================================================================
// CyberDesk — Helpers de construction docx (module partagé Edge Functions)
// Palette S@FE : navy #030D26, gold #C9A24B, steel #7C97C4
// Utilisé par generate-cybervictim-report / generate-cybervictim-quote.
//
// Page A4, marges 2 cm, tableaux en layout FIXED avec columnWidths explicites
// (en DXA) : sans `layout: FIXED`, Word ignore les largeurs déclarées et
// auto-ajuste les colonnes au contenu, ce qui cassait la mise en page des
// tableaux (colonnes écrasées / texte non aligné).
// ==========================================================================
import {
  Paragraph,
  TextRun,
  HeadingLevel,
  Table,
  TableRow,
  TableCell,
  WidthType,
  TableLayoutType,
  BorderStyle,
  AlignmentType,
  VerticalAlign,
} from "docx";

export const NAVY  = "030D26";
export const GOLD  = "C9A24B";
export const STEEL = "7C97C4";
export const LIGHT_GOLD = "FBF3E3";
export const LIGHT_STEEL = "EEF1F8";
export const LIGHT_GREY = "F2F2F2";

// A4 = 11906 x 16838 DXA (twips) ; marges 2 cm = 1134 DXA
export const PAGE_WIDTH_DXA  = 11906;
export const PAGE_HEIGHT_DXA = 16838;
export const PAGE_MARGIN_DXA = 1134;
export const CONTENT_WIDTH_DXA = PAGE_WIDTH_DXA - 2 * PAGE_MARGIN_DXA; // 9638

export const PAGE_PROPERTIES = {
  page: {
    size: { width: PAGE_WIDTH_DXA, height: PAGE_HEIGHT_DXA },
    margin: { top: PAGE_MARGIN_DXA, bottom: PAGE_MARGIN_DXA, left: PAGE_MARGIN_DXA, right: PAGE_MARGIN_DXA },
  },
};

const cellMargins = { top: 90, bottom: 90, left: 110, right: 110 };
const gridBorder  = { style: BorderStyle.SINGLE, size: 4, color: "D0D0D0" };
const headerBorder = { style: BorderStyle.SINGLE, size: 4, color: NAVY };
const tableGrid = { top: gridBorder, bottom: gridBorder, left: gridBorder, right: gridBorder, insideHorizontal: gridBorder, insideVertical: gridBorder };

export function p(text: string, opts: { italic?: boolean; bold?: boolean; color?: string; size?: number } = {}): Paragraph {
  return new Paragraph({
    spacing: { after: 120 },
    children: [
      new TextRun({
        text,
        italics: opts.italic || false,
        bold: opts.bold || false,
        color: opts.color || "222222",
        size: opts.size || 20, // demi-points (10pt)
      }),
    ],
  });
}

export function h1(text: string): Paragraph {
  return new Paragraph({
    heading: HeadingLevel.HEADING_1,
    spacing: { before: 280, after: 160 },
    border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: GOLD, space: 4 } },
    children: [new TextRun({ text, bold: true, color: NAVY, size: 28 })],
  });
}

export function h2(text: string): Paragraph {
  return new Paragraph({
    heading: HeadingLevel.HEADING_2,
    spacing: { before: 260, after: 110 },
    children: [new TextRun({ text, bold: true, color: NAVY, size: 23 })],
  });
}

export function h3(text: string): Paragraph {
  return new Paragraph({
    spacing: { before: 160, after: 80 },
    children: [new TextRun({ text, bold: true, color: STEEL, size: 20 })],
  });
}

export function bullet(text: string, opts: { color?: string } = {}): Paragraph {
  return new Paragraph({
    bullet: { level: 0 },
    spacing: { after: 60 },
    children: [new TextRun({ text, color: opts.color || "222222", size: 20 })],
  });
}

/** Zone à compléter manuellement (ouvrable/éditable dans Word après génération). */
export function placeholder(text: string): Paragraph {
  return new Paragraph({
    spacing: { after: 120 },
    children: [new TextRun({ text: `[${text}]`, italics: true, color: "888888", size: 20 })],
  });
}

/** Encart mis en valeur (fond clair, bordure gauche) — avertissements, notes. */
export function callout(title: string, body: string[], opts: { color?: string; fill?: string } = {}): Table {
  const color = opts.color || GOLD;
  const fill = opts.fill || LIGHT_GOLD;
  return new Table({
    width: { size: CONTENT_WIDTH_DXA, type: WidthType.DXA },
    layout: TableLayoutType.FIXED,
    columnWidths: [CONTENT_WIDTH_DXA],
    rows: [
      new TableRow({
        children: [
          new TableCell({
            width: { size: CONTENT_WIDTH_DXA, type: WidthType.DXA },
            shading: { fill },
            margins: { top: 140, bottom: 140, left: 180, right: 180 },
            borders: {
              top: gridBorder, bottom: gridBorder, right: gridBorder,
              left: { style: BorderStyle.SINGLE, size: 24, color },
            },
            children: [
              new Paragraph({ spacing: { after: body.length ? 80 : 0 }, children: [new TextRun({ text: title, bold: true, color: NAVY, size: 19 })] }),
              ...body.map((t) => new Paragraph({ spacing: { after: 60 }, children: [new TextRun({ text: t, size: 19, color: "333333" })] })),
            ],
          }),
        ],
      }),
    ],
  });
}

/** Tableau libellé/valeur à deux colonnes (fiche d'identité, description incident…). */
export function infoTable(rows: Array<[string, string]>): Table {
  const labelW = Math.round(CONTENT_WIDTH_DXA * 0.32);
  const valueW = CONTENT_WIDTH_DXA - labelW;
  return new Table({
    width: { size: CONTENT_WIDTH_DXA, type: WidthType.DXA },
    layout: TableLayoutType.FIXED,
    columnWidths: [labelW, valueW],
    borders: tableGrid,
    rows: rows.map(([label, value]) =>
      new TableRow({
        children: [
          new TableCell({
            width: { size: labelW, type: WidthType.DXA },
            shading: { fill: LIGHT_GREY },
            margins: cellMargins,
            verticalAlign: VerticalAlign.CENTER,
            children: [new Paragraph({ children: [new TextRun({ text: label, bold: true, size: 19, color: NAVY })] })],
          }),
          new TableCell({
            width: { size: valueW, type: WidthType.DXA },
            margins: cellMargins,
            verticalAlign: VerticalAlign.CENTER,
            children: [new Paragraph({ children: [new TextRun({ text: value || "—", size: 19 })] })],
          }),
        ],
      })
    ),
  });
}

export interface ChronoEntry {
  when: string;
  action: string;
  detail: string;
}

/** Tableau chronologique (Date/heure — Action — Détail/Résultat), avec en-tête. */
export function chronoTable(entries: ChronoEntry[]): Table {
  const dateW = Math.round(CONTENT_WIDTH_DXA * 0.16);
  const actionW = Math.round(CONTENT_WIDTH_DXA * 0.28);
  const detailW = CONTENT_WIDTH_DXA - dateW - actionW;
  const widths = [dateW, actionW, detailW];

  const headerRow = new TableRow({
    tableHeader: true,
    children: ["Date / heure", "Action", "Détail / résultat"].map(
      (t, i) =>
        new TableCell({
          width: { size: widths[i], type: WidthType.DXA },
          shading: { fill: NAVY },
          margins: cellMargins,
          verticalAlign: VerticalAlign.CENTER,
          children: [new Paragraph({ children: [new TextRun({ text: t, bold: true, color: "FFFFFF", size: 18 })] })],
        })
    ),
  });

  const dataRows = (entries.length ? entries : [{ when: "—", action: "—", detail: "—" }]).map(
    (e, rowIdx) =>
      new TableRow({
        children: [e.when, e.action, e.detail].map(
          (t, i) =>
            new TableCell({
              width: { size: widths[i], type: WidthType.DXA },
              shading: { fill: rowIdx % 2 === 1 ? LIGHT_STEEL : "FFFFFF" },
              margins: cellMargins,
              verticalAlign: VerticalAlign.CENTER,
              children: [new Paragraph({ children: [new TextRun({ text: t || "—", size: 18 })] })],
            })
        ),
      })
  );

  return new Table({
    width: { size: CONTENT_WIDTH_DXA, type: WidthType.DXA },
    layout: TableLayoutType.FIXED,
    columnWidths: widths,
    borders: tableGrid,
    rows: [headerRow, ...dataRows],
  });
}

/** Tableau générique à en-tête (libellés de colonnes + lignes), largeurs proportionnelles. */
export function simpleTable(headers: string[], rows: string[][], widthRatios?: number[]): Table {
  const ratios = widthRatios && widthRatios.length === headers.length
    ? widthRatios
    : headers.map(() => 1 / headers.length);
  const widths = ratios.map((r) => Math.round(CONTENT_WIDTH_DXA * r));
  widths[widths.length - 1] = CONTENT_WIDTH_DXA - widths.slice(0, -1).reduce((a, b) => a + b, 0);

  const headerRow = new TableRow({
    tableHeader: true,
    children: headers.map(
      (t, i) =>
        new TableCell({
          width: { size: widths[i], type: WidthType.DXA },
          shading: { fill: NAVY },
          margins: cellMargins,
          verticalAlign: VerticalAlign.CENTER,
          children: [new Paragraph({ children: [new TextRun({ text: t, bold: true, color: "FFFFFF", size: 18 })] })],
        })
    ),
  });

  const dataRows = rows.map(
    (r, rowIdx) =>
      new TableRow({
        children: r.map(
          (t, i) =>
            new TableCell({
              width: { size: widths[i], type: WidthType.DXA },
              shading: { fill: rowIdx % 2 === 1 ? LIGHT_STEEL : "FFFFFF" },
              margins: cellMargins,
              verticalAlign: VerticalAlign.CENTER,
              children: [new Paragraph({ children: [new TextRun({ text: t || "—", size: 18 })] })],
            })
        ),
      })
  );

  return new Table({
    width: { size: CONTENT_WIDTH_DXA, type: WidthType.DXA },
    layout: TableLayoutType.FIXED,
    columnWidths: widths,
    borders: tableGrid,
    rows: [headerRow, ...dataRows],
  });
}

/** Bloc tarif HT / TVA / TTC — pas de détail ligne à ligne, juste le total. */
export function pricingTable(ht: number, ttc: number, label = "Intervention S@FE"): Table {
  const tva = ttc - ht;
  const money = (n: number) => n.toFixed(2).replace(".", ",") + " €";
  const labelW = Math.round(CONTENT_WIDTH_DXA * 0.7);
  const valueW = CONTENT_WIDTH_DXA - labelW;
  const rows: Array<[string, string, boolean]> = [
    [label + " (HT)", money(ht), false],
    ["TVA 20 %", money(tva), false],
    ["TOTAL TTC", money(ttc), true],
  ];
  return new Table({
    width: { size: CONTENT_WIDTH_DXA, type: WidthType.DXA },
    layout: TableLayoutType.FIXED,
    columnWidths: [labelW, valueW],
    borders: tableGrid,
    rows: rows.map(([lbl, val, isTotal]) =>
      new TableRow({
        children: [
          new TableCell({
            width: { size: labelW, type: WidthType.DXA },
            shading: { fill: isTotal ? NAVY : "FFFFFF" },
            margins: cellMargins,
            verticalAlign: VerticalAlign.CENTER,
            children: [new Paragraph({ children: [new TextRun({ text: lbl, bold: isTotal, color: isTotal ? "FFFFFF" : "222222", size: isTotal ? 21 : 19 })] })],
          }),
          new TableCell({
            width: { size: valueW, type: WidthType.DXA },
            shading: { fill: isTotal ? NAVY : "FFFFFF" },
            margins: cellMargins,
            verticalAlign: VerticalAlign.CENTER,
            children: [new Paragraph({ alignment: AlignmentType.RIGHT, children: [new TextRun({ text: val, bold: isTotal, color: isTotal ? "FFFFFF" : "222222", size: isTotal ? 21 : 19 })] })],
          }),
        ],
      })
    ),
  });
}

export function centered(text: string, opts: { bold?: boolean; color?: string; size?: number } = {}): Paragraph {
  return new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { after: 120 },
    children: [new TextRun({ text, bold: opts.bold ?? false, color: opts.color || NAVY, size: opts.size || 20 })],
  });
}
