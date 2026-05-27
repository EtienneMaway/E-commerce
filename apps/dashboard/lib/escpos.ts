/**
 * Minimal ESC/POS encoder for 58 mm Bluetooth thermal receipt printers.
 *
 * Port of `apps/mobile/lib/escpos.ts` so the printed output is byte-for-byte
 * identical to what the mobile app produces. Kept as its own file rather
 * than shared via a package because the encoder has no dependencies and
 * duplicating ~250 lines is cheaper than introducing a workspace package.
 *
 * Most cheap Bluetooth thermal printers (Goojprt, Xprinter, Munbyn, NETUM)
 * speak ESC/POS over a transparent-serial GATT characteristic. We emit a
 * Uint8Array that the Web Bluetooth layer chunks and writes.
 */

import {
  RECEIPT_FOOTER,
  formatPackagingLine,
  formatCartonInfoLine,
  type ReceiptData,
  type ReceiptItem,
} from './thermal-receipt';

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
    .replace(/[^\x20-\x7E]/g, ''); // drop anything still non-printable
  const out: number[] = [];
  for (let i = 0; i < cleaned.length; i++) out.push(cleaned.charCodeAt(i) & 0xff);
  return out;
}

function padRight(s: string, width: number): string {
  if (s.length >= width) return s.slice(0, width);
  return s + ' '.repeat(width - s.length);
}

function divider(char: string): number[] {
  return [...ascii(char.repeat(COLS)), ...ENC.LF];
}

function fc(value: number): string {
  return new Intl.NumberFormat('fr-CD').format(Math.round(value)) + ' FC';
}

function renderItem(item: ReceiptItem): number[] {
  // Line 1: "product xN" (left) + total (right)
  // Line 2 (optional): packaging breakdown — "3 cartons × 24 pcs + 2 pcs"
  // Line 3: indented per-piece "@ unit price"
  // Line 4 (optional): carton-tier price — "4 800 FC / ctn (24 pcs)"
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

  const cartonInfo = formatCartonInfoLine(item);
  if (cartonInfo) out.push(...ascii('  ' + cartonInfo), ...ENC.LF);
  return out;
}

export function encodeReceipt(data: ReceiptData): Uint8Array {
  const bytes: number[] = [];
  const BRAND = 'KMB-Talk';

  bytes.push(...ENC.INIT);

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

  for (const item of data.items) {
    bytes.push(...renderItem(item));
  }

  bytes.push(...divider('-'));

  bytes.push(...ENC.BOLD_ON);
  bytes.push(...ENC.DOUBLE_HEIGHT_ON);
  const totalStr = fc(data.grandTotalFc);
  const totalLine = padRight('TOTAL', COLS - totalStr.length) + totalStr;
  bytes.push(...ascii(totalLine));
  bytes.push(...ENC.LF);
  bytes.push(...ENC.NORMAL);
  bytes.push(...ENC.BOLD_OFF);

  bytes.push(...divider('='));

  if (data.sellerName || data.sellerUsername) {
    const sellerLabel = data.sellerName ?? `@${data.sellerUsername ?? ''}`;
    bytes.push(...ascii(metaLine('Sold by', sellerLabel)));
    bytes.push(...ENC.LF);
    if (data.sellerName && data.sellerUsername) {
      bytes.push(...ascii(metaLine('', `@${data.sellerUsername}`)));
      bytes.push(...ENC.LF);
    }
  }

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

  bytes.push(...ENC.FEED_LINES(3));
  bytes.push(...ENC.CUT);

  return new Uint8Array(bytes);
}

function metaLine(label: string, value: string): string {
  const left = label;
  const right = value;
  const space = COLS - left.length - right.length;
  if (space < 1) return (left + ' ' + right).slice(0, COLS);
  return left + ' '.repeat(space) + right;
}

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
