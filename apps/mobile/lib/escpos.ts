/**
 * Minimal ESC/POS encoder for 58 mm Bluetooth thermal receipt printers.
 *
 * Most cheap Bluetooth thermal printers sold for POS use (Goojprt, Xprinter,
 * Munbyn, NETUM, etc.) speak ESC/POS over SPP at 32 columns / 58 mm. We emit
 * a base64 string of raw command bytes that the platform layer pipes into the
 * paired device's RFCOMM stream.
 */

import { RECEIPT_FOOTER, formatPackagingLine, type ReceiptData, type ReceiptItem } from './receipt';

const ENC = {
  INIT: [0x1b, 0x40],
  ALIGN_LEFT: [0x1b, 0x61, 0x00],
  ALIGN_CENTER: [0x1b, 0x61, 0x01],
  ALIGN_RIGHT: [0x1b, 0x61, 0x02],
  BOLD_ON: [0x1b, 0x45, 0x01],
  BOLD_OFF: [0x1b, 0x45, 0x00],
  DOUBLE_HEIGHT_ON: [0x1b, 0x21, 0x10],
  NORMAL: [0x1b, 0x21, 0x00],
  CUT: [0x1d, 0x56, 0x42, 0x00],
  LF: [0x0a],
  FEED_LINES: (n: number) => [0x1b, 0x64, n],
} as const;

const COLS = 32;

function ascii(s: string): number[] {
  // Strip non-ASCII so the printer doesn't choke on an unsupported code page.
  // Replace common Unicode characters with safe ASCII equivalents.
  const cleaned = s
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '') // strip combining accents
    .replace(/[—–]/g, '-') // em/en dash → hyphen
    .replace(/[‘’]/g, "'") // smart quotes
    .replace(/[“”]/g, '"')
    .replace(/[^\x20-\x7E]/g, '');   // drop anything still non-printable
  const out: number[] = [];
  for (let i = 0; i < cleaned.length; i++) out.push(cleaned.charCodeAt(i) & 0xff);
  return out;
}

function padRight(s: string, width: number): string {
  if (s.length >= width) return s.slice(0, width);
  return s + ' '.repeat(width - s.length);
}

function padLeft(s: string, width: number): string {
  if (s.length >= width) return s.slice(0, width);
  return ' '.repeat(width - s.length) + s;
}

function centerLine(s: string): string {
  if (s.length >= COLS) return s.slice(0, COLS);
  const pad = Math.floor((COLS - s.length) / 2);
  return ' '.repeat(pad) + s;
}

function divider(char: string): number[] {
  return [...ascii(char.repeat(COLS)), ...ENC.LF];
}

function fc(value: number): string {
  // Whole FC, fr-CD thousand separators (thin space), suffix " FC".
  return new Intl.NumberFormat('fr-CD').format(Math.round(value)) + ' FC';
}

function renderItem(item: ReceiptItem): number[] {
  // Line 1: product name (left) + total (right)
  // Line 2 (optional): packaging breakdown, e.g. "3 cartons × 24 + 2 pcs"
  // Line 3: indented per-piece "@ unit price"
  const total = fc(item.totalFc);
  const nameAndQty = `${item.productName} x${item.qty}`;
  const maxNameWidth = COLS - total.length - 1;
  const nameLine =
    nameAndQty.length <= maxNameWidth
      ? padRight(nameAndQty, maxNameWidth) + ' ' + total
      : nameAndQty.slice(0, maxNameWidth) + ' ' + total;

  const out: number[] = [];
  out.push(...ascii(nameLine), ...ENC.LF);

  const packaging = formatPackagingLine(item);
  if (packaging) out.push(...ascii('  ' + packaging), ...ENC.LF);

  out.push(...ascii(`  @ ${fc(item.unitPriceFc)}`), ...ENC.LF);
  return out;
}

/**
 * Encode a receipt into ESC/POS bytes for a 58 mm thermal printer.
 *
 * Output is a Uint8Array — callers convert to base64 / string as needed
 * for the bluetooth-classic write call.
 */
