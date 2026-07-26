import * as SunmiPrinterLibrary from '@mitsuharu/react-native-sunmi-printer-library';
import type { ReceiptData } from './receipt';
import type { ReceivedGoodsSlip, ApprovedHandoverSlip } from './handover-receipt';
import {
  encodeReceipt,
  encodeReceivedGoodsSlip,
  encodeApprovedHandoverSlip,
  encodeTestPrint,
  toBase64,
} from './escpos';

/**
 * Driver for Sunmi handheld/countertop POS terminals with a printer built
 * into the unit itself (Sunmi's InnerPrinter AIDL service — package
 * `woyou.aidlservice.jiuiv5`), as opposed to a separate Bluetooth peripheral.
 * There is no pairing step: the service is either present on the device or
 * it isn't.
 *
 * `sendRAWData` is a raw ESC/POS byte passthrough, so this reuses the exact
 * same encoders as the Bluetooth path (lib/escpos.ts) — the wire format is
 * identical, only the transport differs.
 */

/** Probes whether this device actually has the Sunmi printer service. */
export async function isSunmiPrinterAvailable(): Promise<boolean> {
  try {
    await SunmiPrinterLibrary.prepare();
    return true;
  } catch {
    return false;
  }
}

async function sendRaw(bytes: Uint8Array): Promise<void> {
  await SunmiPrinterLibrary.prepare();
  await SunmiPrinterLibrary.sendRAWData(toBase64(bytes));
}

export const printReceiptToSunmi = (data: ReceiptData): Promise<void> =>
  sendRaw(encodeReceipt(data));

export const printReceivedGoodsSlipToSunmi = (slip: ReceivedGoodsSlip): Promise<void> =>
  sendRaw(encodeReceivedGoodsSlip(slip));

export const printApprovedHandoverToSunmi = (slip: ApprovedHandoverSlip): Promise<void> =>
  sendRaw(encodeApprovedHandoverSlip(slip));

export const testPrintSunmi = (): Promise<void> => sendRaw(encodeTestPrint('Built-in POS printer'));
