import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';

export interface ReceiptItem {
  readonly productName: string;
  readonly qty: number;
  readonly unitPriceFc: number;   // already converted to FC
  readonly totalFc: number;
}

export interface ReceiptData {
  readonly items: ReceiptItem[];
  readonly grandTotalFc: number;
  readonly markupPct: number;
  readonly date: string;
  readonly sellerUsername?: string;
}

function buildHtml(data: ReceiptData): string {
  const rows = data.items
    .map(
      (item) =>
        `<tr>
          <td class="name">${item.productName}</td>
          <td class="center">x${item.qty}</td>
          <td class="right">${formatFc(item.unitPriceFc)}</td>
          <td class="right bold">${formatFc(item.totalFc)}</td>
        </tr>`,
    )
    .join('');

  const header = data.sellerUsername ? `@${data.sellerUsername}` : 'Sales Receipt';

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: 'Courier New', monospace;
      font-size: 13px;
      padding: 20px 16px;
      max-width: 340px;
      margin: 0 auto;
      color: #111;
    }
    h1 { text-align: center; font-size: 17px; font-weight: bold; margin-bottom: 2px; }
    .sub { text-align: center; color: #555; font-size: 11px; margin-bottom: 14px; }
    .divider { border: none; border-top: 1px dashed #999; margin: 10px 0; }
    .divider-solid { border: none; border-top: 1px solid #111; margin: 10px 0; }
    table { width: 100%; border-collapse: collapse; }
    th { font-size: 10px; text-transform: uppercase; padding: 3px 0; color: #555; text-align: left; }
    th.center { text-align: center; }
    th.right  { text-align: right; }
    td { padding: 4px 0; vertical-align: top; }
    td.name  { text-transform: capitalize; width: 44%; }
    td.center { text-align: center; width: 10%; }
    td.right  { text-align: right; width: 23%; }
    td.bold { font-weight: bold; }
    .total-row td { font-size: 15px; font-weight: bold; padding-top: 6px; }
    .footer { text-align: center; color: #777; font-size: 10px; margin-top: 16px; }
  </style>
</head>
<body>
  <h1>${header}</h1>
  <p class="sub">${data.date}</p>
  <hr class="divider-solid" />
  <table>
    <thead>
      <tr>
        <th>Product</th>
        <th class="center">Qty</th>
        <th class="right">Unit</th>
        <th class="right">Total</th>
      </tr>
    </thead>
    <tbody>${rows}</tbody>
  </table>
  <hr class="divider-solid" />
  <table>
    <tr class="total-row">
      <td colspan="3">TOTAL</td>
      <td class="right">${formatFc(data.grandTotalFc)}</td>
    </tr>
  </table>
  <hr class="divider" />
  <p class="footer">Markup: ${data.markupPct}% &nbsp;•&nbsp; Thank you!</p>
</body>
</html>`;
}

function formatFc(value: number): string {
  return new Intl.NumberFormat('fr-CD').format(Math.round(value)) + ' FC';
}

export async function printReceipt(data: ReceiptData): Promise<void> {
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