export function encodeReceipt(data: ReceiptData): Uint8Array {
  const bytes: number[] = [];
  const BRAND = 'KMB-Talk';

  bytes.push(...ENC.INIT);

  // ── Brand header (double-height, bold) ──────────────────────────────────
  bytes.push(...ENC.ALIGN_CENTER);
  bytes.push(...ENC.BOLD_ON);
  bytes.push(...ENC.DOUBLE_HEIGHT_ON);
  bytes.push(...ascii(BRAND));
  bytes.push(...ENC.LF);
  bytes.push(...ENC.NORMAL);
  bytes.push(...ENC.BOLD_OFF);

  bytes.push(...ascii('sales receipt'));
  bytes.push(...ENC.LF);

  bytes.push(...divider('='));

  // ── Business identity ───────────────────────────────────────────────────
  const businessLine = data.businessName ?? (data.businessHandle ? `@${data.businessHandle}` : '');
  if (businessLine) {
    bytes.push(...ENC.BOLD_ON);
    bytes.push(...ascii(businessLine));
    bytes.push(...ENC.LF);
    bytes.push(...ENC.BOLD_OFF);
  }
  if (data.businessName && data.businessHandle) {
    bytes.push(...ascii(`@${data.businessHandle}`));
    bytes.push(...ENC.LF);
  }

  bytes.push(...ENC.LF);

  // ── Meta (receipt # + date + optional client) ──────────────────────────
  bytes.push(...ENC.ALIGN_LEFT);
  if (data.receiptId) {
    bytes.push(...ascii(metaLine('Receipt #', data.receiptId)));
    bytes.push(...ENC.LF);
  }
  bytes.push(...ascii(metaLine('Date', data.date)));
  bytes.push(...ENC.LF);
  if (data.clientName) {
    bytes.push(...ascii(metaLine('Client', data.clientName)));
    bytes.push(...ENC.LF);
  }
  if (data.clientPhone) {
    bytes.push(...ascii(metaLine('Tel', data.clientPhone)));
    bytes.push(...ENC.LF);
  }

  bytes.push(...divider('-'));

  // ── Items ───────────────────────────────────────────────────────────────
  for (const item of data.items) {
    bytes.push(...renderItem(item));
  }

  bytes.push(...divider('-'));

  // ── Total (bold + double-height) ────────────────────────────────────────
  bytes.push(...ENC.BOLD_ON);
  bytes.push(...ENC.DOUBLE_HEIGHT_ON);
  const totalStr = fc(data.grandTotalFc);
  const totalLine = padRight('TOTAL', COLS - totalStr.length) + totalStr;
  bytes.push(...ascii(totalLine));
  bytes.push(...ENC.LF);
  bytes.push(...ENC.NORMAL);
  bytes.push(...ENC.BOLD_OFF);

  bytes.push(...divider('='));

  // ── Seller (who recorded the sale) ──────────────────────────────────────
  if (data.sellerName || data.sellerUsername) {
    const sellerLabel = data.sellerName ?? `@${data.sellerUsername ?? ''}`;
    bytes.push(...ascii(metaLine('Sold by', sellerLabel)));
    bytes.push(...ENC.LF);
    if (data.sellerName && data.sellerUsername) {
      bytes.push(...ascii(metaLine('', `@${data.sellerUsername}`)));
      bytes.push(...ENC.LF);
    }
  }

  // ── Footer ──────────────────────────────────────────────────────────────
  bytes.push(...ENC.LF);
  bytes.push(...ENC.ALIGN_CENTER);
  if (data.markupPct > 0) {
    bytes.push(...ascii(`Markup ${data.markupPct}%`));
    bytes.push(...ENC.LF);
  }
  bytes.push(...ascii(RECEIPT_FOOTER.address));
  bytes.push(...ENC.LF);
  bytes.push(...ascii(RECEIPT_FOOTER.phone));
  bytes.push(...ENC.LF);
  bytes.push(...ENC.LF);
  bytes.push(...ENC.BOLD_ON);
  bytes.push(...ascii(RECEIPT_FOOTER.thanks));
  bytes.push(...ENC.LF);
  bytes.push(...ENC.BOLD_OFF);

  // Feed + cut
  bytes.push(...ENC.FEED_LINES(3));
  bytes.push(...ENC.CUT);

  return new Uint8Array(bytes);
}

/** Format a "Label    value" line right-aligned to the 32-col paper width. */
function metaLine(label: string, value: string): string {
  const left = label;
  const right = value;
  const space = COLS - left.length - right.length;
  if (space < 1) return (left + ' ' + right).slice(0, COLS);
  return left + ' '.repeat(space) + right;
}

/**
 * A short header-only test stream — used by the "test print" button to verify
 * the device is connected and the paper feed works without wasting much roll.
 */
export function encodeTestPrint(deviceName?: string): Uint8Array {
  const bytes: number[] = [];
  bytes.push(...ENC.INIT);
  bytes.push(...ENC.ALIGN_CENTER);
  bytes.push(...ENC.BOLD_ON);
  bytes.push(...ENC.DOUBLE_HEIGHT_ON);
  bytes.push(...ascii('TEST PRINT'));
  bytes.push(...ENC.LF);
  bytes.push(...ENC.NORMAL);
  bytes.push(...ENC.BOLD_OFF);
  if (deviceName) {
    bytes.push(...ascii(deviceName));
    bytes.push(...ENC.LF);
  }
  bytes.push(...ascii(new Date().toLocaleString('en-US')));
  bytes.push(...ENC.LF);
  bytes.push(...divider('-'));
  bytes.push(...ENC.ALIGN_LEFT);
  bytes.push(...ascii('Connection OK. Receipts will print like this.'));
  bytes.push(...ENC.LF);
  bytes.push(...ENC.FEED_LINES(3));
  bytes.push(...ENC.CUT);
  return new Uint8Array(bytes);
}

/**
 * Encode the byte stream as a base64 string, which is what
 * `react-native-bluetooth-classic`'s `writeToDevice` accepts.
 */
export function toBase64(bytes: Uint8Array): string {
  // Atob/btoa exist in React Native global scope.
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  // eslint-disable-next-line no-undef
  return global.btoa ? global.btoa(binary) : Buffer.from(bytes).toString('base64');
}
