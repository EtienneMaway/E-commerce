/**
 * Web Bluetooth integration for the dashboard.
 *
 * Lets the merchant pair a Bluetooth thermal printer once via the browser
 * device picker, then send ESC/POS bytes directly to it from any print flow
 * — same receipt look as the mobile app, no PDF round-trip, no native
 * companion app.
 *
 * Constraints worth knowing:
 *   1. **Android Chrome / Edge only.** iOS Safari has no Web Bluetooth at all
 *      (Apple has never shipped it). Desktop Chrome/Edge work too but the
 *      printer needs to be reachable from the laptop.
 *   2. **BLE only.** Web Bluetooth cannot speak Classic Bluetooth / SPP.
 *      Cheap thermal printers usually expose a BLE "transparent serial" GATT
 *      characteristic in addition to Classic. If the printer is Classic-only
 *      it won't show up here.
 *   3. **Requires a user gesture.** `requestDevice()` must be called from a
 *      click handler — Chrome blocks programmatic invocations.
 *   4. **MTU is tiny.** BLE write packets are 20–512 bytes depending on the
 *      negotiated MTU. We chunk the ESC/POS stream into 100-byte writes,
 *      which is the conservative cross-printer maximum.
 */

import { encodeReceipt, encodeTestPrint } from './escpos';
import type { ReceiptData } from './thermal-receipt';

// ── Minimal Web Bluetooth type declarations ──────────────────────────────
//
// TypeScript's lib.dom doesn't ship these (Web Bluetooth is a separate spec).
// We declare only the subset we actually use so this file typechecks without
// pulling in `@types/web-bluetooth` as a dependency. Runtime feature
// detection (`isWebBluetoothSupported`) handles browsers that lack the API.

type BluetoothServiceUUID = number | string;
type BluetoothCharacteristicUUID = number | string;

interface BluetoothRemoteGATTCharacteristic {
  readonly properties: {
    readonly write: boolean;
    readonly writeWithoutResponse: boolean;
  };
  writeValueWithResponse(value: BufferSource): Promise<void>;
  writeValueWithoutResponse(value: BufferSource): Promise<void>;
}

interface BluetoothRemoteGATTService {
  getCharacteristics(
    characteristic?: BluetoothCharacteristicUUID,
  ): Promise<BluetoothRemoteGATTCharacteristic[]>;
}

interface BluetoothRemoteGATTServer {
  readonly connected: boolean;
  connect(): Promise<BluetoothRemoteGATTServer>;
  disconnect(): void;
  getPrimaryService(service: BluetoothServiceUUID): Promise<BluetoothRemoteGATTService>;
}

interface BluetoothDevice {
  readonly id: string;
  readonly name?: string;
  readonly gatt?: BluetoothRemoteGATTServer;
}

interface RequestDeviceOptions {
  acceptAllDevices?: boolean;
  filters?: { services?: BluetoothServiceUUID[]; name?: string; namePrefix?: string }[];
  optionalServices?: BluetoothServiceUUID[];
}

interface Bluetooth {
  requestDevice(options?: RequestDeviceOptions): Promise<BluetoothDevice>;
  getDevices?(): Promise<BluetoothDevice[]>;
}

declare global {
  interface Navigator {
    readonly bluetooth?: Bluetooth;
  }
}

/**
 * GATT service UUIDs that common thermal printers expose for their
 * transparent-serial / printer-write characteristic. The browser device
 * picker only shows devices that advertise at least one of these (or are
 * matched by `acceptAllDevices`), and only the listed services are
 * available on the resulting `BluetoothRemoteGATTServer`.
 *
 * The list covers the major Chinese OEM chipsets — if a printer doesn't
 * surface a writable characteristic after pairing, add its service UUID
 * here.
 */
const PRINTER_SERVICES: BluetoothServiceUUID[] = [
  '000018f0-0000-1000-8000-00805f9b34fb', // Generic thermal printer
  '0000ff00-0000-1000-8000-00805f9b34fb', // Goojprt / Xprinter
  '0000ffe0-0000-1000-8000-00805f9b34fb', // HM-10 style
  '49535343-fe7d-4ae5-8fa9-9fafd205e455', // Microsoft IDE-style
  '6e400001-b5a3-f393-e0a9-e50e24dcca9e', // Nordic UART
];

export interface PairedPrinter {
  /** Stable device ID from the browser (opaque, per-origin). */
  id: string;
  /** Display name shown in the device picker. */
  name: string;
}

