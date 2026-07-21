import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { BRAND, RECEIPT_FOOTER, escapeHtml, formatFc } from './receipt';
import { breakdownQuantity, formatBreakdown, formatDate } from './utils';
import type { MiniSettlementSummary } from './api';

/**
 * Printable records for the mini-employee ↔ employer loop:
 *   1. A "goods received" slip — printed by the mini right after they confirm a
 *      consignment their employer assigned to them (what they now hold + owe).
 *   2. A "handover receipt" — printed once the employer approves the mini's
 *      handover (cash turned in + unsold goods returned).
 *
 * Unlike the POS sales receipt (which prefers a paired Bluetooth thermal
 * printer, see lib/receipt.ts), these are occasional record documents both
 * parties keep. They route only through the system print dialog / share-to-PDF
 * (expo-print), which works on every device out of the box and can target any
 * printer or save a PDF — no Bluetooth pairing required. Their internal labels
 * are hardcoded to match the sales receipt's style; only the surrounding app UI
 * is translated.
 */

/** A named party on a slip — employer or the mini. Either field may be absent. */
export interface SlipParty {
  readonly name?: string;
  readonly handle?: string; // username, rendered as "@handle"
}

/** One product line, already reduced to FC (no exchange-rate math in here). */
export interface ReceivedGoodsLine {
  readonly productName: string;
  /** Human breakdown, e.g. "2 ctn + 3 pcs" (from formatBreakdown). */
  readonly qtyLabel: string;
  readonly unitPriceFc: number;
  readonly lineTotalFc: number;
}

export interface ReceivedGoodsSlip {
  readonly from: SlipParty; // employer/supplier who assigned the goods
  readonly receivedBy: SlipParty; // the mini confirming receipt
  readonly date: string; // locale-formatted date/time
  readonly reference?: string;
  readonly note?: string;
  readonly items: ReceivedGoodsLine[];
  readonly totalOwedFc: number;
}

export interface HandoverReturnLine {
  readonly productName: string;
  readonly qtyLabel: string;
}

export interface ApprovedHandoverSlip {
  readonly to: SlipParty; // employer/owner receiving the handover
  readonly handedOverBy: SlipParty; // the mini
  readonly submittedDate: string;
  readonly approvedDate?: string;
  readonly reference?: string;
  readonly note?: string;
  readonly cashHandedOverFc: number;
  readonly returns: HandoverReturnLine[];
}

/**
 * Reduce a settlement (as returned by `/mini-settlements/outgoing`) to a
 * printable handover slip. Single source of truth shared by the home banner and
 * the handover-history screen so a reprint matches the original.
 *
 * `self` is the mini (the party handing over). Cash is FC-native when the
 * settlement carries `cashAmountFc`; otherwise it is converted from the USD
 * `cashAmount` at `rate` (pre-snapshot handovers only). Returned items carry no
 * piecesPerCarton, so they render as plain pieces.
 */
export function toApprovedHandoverSlip(
  settlement: MiniSettlementSummary,
  self: SlipParty,
  rate: string,
): ApprovedHandoverSlip {
  const cashFc = settlement.cashAmountFc
    ? parseFloat(settlement.cashAmountFc) || 0
    : (parseFloat(settlement.cashAmount) || 0) * (parseFloat(rate) || 1);
  return {
    to: { name: settlement.owner?.name ?? undefined, handle: settlement.owner?.username },
    handedOverBy: self,
    submittedDate: formatDate(settlement.createdAt),
    approvedDate: settlement.approvedAt ? formatDate(settlement.approvedAt) : undefined,
    reference: settlement.id.slice(0, 6).toUpperCase(),
    note: settlement.note ?? undefined,
    cashHandedOverFc: cashFc,
    returns: settlement.items.map((it) => ({
      productName: it.variantLabel ? `${it.productName} · ${it.variantLabel}` : it.productName,
      qtyLabel: formatBreakdown(breakdownQuantity(it.quantity, null)),
    })),
  };
}

function partyLine(party: SlipParty): string {
  if (party.name) return escapeHtml(party.name);
  if (party.handle) return `@${escapeHtml(party.handle)}`;
  return '—';
}

function partyHandleLine(party: SlipParty): string {
  return party.name && party.handle ? `@${escapeHtml(party.handle)}` : '';
}

/**
 * Shared 80mm thermal-shaped page. `subtitle` is the document kind printed under
 * the brand; `body` is the pre-built inner HTML. Styling mirrors the sales
 * receipt so all printed documents look like they came from the same shop.
 */
