/**
 * Minimal type shim for `@mitsuharu/react-native-sunmi-printer-library`.
 *
 * The library ships its own .d.ts when installed, which takes precedence over
 * this file. We keep a stub here so the codebase typechecks before the package
 * is installed — preventing CI from going red on a fresh clone that hasn't run
 * `pnpm install` yet.
 *
 * Only the subset of the API we actually use is typed.
 */
declare module '@mitsuharu/react-native-sunmi-printer-library' {
  /**
   * Connects + initializes the built-in printer. Must be called before any
   * print call; safe to call again before every print (it just resets style
   * state, which our raw ESC/POS stream re-initializes anyway).
   */
  export function prepare(): Promise<boolean>;

  /** Sends raw ESC/POS bytes (base64-encoded) straight to the printer. */
  export function sendRAWData(base64: string): Promise<void>;

  export interface PrinterInfo {
    serialNumber: string;
    printerVersion: string;
    serviceVersion: string;
    printerModal: string;
    paperWidth: string;
    pixelWidth: number;
  }

  export function getPrinterInfo(): Promise<PrinterInfo>;
}
