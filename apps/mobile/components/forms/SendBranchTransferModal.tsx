import { useMemo, useState } from 'react';
import { View, Text, Modal, ScrollView, TouchableOpacity, TextInput, Pressable, Alert } from 'react-native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { branchTransfersApi, custodyApi, inventoryApi } from '../../lib/api';
import { QK } from '../../lib/query-keys';
import { Button } from '../ui/Button';
import { getErrorMessage } from '../../lib/utils';
import { useT } from '../../lib/i18n';
import { useBrand } from '../../lib/theme';

interface Props {
  visible: boolean;
  /** Owner sends off the unassigned shelf; a custodian sends out of their own volume. */
  isOwner: boolean;
  onClose: () => void;
}

/** A simple product, or one size of a sized product. */
interface PickOption {
  key: string;
  productName: string;
  variantId: string | null;
  label: string;
  available: number;
}

interface Line {
  key: string;
  quantity: string;
}

export function SendBranchTransferModal({ visible, isOwner, onClose }: Props) {
  const t = useT();
  const brand = useBrand();
  const qc = useQueryClient();
  const [toShopId, setToShopId] = useState('');
  const [lines, setLines] = useState<Line[]>([{ key: '', quantity: '' }]);
  const [picking, setPicking] = useState<number | null>(null);
  const [note, setNote] = useState('');

  const { data: destinations } = useQuery({
    queryKey: QK.branchDestinations,
    queryFn: branchTransfersApi.destinations,
    enabled: visible,
  });
  const { data: products } = useQuery({
    queryKey: QK.inventoryProducts,
    queryFn: inventoryApi.listProducts,
    enabled: visible && isOwner,
  });
  const { data: mine } = useQuery({
    queryKey: QK.custodyMine,
    queryFn: custodyApi.mine,
    enabled: visible && !isOwner,
  });

  const options = useMemo((): PickOption[] => {
    if (!isOwner) {
      return (mine?.lines ?? [])
        .filter((l) => l.quantityRemaining > 0)
        .map((l) => ({
          key: l.variantId ?? l.productName,
          productName: l.productName,
          variantId: l.variantId,
          label: l.variantLabel ? `${l.productName} — ${l.variantLabel}` : l.productName,
          available: l.quantityRemaining,
        }));
    }
    const out: PickOption[] = [];
    for (const p of products ?? []) {
      if (p.kind === 'group' && p.variants?.length) {
        for (const v of p.variants) {
          if (v.available > 0) {
            out.push({
              key: v.variantId,
              productName: p.productName,
              variantId: v.variantId,
              label: `${p.productName} — ${v.label}`,
              available: v.available,
            });
          }
        }
      } else if (p.totalAvailable > 0) {
        out.push({
          key: p.productName,
          productName: p.productName,
          variantId: null,
          label: p.productName,
          available: p.totalAvailable,
        });
      }
    }
    return out.sort((a, b) => a.label.localeCompare(b.label));
  }, [isOwner, mine, products]);
  const byKey = useMemo(() => new Map(options.map((o) => [o.key, o])), [options]);
  const toName = destinations?.find((d) => d.shopId === toShopId)?.name ?? '';

  const reset = (): void => {
    setToShopId('');
    setLines([{ key: '', quantity: '' }]);
    setNote('');
    setPicking(null);
  };

  const send = useMutation({
    mutationFn: () =>
      branchTransfersApi.send({
        toShopId,
        items: lines
          .filter((l) => l.key && parseInt(l.quantity, 10) > 0)
          .map((l) => {
            const o = byKey.get(l.key)!;
            return {
              productName: o.productName,
              quantity: parseInt(l.quantity, 10),
              ...(o.variantId ? { variantId: o.variantId } : {}),
            };
          }),
        ...(note.trim() ? { note: note.trim() } : {}),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: QK.branchTransfersAll });
      qc.invalidateQueries({ queryKey: ['inventory'] });
      qc.invalidateQueries({ queryKey: ['custody'] });
      Alert.alert(t.branchTransfers.sentTitle, t.branchTransfers.sentBody(toName));
      reset();
      onClose();
    },
    onError: (e) => Alert.alert(t.branchTransfers.actionFailed, getErrorMessage(e)),
  });

  const submit = (): void => {
    if (!toShopId) return Alert.alert(t.branchTransfers.sendTitle, t.branchTransfers.errDestination);
    const filled = lines.filter((l) => l.key && parseInt(l.quantity, 10) > 0);
    if (filled.length === 0) return Alert.alert(t.branchTransfers.sendTitle, t.branchTransfers.errLines);
    const seen = new Set<string>();
    for (const l of filled) {
      const o = byKey.get(l.key);
      if (!o) return Alert.alert(t.branchTransfers.sendTitle, t.branchTransfers.errLines);
      if (seen.has(l.key)) return Alert.alert(t.branchTransfers.sendTitle, t.branchTransfers.errDuplicate(o.label));
      seen.add(l.key);
      if (parseInt(l.quantity, 10) > o.available) {
        return Alert.alert(t.branchTransfers.sendTitle, t.branchTransfers.errTooMany(o.label, o.available));
      }
    }
    send.mutate();
  };

  const setLine = (i: number, patch: Partial<Line>): void =>
    setLines((ls) => ls.map((l, j) => (j === i ? { ...l, ...patch } : l)));

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <ScrollView className="flex-1 bg-background" contentContainerClassName="px-6 py-8" keyboardShouldPersistTaps="handled">
        <View className="flex-row justify-between items-center mb-2">
          <Text className="font-display text-2xl text-text">{t.branchTransfers.sendTitle}</Text>
          <TouchableOpacity onPress={onClose}>
            <Text className="text-primary font-medium">{t.common.cancel}</Text>
          </TouchableOpacity>
        </View>
        <Text className="text-muted text-xs mb-5">{t.branchTransfers.sendSub}</Text>

        <Text className="font-mono text-[10px] uppercase tracking-widest text-muted mb-2">{t.branchTransfers.destination}</Text>
        {destinations && destinations.length === 0 ? (
          <Text className="text-muted text-sm mb-5">{t.branchTransfers.noDestinations}</Text>
        ) : (
          <View className="flex-row flex-wrap gap-2 mb-5">
            {(destinations ?? []).map((d) => (
              <Pressable
                key={d.shopId}
                onPress={() => setToShopId(d.shopId)}
                className={`px-4 py-2 rounded-full border ${
                  toShopId === d.shopId ? 'bg-primary border-primary' : 'bg-card border-border'
                }`}
              >
                <Text className={toShopId === d.shopId ? 'text-white text-sm' : 'text-text text-sm'}>{d.name}</Text>
              </Pressable>
            ))}
          </View>
        )}

        {lines.map((line, i) => {
          const picked = byKey.get(line.key);
          return (
            <View key={i} className="bg-card border border-border rounded-xl p-3 mb-3">
              <Pressable onPress={() => setPicking(picking === i ? null : i)} className="py-1">
                <Text className={picked ? 'text-text font-medium' : 'text-muted'}>
                  {picked ? picked.label : t.branchTransfers.pickProduct} ▾
                </Text>
                {picked && <Text className="text-muted text-xs mt-0.5">{t.branchTransfers.available(picked.available)}</Text>}
              </Pressable>
              {picking === i && (
                <View className="mt-2 border-t border-border pt-2">
                  {options.map((o) => (
                    <Pressable
                      key={o.key}
                      onPress={() => {
                        setLine(i, { key: o.key });
                        setPicking(null);
                      }}
                      className="py-2 flex-row justify-between"
                    >
                      <Text className="text-text text-sm flex-1">{o.label}</Text>
                      <Text className="text-muted text-xs">{o.available}</Text>
                    </Pressable>
                  ))}
                </View>
              )}
              <View className="flex-row items-center mt-2 gap-2">
                <Text className="text-muted text-xs">{t.branchTransfers.quantity}</Text>
                <TextInput
                  value={line.quantity}
                  onChangeText={(v) => setLine(i, { quantity: v.replace(/[^0-9]/g, '') })}
                  keyboardType="number-pad"
                  placeholder="0"
                  placeholderTextColor={brand.mutedSubtle}
                  className="flex-1 border rounded-lg px-3 py-2 text-text bg-background border-border"
                />
                {lines.length > 1 && (
                  <TouchableOpacity onPress={() => setLines((ls) => ls.filter((_, j) => j !== i))}>
                    <Text className="text-danger text-lg px-2">✕</Text>
                  </TouchableOpacity>
                )}
              </View>
            </View>
          );
        })}
        <TouchableOpacity onPress={() => setLines((ls) => [...ls, { key: '', quantity: '' }])} className="mb-5">
          <Text className="text-primary font-semibold text-sm">{t.branchTransfers.addLine}</Text>
        </TouchableOpacity>

        <Text className="font-mono text-[10px] uppercase tracking-widest text-muted mb-2">{t.branchTransfers.note}</Text>
        <TextInput
          value={note}
          onChangeText={setNote}
          maxLength={500}
          placeholderTextColor={brand.mutedSubtle}
          className="border rounded-2xl px-4 py-3.5 text-text bg-card border-border mb-6"
        />

        <Button label={t.branchTransfers.sendSubmit} onPress={submit} loading={send.isPending} />
      </ScrollView>
    </Modal>
  );
}