export function isWebBluetoothSupported(): boolean {
  return typeof navigator !== 'undefined' && !!navigator.bluetooth;
}

/**
 * Opens the browser's device picker so the user can choose a paired (or
 * advertising) Bluetooth printer. Must be invoked from a click handler.
 *
 * Returns null if the user cancelled the picker.
 */
function getBluetooth(): Bluetooth {
  const bt = navigator.bluetooth;
  if (!bt) throw new Error('Web Bluetooth is not supported in this browser');
  return bt;
}

export async function requestPrinter(): Promise<PairedPrinter | null> {
  const bt = getBluetooth();
  try {
    const device = await bt.requestDevice({
      acceptAllDevices: true,
      optionalServices: PRINTER_SERVICES,
    });
    return { id: device.id, name: device.name ?? 'Unknown printer' };
  } catch (err) {
    // User cancelled the picker → NotFoundError. Treat as benign.
    if (err instanceof Error && err.name === 'NotFoundError') return null;
    throw err;
  }
}

/**
 * Resolves a live `BluetoothDevice` for the given paired printer. Chrome 113+
 * returns previously-permitted devices from `getDevices()` so we can
 * reconnect across sessions without re-prompting. If the device isn't found
 * (older Chrome, permission revoked, different browser), we fall through to
 * a re-pair — which requires a user gesture, so callers should invoke from
 * a click handler.
 */
async function resolveDevice(printer: PairedPrinter): Promise<BluetoothDevice> {
  const bt = getBluetooth();
  if (bt.getDevices) {
    try {
      const granted = await bt.getDevices();
      const match = granted.find((d) => d.id === printer.id);
      if (match) return match;
    } catch {
      // ignore — fall through to re-prompt
    }
  }
  // No previously-granted match → ask the user to pick again.
  return bt.requestDevice({
    acceptAllDevices: true,
    optionalServices: PRINTER_SERVICES,
  });
}

/**
 * Walk the printer's GATT services and return the first characteristic
 * that supports write or writeWithoutResponse. Different printers expose
 * different UUIDs so we can't hardcode one.
 */
async function findWritableCharacteristic(
  server: BluetoothRemoteGATTServer,
): Promise<BluetoothRemoteGATTCharacteristic> {
  for (const uuid of PRINTER_SERVICES) {
    try {
      const service = await server.getPrimaryService(uuid);
      const chars = await service.getCharacteristics();
      for (const c of chars) {
        if (c.properties.write || c.properties.writeWithoutResponse) {
          return c;
        }
      }
    } catch {
      // Service not on this device — try the next.
    }
  }
  throw new Error(
    'No writable characteristic found on this printer. Add its service UUID to PRINTER_SERVICES.',
  );
}

/**
 * Send raw ESC/POS bytes to the printer. Chunked to 100-byte writes to
 * stay under the conservative BLE MTU (some printers drop packets larger
 * than 128 bytes; 100 has been the safe maximum across the cheap OEMs).
 */
async function writeBytes(
  characteristic: BluetoothRemoteGATTCharacteristic,
  bytes: Uint8Array,
): Promise<void> {
  const CHUNK = 100;
  const useWithoutResponse =
    characteristic.properties.writeWithoutResponse && !characteristic.properties.write;
  for (let offset = 0; offset < bytes.length; offset += CHUNK) {
    const slice = bytes.slice(offset, offset + CHUNK);
    if (useWithoutResponse) {
      await characteristic.writeValueWithoutResponse(slice);
    } else {
      await characteristic.writeValueWithResponse(slice);
    }
  }
}

async function withConnection<T>(
  printer: PairedPrinter,
  fn: (characteristic: BluetoothRemoteGATTCharacteristic) => Promise<T>,
): Promise<T> {
  const device = await resolveDevice(printer);
  if (!device.gatt) throw new Error('GATT unavailable on this device');
  const server = await device.gatt.connect();
  try {
    const char = await findWritableCharacteristic(server);
    return await fn(char);
  } finally {
    try {
      device.gatt.disconnect();
    } catch {
      // best-effort
    }
  }
}

export async function printReceiptToBluetooth(
  printer: PairedPrinter,
  data: ReceiptData,
): Promise<void> {
  const bytes = encodeReceipt(data);
  await withConnection(printer, (char) => writeBytes(char, bytes));
}

export async function testPrint(printer: PairedPrinter): Promise<void> {
  const bytes = encodeTestPrint(printer.name);
  await withConnection(printer, (char) => writeBytes(char, bytes));
}
