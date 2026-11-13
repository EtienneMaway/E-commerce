import { useMemo, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, TextInput, Pressable } from 'react-native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { branchTransfersApi, custodyApi, inventoryApi } from '../../lib/api';
import { QK } from '../../lib/query-keys';
import { Button } from '../ui/Button';
import { getErrorMessage } from '../../lib/utils';
import { useT } from '../../lib/i18n';
import { useBrand } from '../../lib/theme';
import { showAlert } from '../../lib/alert';
import { FormModal } from '../ui/FormModal';
import { Icon } from '../ui/Icon';
import { ProductPickerSheet } from './ProductPickerSheet';
import {
  emptyPick,
  fromProductList,
  fromVolumeLines,
  hasCartons,
  maxCartons,
  maxWholePieces,
  resolvePick,
  splitCartons,
  type PickIssue,
  type PickProduct,
  type PickState,
} from '../../lib/transfer-pick';

interface Props {
  visible: boolean;
  /** Owner sends off the unassigned shelf; a custodian sends out of their own volume. */
  isOwner: boolean;
  onClose: () => void;
}

type T = ReturnType<typeof useT>;

function issueText(t: T, issue: PickIssue): string {
  const b = t.branchTransfers;
  switch (issue.kind) {
    case 'empty':
      return issue.size ? b.issueEmptySize(issue.size) : b.issueEmpty;
    case 'noSizes':
      return b.issueNoSizes;
    case 'tooManyPieces':
      return issue.size ? b.issueTooManyPiecesSize(issue.size, issue.max) : b.issueTooManyPieces(issue.max);
    case 'tooManyCartons':
      return b.issueTooManyCartons(issue.max);
    case 'tooManyCombined':
      return b.issueTooManyCombined(issue.size, issue.max);
  }
}

const digits = (v: string): string => v.replace(/[^0-9]/g, '');

