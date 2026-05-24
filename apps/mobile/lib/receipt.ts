import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { usePrinterStore } from '../store/printer.store';
import { printReceiptToBluetooth } from './bluetooth-printer';

export interface ReceiptItem {
  readonly productName: string;
  readonly qty: number;
  readonly unitPriceFc: number;   // already converted to FC
  readonly totalFc: number;

  /**
   * Packaging breakdown — when present, prints a "{cartons} {unit} × {ppc} +
   * {extra} pcs" line above the unit price so the customer can verify what
   * they bought. `cartons` is the user-typed pack count; the unit label is
   * derived from `piecesPerCarton` (12 → dozen, else carton).
   * Omit all three for items sold as loose pieces.
   */
  readonly cartons?: number;
  readonly extraPieces?: number;
  readonly piecesPerCarton?: number | null;
}

export interface ReceiptData {
  readonly items: ReceiptItem[];
  readonly grandTotalFc: number;
  /** 0 means per-item pricing — the receipt footer omits the markup line. */
  readonly markupPct: number;
  /** Pretty date/time, already locale-formatted (e.g. "24/05/2026 14:32"). */
  readonly date: string;

  /** Business name shown at the top of the receipt. Falls back to the brand. */
  readonly businessName?: string;
  /** @handle of the business — useful when the merchant doesn't have a brand. */
  readonly businessHandle?: string;

  /** Display name of the person who recorded the sale. */
  readonly sellerName?: string;
  /** @handle of the person who recorded the sale. */
  readonly sellerUsername?: string;

  /** Short human-readable transaction ID. */
  readonly receiptId?: string;

  /** Optional buyer details — printed when present. */
  readonly clientName?: string;
  readonly clientPhone?: string;
}

const BRAND = 'KMB-Talk';

/**
 * Constants printed in the footer of every receipt.
 */
export const RECEIPT_FOOTER = {
  address: 'Durba Duembe, RondPoint Zima Moto',
  phone: '+243 836 743 579',
  thanks: 'Merci, que Dieu vous bénisse',
} as const;

/**
 * Per-item packaging line: e.g. "3 cartons × 24 + 2 pcs" or "5 douzaines × 12".
 * Returns empty string when there's no packaging info worth showing.
 */
export function formatPackagingLine(item: ReceiptItem): string {
  const ppc = item.piecesPerCarton ?? 0;
  const cartons = item.cartons ?? 0;
  const extra = item.extraPieces ?? 0;
  if (!ppc || cartons <= 0) {
    // Loose-piece sale — the "qty × unit" line already conveys this; nothing extra.
    return '';
  }
  const unit = ppc === 12 ? (cartons === 1 ? 'douzaine' : 'douzaines') : (cartons === 1 ? 'carton' : 'cartons');
  let line = `${cartons} ${unit} × ${ppc}`;
  if (extra > 0) line += ` + ${extra} pcs`;
  return line;
}

function formatFc(value: number): string {
  return new Intl.NumberFormat('fr-CD').format(Math.round(value)) + ' FC';
}

/**
 * Generates a short, human-readable receipt ID from the current timestamp.
 * Base-36 of `Date.now()` truncated to 6 chars — visually compact and
 * monotonically increasing inside a session. Not for unique identity; the
 * server is the source of truth for that.
 */
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
 * Build a thermal-receipt-shaped HTML page. Width is fixed at 80mm so when
 * sent through Android's system print or share-to-PDF, the output is a
 * narrow, grow-to-content receipt rather than a half-empty A4. Monospaced
 * font keeps the columns aligned the way a real receipt would print.
 */
function buildHtml(data: ReceiptData): string {
  const itemRows = data.items
    .map((item) => {
      const total = formatFc(item.totalFc);
      const unit = formatFc(item.unitPriceFc);
      const packaging = formatPackagingLine(item);
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
    .brand {
      text-align: center;
      font-size: 16px;
      font-weight: 800;
      letter-spacing: 2px;
      margin-bottom: 1mm;
    }
    .brand-sub {
      text-align: center;
      font-size: 9px;
      letter-spacing: 1px;
      text-transform: uppercase;
      color: #555;
      margin-bottom: 3mm;
    }
    .divider {
      border: none;
      border-top: 1px dashed #000;
      margin: 2.5mm 0;
    }
    .divider-solid {
      border: none;
      border-top: 2px solid #000;
      margin: 2mm 0;
    }
    .business {
      text-align: center;
      font-weight: 700;
      font-size: 13px;
      margin-bottom: 0.5mm;
    }
    .business-handle {
      text-align: center;
      font-size: 10px;
      color: #555;
      margin-bottom: 2mm;
    }
    .meta {
      font-size: 10.5px;
    }
    .meta-row {
      display: flex;
      justify-content: space-between;
    }
    .meta-row .label { color: #555; }
    .items { margin: 0; }
    .row.item {
      margin: 1.2mm 0;
    }
    .line {
      display: flex;
      justify-content: space-between;
      gap: 4mm;
    }
    .line .name {
      flex: 1;
      text-transform: capitalize;
      word-break: break-word;
    }
    .line .total {
      white-space: nowrap;
      font-weight: 700;
    }
    .line.unit {
      font-size: 10.5px;
      color: #444;
    }
    .total-row {
      display: flex;
      justify-content: space-between;
      align-items: baseline;
      font-size: 15px;
      font-weight: 800;
      margin-top: 1mm;
    }
    .total-row .label {
      letter-spacing: 2px;
    }
    .footer-meta {
      font-size: 10.5px;
      margin-top: 3mm;
    }
    .footer {
      text-align: center;
      font-size: 11px;
      margin-top: 3mm;
    }
    .thanks {
      font-weight: 700;
      letter-spacing: 2px;
      margin-top: 0.5mm;
    }
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

/**
 * Print a receipt. Routing:
 *   1. If a Bluetooth thermal printer is paired (printer.store), send raw
 *      ESC/POS bytes directly — this is the POS / quick-receipt path.
 *   2. Otherwise fall back to the Android system print dialog via expo-print,
 *      which is what every device gets out of the box.
 */
export async function printReceipt(data: ReceiptData): Promise<void> {
  const paired = usePrinterStore.getState().printer;
  if (paired) {
    await printReceiptToBluetooth(paired, data);
    return;
  }
  await Print.printAsync({ html: buildHtml(data) });
}

/**
 * Lower-level escape hatch: print via the system print dialog regardless of
 * whether a Bluetooth printer is paired. Used as the fallback path when the
 * paired printer is unreachable.
 */
export async function printReceiptViaSystem(data: ReceiptData): Promise<void> {
  await Print.printAsync({ html: buildHtml(data) });
}

export async function shareReceiptAsPdf(data: ReceiptData): Promise<void> {
  const { uri } = await Print.printToFileAsync({ html: buildHtml(data) });
  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(uri, {
      mimeType: 'application/pdf',
      dialogTitle: 'Share Receipt',
      UTI: 'com.adobe.pdf',
    });
  }
}
