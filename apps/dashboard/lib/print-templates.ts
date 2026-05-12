import { buildDocumentHtml } from './print';

/* ── Helpers ───────────────────────────────────────────────────────────── */

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function cap(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function fmtDate(d: string): string {
  const dt = new Date(d);
  const dd = String(dt.getDate()).padStart(2, '0');
  const mm = String(dt.getMonth() + 1).padStart(2, '0');
  const yyyy = dt.getFullYear();
  return `${dd}/${mm}/${yyyy}`;
}

/* ── Types for each template ───────────────────────────────────────────── */

export interface ConsignmentPrintData {
  supplierUsername: string;
  debtorUsername: string;
  status: string;
  note: string | null;
  createdAt: string;
  items: { productName: string; quantity: number; agreedUnitPrice: string; piecesPerCarton?: number | null }[];
  formatCurrency: (v: string | number) => string;
  t: {
    title: string;
    from: string;
    to: string;
    date: string;
    status: string;
    product: string;
    qty: string;
    unitPrice: string;
    total: string;
    note: string;
    grandTotal: string;
    cartonPrice: string;
    pcsPerCarton: string;
  };
}

export interface ExternalProductPrintData {
  contactName: string;
  contactPhone: string | null;
  direction: 'out' | 'in';
  transactions: {
    productName: string | null;
    quantity: number | null;
    unitPrice: string | null;
    amount: string;
    createdAt: string;
    notes: string | null;
  }[];
  balance: string;
  formatCurrency: (v: string | number) => string;
  t: {
    title: string;
    contact: string;
    phone: string;
    date: string;
    product: string;
    qty: string;
    unitPrice: string;
    total: string;
    balance: string;
    grandTotal: string;
  };
}

export interface SaleReceiptPrintData {
  items: {
    productName: string;
    qtySold: number;
    salePrice: string;
    piecesPerCarton?: number | null;
  }[];
  date: string;
  formatCurrency: (v: string | number) => string;
  t: {
    title: string;
    date: string;
    product: string;
    qty: string;
    unitPrice: string;
    total: string;
    grandTotal: string;
    cartonPrice: string;
    pcsPerCarton: string;
  };
}

/* ── 1. Consignment Note ───────────────────────────────────────────────── */

export function consignmentHtml(data: ConsignmentPrintData): string {
  const total = data.items.reduce(
    (s, it) => s + parseFloat(it.agreedUnitPrice) * it.quantity,
    0,
  );

  const rows = data.items
    .map(
      (it) => {
        const ppc = it.piecesPerCarton;
        const cartonPrice = ppc
          ? data.formatCurrency((parseFloat(it.agreedUnitPrice) * ppc).toFixed(2))
          : null;
        const ppcLine = ppc
          ? `<span style="font-size:10px;color:#777">1 ctn = ${ppc} ${data.t.pcsPerCarton}</span>`
          : '';
        const cartonLine = cartonPrice
          ? `<span style="font-size:10px;color:#777">${data.t.cartonPrice}: ${cartonPrice}</span>`
          : '';
        const sub = [ppcLine, cartonLine].filter(Boolean).join(' &middot; ');
        return `<tr>
          <td class="cap">${esc(it.productName)}${sub ? `<br>${sub}` : ''}</td>
          <td class="center">${it.quantity}</td>
          <td class="right">${data.formatCurrency(it.agreedUnitPrice)}</td>
          <td class="right bold">${data.formatCurrency((parseFloat(it.agreedUnitPrice) * it.quantity).toFixed(2))}</td>
        </tr>`;
      },
    )
    .join('');

  const bodyHtml = `
    <div class="summary-row"><span class="label">${data.t.from}:</span><span class="value">@${esc(data.supplierUsername)}</span></div>
    <div class="summary-row"><span class="label">${data.t.to}:</span><span class="value">@${esc(data.debtorUsername)}</span></div>
    <div class="summary-row"><span class="label">${data.t.date}:</span><span class="value">${fmtDate(data.createdAt)}</span></div>
    <div class="summary-row"><span class="label">${data.t.status}:</span><span class="badge">${esc(data.status)}</span></div>
    ${data.note ? `<div class="summary-row"><span class="label">${data.t.note}:</span><span class="value">${esc(data.note)}</span></div>` : ''}
    <hr class="divider" />
    <table>
      <thead><tr>
        <th>${data.t.product}</th>
        <th class="center">${data.t.qty}</th>
        <th class="right">${data.t.unitPrice}</th>
        <th class="right">${data.t.total}</th>
      </tr></thead>
      <tbody>${rows}</tbody>
    </table>
    <hr class="divider-solid" />
    <table><tr class="total-row">
      <td colspan="3">${data.t.grandTotal}</td>
      <td class="right">${data.formatCurrency(total.toFixed(2))}</td>
    </tr></table>`;

  return buildDocumentHtml({
    title: data.t.title,
    subtitle: fmtDate(data.createdAt),
    bodyHtml,
  });
}

/* ── 2. External Contact — Product Out / Product In ────────────────────── */

export function externalProductHtml(data: ExternalProductPrintData): string {
  const productTxs = data.transactions.filter((tx) => tx.productName);
  const grandTotal = data.transactions.reduce(
    (s, tx) => s + parseFloat(tx.amount),
    0,
  );

  const rows = productTxs
    .map(
      (tx) =>
        `<tr>
          <td class="cap">${esc(tx.productName ?? '—')}</td>
          <td class="center">${tx.quantity ?? '—'}</td>
          <td class="right">${tx.unitPrice ? data.formatCurrency(tx.unitPrice) : '—'}</td>
          <td class="right bold">${data.formatCurrency(tx.amount)}</td>
        </tr>`,
    )
    .join('');

  const paymentTxs = data.transactions.filter((tx) => !tx.productName);
  const paymentRows = paymentTxs
    .map(
      (tx) =>
        `<tr>
          <td colspan="3">${tx.notes ? esc(tx.notes) : (data.direction === 'out' ? 'Payment' : 'Payment')}</td>
          <td class="right bold">${data.formatCurrency(tx.amount)}</td>
        </tr>`,
    )
    .join('');

  const bodyHtml = `
    <div class="summary-row"><span class="label">${data.t.contact}:</span><span class="value">${esc(data.contactName)}</span></div>
    ${data.contactPhone ? `<div class="summary-row"><span class="label">${data.t.phone}:</span><span class="value">${esc(data.contactPhone)}</span></div>` : ''}
    <hr class="divider" />
    ${rows ? `
    <table>
      <thead><tr>
        <th>${data.t.product}</th>
        <th class="center">${data.t.qty}</th>
        <th class="right">${data.t.unitPrice}</th>
        <th class="right">${data.t.total}</th>
      </tr></thead>
      <tbody>${rows}</tbody>
    </table>` : ''}
    ${paymentRows ? `
    <hr class="divider" />
    <table><tbody>${paymentRows}</tbody></table>` : ''}
    <hr class="divider-solid" />
    <table><tr class="total-row">
      <td colspan="3">${data.t.grandTotal}</td>
      <td class="right">${data.formatCurrency(grandTotal.toFixed(2))}</td>
    </tr></table>
    <hr class="divider" />
    <div class="summary-row"><span class="label">${data.t.balance}:</span><span class="value">${data.formatCurrency(data.balance)}</span></div>`;

  return buildDocumentHtml({
    title: data.t.title,
    bodyHtml,
  });
}

/* ── 2b. External Contact — Batch (multi-product) note ─────────────────── */

export interface ExternalBatchPrintData {
  contactName: string;
  contactPhone: string | null;
  direction: 'out' | 'in';
  /** First batch row's createdAt — used as the batch date. */
  createdAt: string;
  items: {
    productName: string;
    quantity: number;
    unitPrice: string;
    amount: string;
    piecesPerCarton?: number | null;
  }[];
  /** Optional shared note attached to the batch. */
  note: string | null;
  /** Resulting contact balance after the batch is applied. */
  balance: string;
  formatCurrency: (v: string | number) => string;
  t: {
    title: string;
    contact: string;
    phone: string;
    date: string;
    note: string;
    product: string;
    qty: string;
    unitPrice: string;
    total: string;
    grandTotal: string;
    balance: string;
    cartonPrice: string;
    pcsPerCarton: string;
  };
}

export function externalBatchHtml(data: ExternalBatchPrintData): string {
  const total = data.items.reduce(
    (s, it) => s + parseFloat(it.amount),
    0,
  );

  const rows = data.items
    .map((it) => {
      const ppc = it.piecesPerCarton;
      const cartonPrice = ppc
        ? data.formatCurrency((parseFloat(it.unitPrice) * ppc).toFixed(2))
        : null;
      const ppcLine = ppc
        ? `<span style="font-size:10px;color:#777">1 ctn = ${ppc} ${data.t.pcsPerCarton}</span>`
        : '';
      const cartonLine = cartonPrice
        ? `<span style="font-size:10px;color:#777">${data.t.cartonPrice}: ${cartonPrice}</span>`
        : '';
      const sub = [ppcLine, cartonLine].filter(Boolean).join(' &middot; ');
      return `<tr>
        <td class="cap">${esc(it.productName)}${sub ? `<br>${sub}` : ''}</td>
        <td class="center">${it.quantity}</td>
        <td class="right">${data.formatCurrency(it.unitPrice)}</td>
        <td class="right bold">${data.formatCurrency(it.amount)}</td>
      </tr>`;
    })
    .join('');

  const bodyHtml = `
    <div class="summary-row"><span class="label">${data.t.contact}:</span><span class="value">${esc(data.contactName)}</span></div>
    ${data.contactPhone ? `<div class="summary-row"><span class="label">${data.t.phone}:</span><span class="value">${esc(data.contactPhone)}</span></div>` : ''}
    <div class="summary-row"><span class="label">${data.t.date}:</span><span class="value">${fmtDate(data.createdAt)}</span></div>
    ${data.note ? `<div class="summary-row"><span class="label">${data.t.note}:</span><span class="value">${esc(data.note)}</span></div>` : ''}
    <hr class="divider" />
    <table>
      <thead><tr>
        <th>${data.t.product}</th>
        <th class="center">${data.t.qty}</th>
        <th class="right">${data.t.unitPrice}</th>
        <th class="right">${data.t.total}</th>
      </tr></thead>
      <tbody>${rows}</tbody>
    </table>
    <hr class="divider-solid" />
    <table><tr class="total-row">
      <td colspan="3">${data.t.grandTotal}</td>
      <td class="right">${data.formatCurrency(total.toFixed(2))}</td>
    </tr></table>
    <hr class="divider" />
    <div class="summary-row"><span class="label">${data.t.balance}:</span><span class="value">${data.formatCurrency(data.balance)}</span></div>`;

  return buildDocumentHtml({
    title: data.t.title,
    subtitle: fmtDate(data.createdAt),
    bodyHtml,
  });
}

/* ── 3. Single external transaction print ──────────────────────────────── */

export interface SingleExternalTxPrintData {
  contactName: string;
  contactPhone: string | null;
  tx: {
    type: string;
    productName: string | null;
    quantity: number | null;
    unitPrice: string | null;
    piecesPerCarton?: number | null;
    amount: string;
    createdAt: string;
    notes: string | null;
  };
  balance: string;
  formatCurrency: (v: string | number) => string;
  t: {
    title: string;
    contact: string;
    phone: string;
    date: string;
    product: string;
    qty: string;
    unitPrice: string;
    total: string;
    balance: string;
    cartonPrice: string;
    pcsPerCarton: string;
  };
}

export function singleExternalTxHtml(data: SingleExternalTxPrintData): string {
  const tx = data.tx;
  const isProduct = tx.productName !== null;

  const bodyHtml = `
    <div class="summary-row"><span class="label">${data.t.contact}:</span><span class="value">${esc(data.contactName)}</span></div>
    ${data.contactPhone ? `<div class="summary-row"><span class="label">${data.t.phone}:</span><span class="value">${esc(data.contactPhone)}</span></div>` : ''}
    <div class="summary-row"><span class="label">${data.t.date}:</span><span class="value">${fmtDate(tx.createdAt)}</span></div>
    <hr class="divider" />
    ${isProduct ? (() => {
      const ppc = tx.piecesPerCarton;
      const cartonPrice = ppc && tx.unitPrice
        ? data.formatCurrency((parseFloat(tx.unitPrice) * ppc).toFixed(2))
        : null;
      const ppcLine = ppc
        ? `<span style="font-size:10px;color:#777">1 ctn = ${ppc} ${data.t.pcsPerCarton}</span>`
        : '';
      const cartonLine = cartonPrice
        ? `<span style="font-size:10px;color:#777">${data.t.cartonPrice}: ${cartonPrice}</span>`
        : '';
      const sub = [ppcLine, cartonLine].filter(Boolean).join(' &middot; ');
      return `
    <table>
      <thead><tr>
        <th>${data.t.product}</th>
        <th class="center">${data.t.qty}</th>
        <th class="right">${data.t.unitPrice}</th>
        <th class="right">${data.t.total}</th>
      </tr></thead>
      <tbody><tr>
        <td class="cap">${esc(tx.productName!)}${sub ? `<br>${sub}` : ''}</td>
        <td class="center">${tx.quantity ?? '—'}</td>
        <td class="right">${tx.unitPrice ? data.formatCurrency(tx.unitPrice) : '—'}</td>
        <td class="right bold">${data.formatCurrency(tx.amount)}</td>
      </tr></tbody>
    </table>`;
    })() : `
    <div class="summary-row"><span class="label">${data.t.total}:</span><span class="value" style="font-size:15px">${data.formatCurrency(tx.amount)}</span></div>`}
    ${tx.notes ? `<p style="margin-top:8px;font-size:11px;color:#555">${esc(tx.notes)}</p>` : ''}
    <hr class="divider-solid" />
    <div class="summary-row"><span class="label">${data.t.balance}:</span><span class="value">${data.formatCurrency(data.balance)}</span></div>`;

  return buildDocumentHtml({
    title: data.t.title,
    subtitle: fmtDate(tx.createdAt),
    bodyHtml,
  });
}

/* ── 4. Sale Receipt ───────────────────────────────────────────────────── */

export function saleReceiptHtml(data: SaleReceiptPrintData): string {
  const grandTotal = data.items.reduce(
    (s, it) => s + parseFloat(it.salePrice) * it.qtySold,
    0,
  );

  const rows = data.items
    .map(
      (it) => {
        const ppc = it.piecesPerCarton;
        const cartonPrice = ppc
          ? data.formatCurrency((parseFloat(it.salePrice) * ppc).toFixed(2))
          : null;
        const ppcLine = ppc
          ? `<span style="font-size:10px;color:#777">1 ctn = ${ppc} ${data.t.pcsPerCarton}</span>`
          : '';
        const cartonLine = cartonPrice
          ? `<span style="font-size:10px;color:#777">${data.t.cartonPrice}: ${cartonPrice}</span>`
          : '';
        const sub = [ppcLine, cartonLine].filter(Boolean).join(' &middot; ');
        return `<tr>
          <td class="cap">${esc(it.productName)}${sub ? `<br>${sub}` : ''}</td>
          <td class="center">x${it.qtySold}</td>
          <td class="right">${data.formatCurrency(it.salePrice)}</td>
          <td class="right bold">${data.formatCurrency((parseFloat(it.salePrice) * it.qtySold).toFixed(2))}</td>
        </tr>`;
      },
    )
    .join('');

  const bodyHtml = `
    <table>
      <thead><tr>
        <th>${data.t.product}</th>
        <th class="center">${data.t.qty}</th>
        <th class="right">${data.t.unitPrice}</th>
        <th class="right">${data.t.total}</th>
      </tr></thead>
      <tbody>${rows}</tbody>
    </table>
    <hr class="divider-solid" />
    <table><tr class="total-row">
      <td colspan="3">${data.t.grandTotal}</td>
      <td class="right">${data.formatCurrency(grandTotal.toFixed(2))}</td>
    </tr></table>`;

  return buildDocumentHtml({
    title: data.t.title,
    subtitle: fmtDate(data.date),
    bodyHtml,
  });
}