export function SendBranchTransferModal({ visible, isOwner, onClose }: Props) {
  const t = useT();
  const brand = useBrand();
  const qc = useQueryClient();
  const [toShopId, setToShopId] = useState('');
  const [picks, setPicks] = useState<{ key: string; state: PickState }[]>([]);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [note, setNote] = useState('');
  const [tried, setTried] = useState(false);

  const { data: destinations } = useQuery({
    queryKey: QK.branchDestinations,
    queryFn: branchTransfersApi.destinations,
    enabled: visible,
  });
  const { data: products, isLoading: productsLoading } = useQuery({
    queryKey: QK.inventoryProducts,
    queryFn: inventoryApi.listProducts,
    enabled: visible && isOwner,
  });
  const { data: mine, isLoading: mineLoading } = useQuery({
    queryKey: QK.custodyMine,
    queryFn: custodyApi.mine,
    enabled: visible && !isOwner,
  });

  const catalog = useMemo(
    (): PickProduct[] => (isOwner ? fromProductList(products ?? []) : fromVolumeLines(mine?.lines ?? [])),
    [isOwner, mine, products],
  );
  const byKey = useMemo(() => new Map(catalog.map((p) => [p.key, p])), [catalog]);
  const rows = picks
    .map((pk) => ({ ...pk, product: byKey.get(pk.key) }))
    .filter((r): r is typeof r & { product: PickProduct } => !!r.product)
    .map((r) => ({ ...r, resolved: resolvePick(r.product, r.state) }));
  const totalUnits = rows.reduce((n, r) => n + r.resolved.units, 0);
  const picked = new Set(picks.map((p) => p.key));

  /** Apply the sheet's selection: keep typed quantities of products still picked. */
  const applyPicker = (keys: string[]): void => {
    setPicks((ps) => {
      const keep = ps.filter((p) => keys.includes(p.key));
      const added = keys.filter((k) => !ps.some((p) => p.key === k)).map((key) => ({ key, state: emptyPick() }));
      return [...keep, ...added];
    });
    setPickerOpen(false);
  };
  const toName = destinations?.find((d) => d.shopId === toShopId)?.name ?? '';

  const toggle = (key: string): void =>
    setPicks((ps) => (ps.some((p) => p.key === key) ? ps.filter((p) => p.key !== key) : [...ps, { key, state: emptyPick() }]));
  const patch = (key: string, next: Partial<PickState>): void =>
    setPicks((ps) => ps.map((p) => (p.key === key ? { ...p, state: { ...p.state, ...next } } : p)));

  const reset = (): void => {
    setToShopId('');
    setPicks([]);
    setPickerOpen(false);
    setNote('');
    setTried(false);
  };

  const send = useMutation({
    mutationFn: () =>
      branchTransfersApi.send({
        toShopId,
        items: rows.flatMap((r) => r.resolved.items),
        ...(note.trim() ? { note: note.trim() } : {}),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: QK.branchTransfersAll });
      qc.invalidateQueries({ queryKey: ['inventory'] });
      qc.invalidateQueries({ queryKey: ['custody'] });
      showAlert(t.branchTransfers.sentTitle, t.branchTransfers.sentBody(toName));
      reset();
      onClose();
    },
    onError: (e) => showAlert(t.branchTransfers.actionFailed, getErrorMessage(e)),
  });

  const submit = (): void => {
    setTried(true);
    if (!toShopId) return showAlert(t.branchTransfers.sendTitle, t.branchTransfers.errDestination);
    if (rows.length === 0) return showAlert(t.branchTransfers.sendTitle, t.branchTransfers.errLines);
    if (rows.some((r) => r.resolved.issue)) return showAlert(t.branchTransfers.sendTitle, t.branchTransfers.errFix);
    send.mutate();
  };

  const field = 'border rounded-xl px-3 py-2.5 text-text bg-background border-border';

  return (
    <FormModal visible={visible} onRequestClose={onClose}>
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

        {/* Product chooser: opens a searchable, paged sheet */}
        <Text className="font-mono text-[10px] uppercase tracking-widest text-muted mb-2">{t.branchTransfers.pickProducts}</Text>
        <Pressable
          onPress={() => setPickerOpen(true)}
          className={`flex-row items-center justify-between border rounded-2xl px-4 py-3.5 bg-card mb-1 ${picks.length ? 'border-primary' : 'border-border'}`}
        >
          <Text className={picks.length ? 'text-text' : 'text-muted'}>
            {picks.length ? t.branchTransfers.changeSelection(picks.length) : t.branchTransfers.chooseProducts}
          </Text>
          <Icon name="chevron-right" size={18} tone="muted" />
        </Pressable>
        {tried && picks.length === 0 ? (
          <Text className="text-danger text-[12px] font-semibold mb-3">{t.branchTransfers.errLines}</Text>
        ) : (
          <View className="mb-3" />
        )}

        {rows.map(({ key, product: p, state: s, resolved }) => {
          const issue = resolved.issue;
          const show = issue && (tried || (issue.kind !== 'empty' && issue.kind !== 'noSizes'));
          const whole = p.kind === 'simple' || s.mode === 'whole';
          return (
            <View key={key} className={`bg-card border rounded-2xl p-4 mb-3 ${show ? 'border-danger' : 'border-border'}`}>
              <View className="flex-row justify-between items-start">
                <View className="flex-1 pr-2">
                  <Text className="font-display text-[17px] text-text capitalize">{p.productName}</Text>
                  <Hint t={t} p={p} />
                </View>
                <TouchableOpacity onPress={() => toggle(key)} hitSlop={10}>
                  <Icon name="x" size={18} tone="muted" />
                </TouchableOpacity>
              </View>

              {p.kind === 'group' && (
                <View className="flex-row bg-surface rounded-full p-1 mt-3 self-start">
                  {(['whole', 'split'] as const).map((m) => (
                    <Pressable
                      key={m}
                      onPress={() => patch(key, { mode: m })}
                      className={`px-3.5 py-1.5 rounded-full ${s.mode === m ? 'bg-card' : ''}`}
                    >
                      <Text className={`text-xs font-semibold ${s.mode === m ? 'text-text' : 'text-muted'}`}>
                        {m === 'whole' ? t.branchTransfers.modeWhole : t.branchTransfers.modeSplit}
                      </Text>
                    </Pressable>
                  ))}
                </View>
              )}

              {whole ? (
                <View className="flex-row gap-3 mt-3">
                  {hasCartons(p) && (
                    <View className="flex-1">
                      <Text className="text-muted text-[11px] mb-1">{t.branchTransfers.cartons}</Text>
                      <TextInput value={s.cartons} onChangeText={(v) => patch(key, { cartons: digits(v) })} keyboardType="number-pad" placeholder="0" placeholderTextColor={brand.mutedSubtle} className={field} />
                    </View>
                  )}
                  <View className="flex-1">
                    <Text className="text-muted text-[11px] mb-1">{t.branchTransfers.pieces}</Text>
                    <TextInput value={s.pieces} onChangeText={(v) => patch(key, { pieces: digits(v) })} keyboardType="number-pad" placeholder="0" placeholderTextColor={brand.mutedSubtle} className={field} />
                  </View>
                </View>
              ) : (
                <View className="mt-3">
                  <Text className="text-muted text-[11px] mb-2">{t.branchTransfers.splitHint}</Text>
                  {p.sizes.map((z) => {
                    const on = !!s.sizeOn[z.variantId];
                    return (
                      <View key={z.variantId} className="flex-row items-center gap-3 mb-2">
                        <Pressable
                          onPress={() => patch(key, { sizeOn: { ...s.sizeOn, [z.variantId]: !on } })}
                          className="flex-row items-center gap-3 flex-1"
                        >
                          <View className={`w-5 h-5 rounded-md items-center justify-center border ${on ? 'bg-primary border-primary' : 'border-muted-subtle'}`}>
                            {on && <Icon name="check" size={13} color="#FFFFFF" />}
                          </View>
                          <Text className="text-text text-sm">
                            {z.label} <Text className="text-muted text-xs">· {t.branchTransfers.availPieces(z.available)}</Text>
                          </Text>
                        </Pressable>
                        <TextInput
                          value={s.sizePieces[z.variantId] ?? ''}
                          editable={on}
                          onChangeText={(v) => patch(key, { sizePieces: { ...s.sizePieces, [z.variantId]: digits(v) } })}
                          keyboardType="number-pad"
                          placeholder={t.branchTransfers.pieces}
                          placeholderTextColor={brand.mutedSubtle}
                          className={`${field} w-24 ${on ? '' : 'opacity-40'}`}
                        />
                      </View>
                    );
                  })}
                </View>
              )}

              {!issue && resolved.units > 0 ? (
                <Text className="text-primary text-[12px] mt-2">
                  {p.kind === 'group' && s.mode === 'whole'
                    ? `${t.branchTransfers.eachGets}: ${resolved.items
                        .map((it) => `${p.sizes.find((z) => z.variantId === it.variantId)?.label} ${it.quantity}`)
                        .join(' · ')}`
                    : t.branchTransfers.willSend(resolved.units)}
                </Text>
              ) : null}
              {show && issue ? <Text className="text-danger text-[12px] font-semibold mt-2">{issueText(t, issue)}</Text> : null}
            </View>
          );
        })}
        {totalUnits > 0 && <Text className="text-muted text-xs text-right mb-5">{t.branchTransfers.totalUnits(totalUnits)}</Text>}

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
      <ProductPickerSheet
        visible={pickerOpen}
        catalog={catalog}
        loading={isOwner ? productsLoading : mineLoading}
        selected={picked}
        onDone={applyPicker}
        onClose={() => setPickerOpen(false)}
      />
    </FormModal>
  );
}

