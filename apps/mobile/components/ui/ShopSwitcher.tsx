import { useState } from 'react';
import { Modal, Pressable, Text, View } from 'react-native';
import { useQueryClient } from '@tanstack/react-query';
import { useShopStore, useCurrentShop } from '../../store/shop.store';
import { useOfflineStore } from '../../store/offline.store';
import { useT } from '../../lib/i18n';
import { Icon } from './Icon';
import { showAlert } from '../../lib/alert';

/**
 * Header chip that picks the branch this phone works in.
 *
 * Renders nothing for an employee (including a mini) — they work at exactly
 * one branch — and nothing at a single-branch business, so a merchant with one
 * shop never learns the word.
 *
 * Switching is refused while offline mode is on: the cached product snapshot
 * belongs to the branch it was taken at, and selling it under another branch
 * would sell stock that is not on that branch's shelf. Queued rows are safe
 * either way — each carries the branch it was recorded at.
 */
export function ShopSwitcher() {
  const t = useT();
  const qc = useQueryClient();
  const { shops, employed, setShop } = useShopStore();
  const current = useCurrentShop();
  const isOffline = useOfflineStore((s) => s.isOffline);
  const [open, setOpen] = useState(false);

  const active = shops.filter((s) => !s.isArchived);
  if (employed || active.length <= 1) return null;

  const openPicker = (): void => {
    if (isOffline) {
      showAlert(t.shops.offlineLockedTitle, t.shops.offlineLockedBody);
      return;
    }
    setOpen(true);
  };

  const choose = async (shopId: string): Promise<void> => {
    setOpen(false);
    if (shopId === current?.id) return;
    await setShop(shopId);
    // Reset, not invalidate: a stale list from the previous branch must not
    // paint under the new branch's name while the refetch is in flight.
    qc.resetQueries();
  };

  return (
    <>
      <Pressable
        onPress={openPicker}
        className="flex-row items-center gap-1 px-2.5 py-1 rounded-full bg-card border border-border"
        accessibilityLabel={t.shops.switchTitle}
      >
        <Icon name="map-pin" size={12} tone="muted" />
        <Text numberOfLines={1} className="text-xs font-semibold max-w-[110px] text-muted">
          {current?.name ?? t.shops.branch}
        </Text>
        <Text className="text-[10px] text-muted">▾</Text>
      </Pressable>

      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <Pressable
          className="flex-1 bg-black/40 items-center justify-center px-6"
          onPress={() => setOpen(false)}
        >
          <Pressable
            className="bg-card border border-border rounded-2xl w-full max-w-sm overflow-hidden"
            onPress={(e) => e.stopPropagation()}
          >
            <View className="px-4 py-3 border-b border-border">
              <Text className="text-xs font-semibold uppercase tracking-wider text-muted">
                {t.shops.switchTitle}
              </Text>
            </View>
            {active.map((shop, i) => {
              const selected = shop.id === current?.id;
              return (
                <Pressable
                  key={shop.id}
                  onPress={() => void choose(shop.id)}
                  className={`flex-row items-start gap-3 px-4 py-3.5 ${i > 0 ? 'border-t border-border' : ''} ${
                    selected ? 'bg-surface' : ''
                  }`}
                >
                  <View className="mt-0.5"><Icon name="map-pin" size={18} /></View>
                  <View className="flex-1">
                    <Text className="text-sm font-semibold text-text">
                      {shop.name}
                      {shop.isDefault ? `  · ${t.shops.defaultBranch}` : ''}
                    </Text>
                    {!!shop.address && (
                      <Text className="text-xs text-muted mt-0.5">{shop.address}</Text>
                    )}
                  </View>
                  {selected && <Icon name="check" size={18} tone="primary" />}
                </Pressable>
              );
            })}
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}
