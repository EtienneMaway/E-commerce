import { ActivityIndicator, Text, View } from 'react-native';
import { useT } from '../../lib/i18n';
import { useBrand } from '../../lib/theme';

interface Props {
  readonly isFetchingNextPage: boolean;
  readonly hasNextPage: boolean;
  /** True when more pages exist but the device is offline. */
  readonly offline: boolean;
  /** Rows on screen — the end marker only shows on a list long enough to scroll. */
  readonly count: number;
}

/** Bottom of an infinite list: loading more, offline hint, or the end. */
export function ListFooter({ isFetchingNextPage, hasNextPage, offline, count }: Props) {
  const t = useT();
  const brand = useBrand();
  if (isFetchingNextPage) {
    return (
      <View className="py-5 flex-row items-center justify-center gap-2">
        <ActivityIndicator color={brand.primary} />
        <Text className="text-muted text-xs">{t.common.loadingMore}</Text>
      </View>
    );
  }
  if (hasNextPage && offline) {
    return <Text className="text-muted text-xs text-center py-5">{t.common.connectToLoadMore}</Text>;
  }
  if (!hasNextPage && count >= 10) {
    return <Text className="text-muted text-xs text-center py-5">{t.common.endOfList}</Text>;
  }
  return null;
}