/** Availability under a product's name: pieces (and cartons), or each size's stock. */
function Hint({ t, p }: { t: T; p: PickProduct }) {
  const b = t.branchTransfers;
  if (p.kind === 'simple') {
    const c = splitCartons(p.available, p.piecesPerCarton);
    return (
      <Text className="text-muted text-xs mt-0.5">
        {b.availPieces(p.available)}
        {c ? ` ${b.availAsCartons(c.cartons, c.rest)} · ${b.perCarton(p.piecesPerCarton)}` : ''}
      </Text>
    );
  }
  return (
    <View className="mt-1">
      <View className="flex-row flex-wrap gap-1">
        {p.sizes.map((z) => (
          <View key={z.variantId} className="bg-surface rounded-md px-1.5 py-0.5">
            <Text className="text-text-secondary text-[11px]">
              {z.label} {z.available}
              {z.piecesPerCarton > 0 ? <Text className="text-muted">{` (${z.piecesPerCarton}/ctn)`}</Text> : null}
            </Text>
          </View>
        ))}
      </View>
      <Text className="text-muted text-[11px] mt-1">
        {b.wholeHint(maxWholePieces(p))}
        {hasCartons(p) ? ` · ${b.wholeCartonHint(maxCartons(p))}` : ''}
      </Text>
    </View>
  );
}

