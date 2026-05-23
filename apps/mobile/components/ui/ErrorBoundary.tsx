import { Component, ReactNode } from 'react';
import { View, Text, Pressable, ScrollView } from 'react-native';
import Constants from 'expo-constants';

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
  componentStack: string | null;
}

/**
 * Global error boundary. Catches uncaught render-time exceptions anywhere in
 * the React tree so the app shows a recovery screen instead of a white crash.
 * Production builds funnel into here even if `__DEV__` is false — without it,
 * a single bad render kills the JS bundle silently.
 *
 * Lifecycle hooks (`useEffect`, async callbacks) aren't covered by error
 * boundaries — those are responsible for their own try/catch.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null, componentStack: null };

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { error };
  }

  componentDidCatch(error: Error, info: { componentStack: string }): void {
    // Keep this in production logs; a remote sink (Sentry etc.) can hook here later.
    // eslint-disable-next-line no-console
    console.error('[ErrorBoundary]', error, info.componentStack);
    this.setState({ componentStack: info.componentStack });
  }

  private handleReset = () => {
    this.setState({ error: null, componentStack: null });
  };

  render() {
    if (!this.state.error) return this.props.children;

    const appVersion =
      Constants.expoConfig?.version ?? Constants.nativeAppVersion ?? '—';
    const buildVersion = Constants.nativeBuildVersion ?? '—';

    return (
      <View className="flex-1 bg-white dark:bg-black">
        <ScrollView
          contentContainerClassName="flex-grow justify-center p-6"
          keyboardShouldPersistTaps="handled"
        >
          <View className="items-center mb-6">
            <Text className="text-5xl mb-2">😕</Text>
            <Text className="text-lg font-bold text-center text-black dark:text-white">
              Something went wrong
            </Text>
            <Text className="text-sm text-center mt-2 text-neutral-600 dark:text-neutral-400">
              The app hit an unexpected error. Tap below to retry. If this keeps
              happening, please report it with the details below.
            </Text>
          </View>

          <View className="rounded-xl bg-neutral-100 dark:bg-neutral-900 p-3 mb-4">
            <Text className="text-xs font-semibold text-neutral-500 mb-1">
              ERROR
            </Text>
            <Text className="text-xs font-mono text-red-700 dark:text-red-400" selectable>
              {this.state.error.message || String(this.state.error)}
            </Text>
            {this.state.componentStack && (
              <>
                <Text className="text-xs font-semibold text-neutral-500 mt-3 mb-1">
                  COMPONENT STACK
                </Text>
                <Text className="text-xs font-mono text-neutral-700 dark:text-neutral-300" selectable>
                  {this.state.componentStack.trim().split('\n').slice(0, 6).join('\n')}
                </Text>
              </>
            )}
            <Text className="text-xs font-semibold text-neutral-500 mt-3 mb-1">
              VERSION
            </Text>
            <Text className="text-xs font-mono text-neutral-700 dark:text-neutral-300" selectable>
              {appVersion} ({buildVersion})
            </Text>
          </View>

          <Pressable
            onPress={this.handleReset}
            className="bg-blue-600 active:bg-blue-700 rounded-xl py-3 px-6"
          >
            <Text className="text-white font-semibold text-center">Try again</Text>
          </Pressable>
        </ScrollView>
      </View>
    );
  }
}