function wrapSlipHtml(subtitle: string, body: string): string {
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
    .party {
      text-align: center;
      font-weight: 700;
      font-size: 13px;
      margin-bottom: 0.5mm;
    }
    .party-handle {
      text-align: center;
      font-size: 10px;
      color: #555;
      margin-bottom: 2mm;
    }
    .meta { font-size: 10.5px; }
    .meta-row { display: flex; justify-content: space-between; }
    .meta-row .label { color: #555; }
    .row.item { margin: 1.2mm 0; }
    .line { display: flex; justify-content: space-between; gap: 4mm; }
    .line .name { flex: 1; text-transform: capitalize; word-break: break-word; }
    .line .amount { white-space: nowrap; font-weight: 700; }
    .line.sub { font-size: 10.5px; color: #444; }
    .total-row {
      display: flex;
      justify-content: space-between;
      align-items: baseline;
      font-size: 15px;
      font-weight: 800;
      margin-top: 1mm;
    }
    .total-row .label { letter-spacing: 2px; }
    .section {
      font-size: 10px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 1px;
      color: #555;
      margin: 3mm 0 1mm;
    }
    .footer { text-align: center; font-size: 11px; margin-top: 3mm; }
    .thanks { font-weight: 700; letter-spacing: 2px; margin-top: 0.5mm; }
    .muted { color: #555; }
  </style>
</head>
<body>
  <div class="brand">${escapeHtml(BRAND)}</div>
  <div class="brand-sub">${escapeHtml(subtitle)}</div>
  <hr class="divider-solid" />
  ${body}
  <div class="footer">
    <div>${escapeHtml(RECEIPT_FOOTER.address)}</div>
    <div>${escapeHtml(RECEIPT_FOOTER.phone)}</div>
    <div class="thanks">${escapeHtml(RECEIPT_FOOTER.thanks)}</div>
  </div>
</body>
</html>`;
}

export function buildReceivedGoodsHtml(slip: ReceivedGoodsSlip): string {
  const fromLine = partyLine(slip.from);
  const fromHandle = partyHandleLine(slip.from);
  const itemRows = slip.items
    .map(
      (it) => `
        <div class="row item">
          <div class="line">
            <span class="name">${escapeHtml(it.productName)}</span>
            <span class="amount">${formatFc(it.lineTotalFc)}</span>
          </div>
          <div class="line sub">
            <span>&nbsp;&nbsp;${escapeHtml(it.qtyLabel)} × ${formatFc(it.unitPriceFc)}</span>
          </div>
        </div>`,
    )
    .join('');

  const body = `
  <div class="section">From</div>
  <div class="party">${fromLine}</div>
  ${fromHandle ? `<div class="party-handle">${fromHandle}</div>` : ''}

  <div class="meta">
    ${slip.reference ? `<div class="meta-row"><span class="label">Ref #</span><span>${escapeHtml(slip.reference)}</span></div>` : ''}
    <div class="meta-row"><span class="label">Date</span><span>${escapeHtml(slip.date)}</span></div>
    <div class="meta-row"><span class="label">Received by</span><span>${partyLine(slip.receivedBy)}</span></div>
    ${slip.note ? `<div class="meta-row"><span class="label">Note</span><span>${escapeHtml(slip.note)}</span></div>` : ''}
  </div>

  <hr class="divider" />
  <div class="items">${itemRows}</div>
  <hr class="divider" />

  <div class="total-row">
    <span class="label">OWED</span>
    <span>${formatFc(slip.totalOwedFc)}</span>
  </div>
  <hr class="divider-solid" />`;

  return wrapSlipHtml('goods received', body);
}

export function buildApprovedHandoverHtml(slip: ApprovedHandoverSlip): string {
  const toLine = partyLine(slip.to);
  const toHandle = partyHandleLine(slip.to);
  const returnRows =
    slip.returns.length === 0
      ? '<div class="line sub"><span>&nbsp;&nbsp;None — everything was sold.</span></div>'
      : slip.returns
          .map(
            (r) => `
        <div class="line">
          <span class="name">${escapeHtml(r.productName)}</span>
          <span class="muted">${escapeHtml(r.qtyLabel)}</span>
        </div>`,
          )
          .join('');

  const body = `
  <div class="section">To</div>
  <div class="party">${toLine}</div>
  ${toHandle ? `<div class="party-handle">${toHandle}</div>` : ''}

  <div class="meta">
    ${slip.reference ? `<div class="meta-row"><span class="label">Ref #</span><span>${escapeHtml(slip.reference)}</span></div>` : ''}
    <div class="meta-row"><span class="label">Handed over by</span><span>${partyLine(slip.handedOverBy)}</span></div>
    <div class="meta-row"><span class="label">Submitted</span><span>${escapeHtml(slip.submittedDate)}</span></div>
    ${slip.approvedDate ? `<div class="meta-row"><span class="label">Approved</span><span>${escapeHtml(slip.approvedDate)}</span></div>` : ''}
    ${slip.note ? `<div class="meta-row"><span class="label">Note</span><span>${escapeHtml(slip.note)}</span></div>` : ''}
  </div>

  <hr class="divider" />
  <div class="total-row">
    <span class="label">CASH</span>
    <span>${formatFc(slip.cashHandedOverFc)}</span>
  </div>
  <hr class="divider" />

  <div class="section">Items returned</div>
  <div class="items">${returnRows}</div>
  <hr class="divider-solid" />`;

  return wrapSlipHtml('handover receipt', body);
}

async function printHtml(html: string): Promise<void> {
  await Print.printAsync({ html });
}

async function sharePdf(html: string, dialogTitle: string): Promise<void> {
  const { uri } = await Print.printToFileAsync({ html });
  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(uri, {
      mimeType: 'application/pdf',
      dialogTitle,
      UTI: 'com.adobe.pdf',
    });
  }
}

export const printReceivedGoods = (slip: ReceivedGoodsSlip): Promise<void> =>
  printHtml(buildReceivedGoodsHtml(slip));

export const shareReceivedGoodsPdf = (slip: ReceivedGoodsSlip): Promise<void> =>
  sharePdf(buildReceivedGoodsHtml(slip), 'Goods received');

export const printApprovedHandover = (slip: ApprovedHandoverSlip): Promise<void> =>
  printHtml(buildApprovedHandoverHtml(slip));

export const shareApprovedHandoverPdf = (slip: ApprovedHandoverSlip): Promise<void> =>
  sharePdf(buildApprovedHandoverHtml(slip), 'Handover receipt');
