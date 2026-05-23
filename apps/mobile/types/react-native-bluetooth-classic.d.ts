/**
 * Minimal type shim for `react-native-bluetooth-classic`.
 *
 * The library ships its own .d.ts when installed, which takes precedence over
 * this file. We keep a stub here so the codebase typechecks before the package
 * is installed — preventing CI from going red on a fresh clone that hasn't run
 * `pnpm install` yet.
 *
 * Only the subset of the API we actually use is typed.
 */
declare module 'react-native-bluetooth-classic' {
  export interface BluetoothDevice {
    address: string;
    name?: string;
    write: (data: string, encoding?: 'base64' | 'utf-8' | 'ascii') => Promise<boolean>;
  }

  export interface ConnectOptions {
    connectorType?: 'rfcomm' | 'binary';
  }

  const RNBluetoothClassic: {
    isBluetoothEnabled: () => Promise<boolean>;
    getBondedDevices: () => Promise<BluetoothDevice[]>;
    getConnectedDevices: () => Promise<BluetoothDevice[]>;
    isDeviceConnected: (address: string) => Promise<boolean>;
    connectToDevice: (address: string, options?: ConnectOptions) => Promise<BluetoothDevice>;
    disconnectFromDevice: (address: string) => Promise<boolean>;
  };

  export default RNBluetoothClassic;
}
