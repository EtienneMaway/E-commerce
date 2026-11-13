import { useState } from 'react';
import { RefreshControl, type RefreshControlProps } from 'react-native';

interface Props extends Omit<RefreshControlProps, 'refreshing' | 'onRefresh'> {
  /** Return the refetch promise so the spinner stays until it settles. */
  readonly onRefresh: () => unknown;
}

/**
 * Pull-to-refresh that only spins for a pull the user made.
 *
 * Binding `refreshing` to React Query's `isFetching`/`isRefetching` made
 * Android's white spinner disc drop in by itself on every background refresh
 * (screen focus, reconnect, cache warm-up) — the opposite of "refresh silently
 * behind cached data". Here `refreshing` is local: on while the onRefresh
 * promise runs, off when it settles.
 *
 * ScrollView clones this element and passes `style`/`children`; they ride
 * through `...rest` to the real RefreshControl.
 */
export function PullRefreshControl({ onRefresh, ...rest }: Props) {
  const [pulling, setPulling] = useState(false);
  const handle = async (): Promise<void> => {
    setPulling(true);
    try {
      await onRefresh();
    } finally {
      setPulling(false);
    }
  };
  return <RefreshControl {...rest} refreshing={pulling} onRefresh={() => void handle()} />;
}
