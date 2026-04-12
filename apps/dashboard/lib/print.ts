/**
 * Opens a new browser window with the given HTML and triggers print.
 * The user can print or "Save as PDF" from the browser print dialog.
 */
export function openPrintWindow(html: string): void {
  const win = window.open('', '_blank');
  if (!win) return;
  win.document.write(html);
  win.document.close();
  win.onload = () => {
    win.focus();
    win.print();
  };
}

export interface DocumentOptions {
  title: string;
  subtitle?: string;
  headerRight?: string;
  bodyHtml: string;
  footerHtml?: string;
}

/**
 * Wraps transaction content in a receipt-style HTML document.
 * Monospace font, compact layout, print-optimized.
 */
export function buildDocumentHtml(opts: DocumentOptions): string {
  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8" />
<title>${opts.title}</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    font-family: 'Courier New', Courier, monospace;
    font-size: 13px;
    padding: 24px 20px;
    max-width: 480px;
    margin: 0 auto;
    color: #111;
  }
  .header { text-align: center; margin-bottom: 16px; }
  .header h1 { font-size: 17px; font-weight: bold; margin-bottom: 2px; }
  .header .sub { color: #555; font-size: 11px; }
  .header-right { text-align: right; font-size: 11px; color: #555; margin-bottom: 12px; }
  .divider { border: none; border-top: 1px dashed #999; margin: 12px 0; }
  .divider-solid { border: none; border-top: 1px solid #111; margin: 12px 0; }
  table { width: 100%; border-collapse: collapse; }
  th {
    font-size: 10px;
    text-transform: uppercase;
    padding: 4px 0;
    color: #555;
    text-align: left;
    border-bottom: 1px solid #ccc;
  }
  th.right { text-align: right; }
  th.center { text-align: center; }
  td { padding: 5px 0; vertical-align: top; }
  td.right { text-align: right; }
  td.center { text-align: center; }
  td.bold { font-weight: bold; }
  td.cap { text-transform: capitalize; }
  .total-row td { font-size: 15px; font-weight: bold; padding-top: 8px; }
  .summary-row { display: flex; justify-content: space-between; padding: 3px 0; font-size: 12px; }
  .summary-row .label { color: #555; }
  .summary-row .value { font-weight: bold; }
  .badge {
    display: inline-block;
    font-size: 10px;
    font-weight: bold;
    text-transform: uppercase;
    padding: 2px 8px;
    border-radius: 4px;
    background: #f0f0f0;
    color: #333;
  }
  .footer { text-align: center; color: #999; font-size: 10px; margin-top: 20px; }
  @media print {
    body { padding: 0; }
  }
</style>
</head>
<body>
  <div class="header">
    <h1>${opts.title}</h1>
    ${opts.subtitle ? `<p class="sub">${opts.subtitle}</p>` : ''}
  </div>
  ${opts.headerRight ? `<div class="header-right">${opts.headerRight}</div>` : ''}
  <hr class="divider-solid" />
  ${opts.bodyHtml}
  ${opts.footerHtml ? `<hr class="divider" />${opts.footerHtml}` : ''}
  <p class="footer">Generated ${new Date().toLocaleString()}</p>
</body>
</html>`;
}
