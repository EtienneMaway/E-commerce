import { PermissionsAndroid, Platform } from 'react-native';
import RNBluetoothClassic, {
  BluetoothDevice,
} from 'react-native-bluetooth-classic';
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
 * Thin wrapper around `react-native-bluetooth-classic` for ESC/POS receipt
 * printing on cheap 58 mm Bluetooth thermal printers (Goojprt, Xprinter,
 * Munbyn, etc.).
 *
 * Talking to a thermal printer involves four phases:
 *   1. Permissions (Android 12+ asks separately for BLUETOOTH_CONNECT/SCAN).
 *   2. Pairing happens in the OS Bluetooth settings, not this app — we only
 *      list devices the user has already paired.
 *   3. RFCOMM connect to the paired device's SPP socket.
 *   4. Write the base64-encoded ESC/POS byte stream + disconnect.
 *
 * We keep connections short-lived (open-print-close) so the printer's other
 * users (e.g. desktop POS apps the merchant might also use) aren't blocked.
 */

export interface PairedPrinter {
  address: string;
  name: string;
}

async function requestBtPermissions(): Promise<boolean> {
  if (Platform.OS !== 'android') return true;
  // Android 12 (API 31) split the legacy BLUETOOTH permission into two runtime
  // ones. PermissionsAndroid is the cleanest way to ask without pulling in an
  // extra package. Older Androids ignore the unknown strings.
  const perms: string[] = [
    'android.permission.BLUETOOTH_CONNECT',
    'android.permission.BLUETOOTH_SCAN',
  ];
  const result = await PermissionsAndroid.requestMultiple(
    perms as Parameters<typeof PermissionsAndroid.requestMultiple>[0],
  );
  return Object.values(result).every(
    (v) => v === PermissionsAndroid.RESULTS.GRANTED,
  );
}

export async function isBluetoothEnabled(): Promise<boolean> {
  try {
    return await RNBluetoothClassic.isBluetoothEnabled();
  } catch {
    return false;
  }
}

export async function listPairedPrinters(): Promise<PairedPrinter[]> {
  const ok = await requestBtPermissions();
  if (!ok) throw new Error('Bluetooth permissions denied');
  const enabled = await isBluetoothEnabled();
  if (!enabled) throw new Error('Bluetooth is turned off');
  const devices = await RNBluetoothClassic.getBondedDevices();
  return devices.map((d: BluetoothDevice) => ({
    address: d.address,
    name: d.name ?? d.address,
  }));
}

async function withConnection<T>(
  address: string,
  fn: (device: BluetoothDevice) => Promise<T>,
): Promise<T> {
  const ok = await requestBtPermissions();
  if (!ok) throw new Error('Bluetooth permissions denied');
  let device: BluetoothDevice | null = null;
  try {
    const already = await RNBluetoothClassic.isDeviceConnected(address);
    if (already) {
      const list = await RNBluetoothClassic.getConnectedDevices();
      device = list.find((d) => d.address === address) ?? null;
    }
    if (!device) {
      device = await RNBluetoothClassic.connectToDevice(address, {
        // SPP/RFCOMM well-known UUID — the default for thermal printers.
        connectorType: 'rfcomm',
      });
    }
    return await fn(device);
  } finally {
    if (device) {
      try {
        await RNBluetoothClassic.disconnectFromDevice(device.address);
      } catch {
        // best-effort
      }
    }
  }
}

export async function printReceiptToBluetooth(
  printer: PairedPrinter,
  data: ReceiptData,
): Promise<void> {
  const payload = toBase64(encodeReceipt(data));
  await withConnection(printer.address, async (device) => {
    await device.write(payload, 'base64');
  });
}

export async function printReceivedGoodsSlipToBluetooth(
  printer: PairedPrinter,
  slip: ReceivedGoodsSlip,
): Promise<void> {
  const payload = toBase64(encodeReceivedGoodsSlip(slip));
  await withConnection(printer.address, async (device) => {
    await device.write(payload, 'base64');
  });
}

export async function printApprovedHandoverToBluetooth(
  printer: PairedPrinter,
  slip: ApprovedHandoverSlip,
): Promise<void> {
  const payload = toBase64(encodeApprovedHandoverSlip(slip));
  await withConnection(printer.address, async (device) => {
    await device.write(payload, 'base64');
  });
}

export async function testPrint(printer: PairedPrinter): Promise<void> {
  const payload = toBase64(encodeTestPrint(printer.name));
  await withConnection(printer.address, async (device) => {
    await device.write(payload, 'base64');
  });
}
