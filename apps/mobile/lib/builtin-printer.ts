import * as Print from 'expo-print';
import type { ReceiptData } from './receipt';
import { buildHtml } from './receipt';
import type { ReceivedGoodsSlip, ApprovedHandoverSlip } from './handover-receipt';
import { buildReceivedGoodsHtml, buildApprovedHandoverHtml } from './handover-receipt';
import {
  isSunmiPrinterAvailable,
  printReceiptToSunmi,
  printReceivedGoodsSlipToSunmi,
  printApprovedHandoverToSunmi,
  testPrintSunmi,
} from './sunmi-printer';

/**
 * Driver for a POS terminal's built-in printer. Hardware exposes this one of
 * two ways, and there's no reliable way to tell which a given device is up
 * front:
 *  - Genuine Sunmi hardware: raw ESC/POS via the Sunmi InnerPrinter AIDL
 *    service (lib/sunmi-printer.ts) — fast, no dialog.
 *  - Everything else — white-label POS clones (e.g. "SP-S3") that bundle
 *    their printer as a plain Android print service rather than Sunmi's
 *    proprietary SDK. These have no AIDL service to call, so the only way to
 *    reach the built-in printer is Android's system print dialog
 *    (expo-print), which the device's own bundled driver picks up. This is
 *    the exact path that printed correctly on these devices before
 *    Bluetooth/Sunmi support existed — kept here as the fallback rather than
 *    the default, so it's never offered as a substitute for a real paired
 *    Bluetooth printer.
 *
 * Every call tries Sunmi first (silently, cheap to probe) and only falls
 * back to the system dialog if that's unavailable or fails.
 */
async function printBuiltIn(sunmiPrint: () => Promise<void>, html: () => string): Promise<void> {
  if (await isSunmiPrinterAvailable()) {
    try {
      await sunmiPrint();
      return;
    } catch {
      // Sunmi service reported present but the actual print call failed —
      // fall through to the system dialog rather than leaving it unprinted.
    }
  }
  await Print.printAsync({ html: html() });
}

export const printReceiptToBuiltIn = (data: ReceiptData): Promise<void> =>
  printBuiltIn(() => printReceiptToSunmi(data), () => buildHtml(data));

export const printReceivedGoodsSlipToBuiltIn = (slip: ReceivedGoodsSlip): Promise<void> =>
  printBuiltIn(() => printReceivedGoodsSlipToSunmi(slip), () => buildReceivedGoodsHtml(slip));

export const printApprovedHandoverToBuiltIn = (slip: ApprovedHandoverSlip): Promise<void> =>
  printBuiltIn(() => printApprovedHandoverToSunmi(slip), () => buildApprovedHandoverHtml(slip));

export async function testPrintBuiltIn(): Promise<void> {
  if (await isSunmiPrinterAvailable()) {
    try {
      await testPrintSunmi();
      return;
    } catch {
      // fall through to the system dialog
    }
  }
  await Print.printAsync({
    html: '<html><body style="font-family:monospace;padding:24px"><h3>Test print</h3><p>Built-in printer OK</p></body></html>',
  });
}
