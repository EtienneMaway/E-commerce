import { Modal, Platform, View, type ModalProps } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

/**
 * The full-screen form sheet every mutation form opens in (`pageSheet`).
 *
 * On iOS a pageSheet is inset by the system. On Android it is a full-window
 * dialog, and with edge-to-edge (Android 15+) that window runs under the status
 * bar and the navigation bar — the form title sat under the clock and the last
 * button under the gesture bar. This pads by the real insets on Android only.
 * The insets come from the app's root SafeAreaProvider, which is what the
 * dialog window covers.
 */
export function FormModal({ children, ...props }: ModalProps) {
  const insets = useSafeAreaInsets();
  const android = Platform.OS === 'android';
  return (
    <Modal animationType="slide" presentationStyle="pageSheet" {...props}>
      <View
        className="flex-1 bg-background"
        style={android ? { paddingTop: insets.top, paddingBottom: insets.bottom } : undefined}
      >
        {children}
      </View>
    </Modal>
  );
}
