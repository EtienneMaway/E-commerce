/**
 * Thermal-style 80mm receipt — port of `apps/mobile/lib/receipt.ts`.
 *
 * Used for Bluetooth thermal printing (ESC/POS path) AND for the browser
 * fallback when no thermal printer is paired (renders the same 80mm HTML in
 * a new window and triggers the system print dialog). Keeps the printed
 * output visually identical to the mobile app.
 */

export interface ReceiptItem {
  readonly productName: string;
  readonly qty: number;
  readonly unitPriceFc: number;
  readonly totalFc: number;
  readonly cartons?: number;
  readonly extraPieces?: number;
  readonly piecesPerCarton?: number | null;
  readonly cartonPriceFc?: number;
}

export interface ReceiptData {
  readonly items: ReceiptItem[];
  readonly grandTotalFc: number;
  readonly markupPct: number;
  readonly date: string;
  readonly businessName?: string;
  readonly businessHandle?: string;
  readonly sellerName?: string;
  readonly sellerUsername?: string;
  readonly receiptId?: string;
  readonly clientName?: string;
  readonly clientPhone?: string;
}

const BRAND = 'KMB-Talk';

export const RECEIPT_FOOTER = {
  address: 'Durba Duembe, RondPoint Zima Moto',
  phone: '+243 836 743 579',
  thanks: 'Merci, que Dieu vous bénisse',
} as const;

export function formatPackagingLine(item: ReceiptItem): string {
  const ppc = item.piecesPerCarton ?? 0;
  const cartons = item.cartons ?? 0;
  const extra = item.extraPieces ?? 0;
  if (!ppc || cartons <= 0) return '';
  const unit = ppc === 12
    ? (cartons === 1 ? 'douzaine' : 'douzaines')
    : (cartons === 1 ? 'carton' : 'cartons');
  let line = `${cartons} ${unit} × ${ppc} pcs`;
  if (extra > 0) line += ` + ${extra} pcs`;
  return line;
}

export function formatCartonInfoLine(item: ReceiptItem): string {
  const ppc = item.piecesPerCarton ?? 0;
  if (!ppc) return '';
  const cartonPrice = item.cartonPriceFc ?? item.unitPriceFc * ppc;
  if (cartonPrice <= 0) return '';
  return `${formatFc(cartonPrice)} / ctn (${ppc} pcs)`;
}

function formatFc(value: number): string {
  return new Intl.NumberFormat('fr-CD').format(Math.round(value)) + ' FC';
}

export function generateReceiptId(): string {
  return Date.now().toString(36).slice(-6).toUpperCase();
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * 80mm thermal-shaped HTML. Mirrors the mobile app's `buildHtml` from
 * `lib/receipt.ts` so the system-print fallback produces a receipt that
 * matches what a thermal printer would emit.
 */
export function buildThermalReceiptHtml(data: ReceiptData): string {
  const itemRows = data.items
    .map((item) => {
      const total = formatFc(item.totalFc);
      const unit = formatFc(item.unitPriceFc);
      const packaging = formatPackagingLine(item);
      const cartonInfo = formatCartonInfoLine(item);
      return `
        <div class="row item">
          <div class="line">
            <span class="name">${escapeHtml(item.productName)}</span>
            <span class="total">${total}</span>
          </div>
          ${packaging ? `<div class="line unit"><span>&nbsp;&nbsp;${escapeHtml(packaging)}</span></div>` : ''}
          <div class="line unit">
            <span>&nbsp;&nbsp;${item.qty} × ${unit}</span>
          </div>
          ${cartonInfo ? `<div class="line unit"><span>&nbsp;&nbsp;${escapeHtml(cartonInfo)}</span></div>` : ''}
        </div>`;
    })
    .join('');

  const businessLine = data.businessName
    ? escapeHtml(data.businessName)
    : data.businessHandle
      ? `@${escapeHtml(data.businessHandle)}`
      : '';
  const businessHandleLine =
    data.businessName && data.businessHandle ? `@${escapeHtml(data.businessHandle)}` : '';

  const sellerLabel = data.sellerName
    ? escapeHtml(data.sellerName)
    : data.sellerUsername
      ? `@${escapeHtml(data.sellerUsername)}`
      : '';
  const sellerHandle =
    data.sellerName && data.sellerUsername ? `@${escapeHtml(data.sellerUsername)}` : '';

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <style>
    @page { size: 80mm auto; margin: 0; }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    html, body { width: 80mm; }
    body {
      font-family: 'Courier New', 'Menlo', monospace;
      font-size: 12px;
      line-height: 1.45;
      padding: 6mm 4mm 8mm;
      color: #000;
      background: #fff;
    }
    .brand { text-align: center; font-size: 16px; font-weight: 800; letter-spacing: 2px; margin-bottom: 1mm; }
    .brand-sub { text-align: center; font-size: 9px; letter-spacing: 1px; text-transform: uppercase; color: #555; margin-bottom: 3mm; }
    .divider { border: none; border-top: 1px dashed #000; margin: 2.5mm 0; }
    .divider-solid { border: none; border-top: 2px solid #000; margin: 2mm 0; }
    .business { text-align: center; font-weight: 700; font-size: 13px; margin-bottom: 0.5mm; }
    .business-handle { text-align: center; font-size: 10px; color: #555; margin-bottom: 2mm; }
    .meta { font-size: 10.5px; }
    .meta-row { display: flex; justify-content: space-between; }
    .meta-row .label { color: #555; }
    .row.item { margin: 1.2mm 0; }
    .line { display: flex; justify-content: space-between; gap: 4mm; }
    .line .name { flex: 1; text-transform: capitalize; word-break: break-word; }
    .line .total { white-space: nowrap; font-weight: 700; }
    .line.unit { font-size: 10.5px; color: #444; }
    .total-row { display: flex; justify-content: space-between; align-items: baseline; font-size: 15px; font-weight: 800; margin-top: 1mm; }
    .total-row .label { letter-spacing: 2px; }
    .footer-meta { font-size: 10.5px; margin-top: 3mm; }
    .footer { text-align: center; font-size: 11px; margin-top: 3mm; }
    .thanks { font-weight: 700; letter-spacing: 2px; margin-top: 0.5mm; }
  </style>
</head>
<body>
  <div class="brand">${escapeHtml(BRAND)}</div>
  <div class="brand-sub">sales receipt</div>
  <hr class="divider-solid" />
  ${businessLine ? `<div class="business">${businessLine}</div>` : ''}
  ${businessHandleLine ? `<div class="business-handle">${businessHandleLine}</div>` : ''}
  <div class="meta">
    ${data.receiptId ? `<div class="meta-row"><span class="label">Receipt #</span><span>${escapeHtml(data.receiptId)}</span></div>` : ''}
    <div class="meta-row"><span class="label">Date</span><span>${escapeHtml(data.date)}</span></div>
    ${data.clientName ? `<div class="meta-row"><span class="label">Client</span><span>${escapeHtml(data.clientName)}</span></div>` : ''}
    ${data.clientPhone ? `<div class="meta-row"><span class="label">Tél</span><span>${escapeHtml(data.clientPhone)}</span></div>` : ''}
  </div>
  <hr class="divider" />
  <div class="items">${itemRows}</div>
  <hr class="divider" />
  <div class="total-row">
    <span class="label">TOTAL</span>
    <span>${formatFc(data.grandTotalFc)}</span>
  </div>
  <hr class="divider-solid" />
  ${sellerLabel ? `<div class="footer-meta">
    <div class="meta-row"><span class="label">Sold by</span><span>${sellerLabel}</span></div>
    ${sellerHandle ? `<div class="meta-row"><span></span><span>${sellerHandle}</span></div>` : ''}
  </div>` : ''}
  <div class="footer">
    ${data.markupPct > 0 ? `<div>Markup ${data.markupPct}%</div>` : ''}
    <div>${escapeHtml(RECEIPT_FOOTER.address)}</div>
    <div>${escapeHtml(RECEIPT_FOOTER.phone)}</div>
    <div class="thanks">${escapeHtml(RECEIPT_FOOTER.thanks)}</div>
  </div>
</body>
</html>`;
}
