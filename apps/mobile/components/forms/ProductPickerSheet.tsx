import { useMemo, useState } from 'react';
import { Pressable, ScrollView, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useT } from '../../lib/i18n';
import { useBrand } from '../../lib/theme';
import type { PickProduct } from '../../lib/transfer-pick';
import { Button } from '../ui/Button';
import { FormModal } from '../ui/FormModal';
import { Icon } from '../ui/Icon';

const PAGE_SIZE = 10;

interface Props {
  readonly visible: boolean;
  readonly catalog: readonly PickProduct[];
  readonly loading: boolean;
  /** Keys already picked in the form. */
  readonly selected: ReadonlySet<string>;
  /** Called with the full new selection on "Done". */
  readonly onDone: (keys: string[]) => void;
  readonly onClose: () => void;
}

/**
 * The product chooser for the send-transfer form (same as the dashboard's
 * ProductPickerPopup): search + pages of 10, ticks are a draft until "Done".
 * Rendered inside the form's own modal so it stacks on iOS too.
 */
export function ProductPickerSheet({ visible, ...rest }: Props) {
  // Mount fresh on each open so the draft starts from the form's selection.
  return visible ? <PickerBody {...rest} /> : null;
}

function PickerBody({ catalog, loading, selected, onDone, onClose }: Omit<Props, 'visible'>) {
  const t = useT();
  const b = t.branchTransfers;
  const brand = useBrand();
  const [draft, setDraft] = useState<Set<string>>(() => new Set(selected));
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return q ? catalog.filter((p) => p.productName.toLowerCase().includes(q)) : catalog;
  }, [catalog, search]);
  const pages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const current = Math.min(page, pages);
  const start = (current - 1) * PAGE_SIZE;
  const slice = filtered.slice(start, start + PAGE_SIZE);
  const allOnPage = slice.length > 0 && slice.every((p) => draft.has(p.key));

  const toggle = (key: string): void =>
    setDraft((d) => {
      const n = new Set(d);
      if (n.has(key)) n.delete(key);
      else n.add(key);
      return n;
    });
  const togglePage = (): void =>
    setDraft((d) => {
      const n = new Set(d);
      for (const p of slice) {
        if (allOnPage) n.delete(p.key);
        else n.add(p.key);
      }
      return n;
    });

  return (
    <FormModal visible onRequestClose={onClose}>
      <View className="flex-1 px-6 pt-6">
        <View className="flex-row justify-between items-center mb-4">
          <Text className="font-bold text-2xl text-text flex-1 pr-3">{b.pickerTitle}</Text>
          <TouchableOpacity onPress={onClose}>
            <Text className="text-primary font-medium">{t.common.cancel}</Text>
          </TouchableOpacity>
        </View>

        <View className="flex-row items-center border rounded-2xl px-4 bg-card border-border">
          <Icon name="search" size={16} tone="muted" />
          <TextInput
            value={search}
            onChangeText={(v) => {
              setSearch(v);
              setPage(1);
            }}
            autoFocus
            placeholder={b.searchProducts}
            placeholderTextColor={brand.mutedSubtle}
            className="flex-1 py-3 px-2 text-text"
          />
        </View>

        <View className="flex-row justify-between items-center mt-3 mb-2">
          <Text className="text-muted text-xs">
            {filtered.length > 0 ? b.showing(start + 1, start + slice.length, filtered.length) : ''}
          </Text>
          {slice.length > 0 && (
            <TouchableOpacity onPress={togglePage}>
              <Text className="text-primary text-xs font-semibold">{allOnPage ? b.unselectPage : b.selectPage}</Text>
            </TouchableOpacity>
          )}
        </View>

        <ScrollView className="flex-1 bg-card border border-border rounded-2xl" keyboardShouldPersistTaps="handled">
          {loading && catalog.length === 0 ? (
            <Text className="text-muted text-sm px-4 py-4">{t.common.loading}</Text>
          ) : catalog.length === 0 ? (
            <Text className="text-muted text-sm px-4 py-4">{b.noStock}</Text>
          ) : slice.length === 0 ? (
            <Text className="text-muted text-sm px-4 py-4">{b.noMatch}</Text>
          ) : (
            slice.map((p) => {
              const on = draft.has(p.key);
              return (
                <Pressable
                  key={p.key}
                  onPress={() => toggle(p.key)}
                  className={`flex-row items-center gap-3 px-4 py-3.5 border-b border-border-subtle ${on ? 'bg-primary-light' : ''}`}
                >
                  <View className={`w-5 h-5 rounded-md items-center justify-center border ${on ? 'bg-primary border-primary' : 'border-muted-subtle'}`}>
                    {on && <Icon name="check" size={13} color="#FFFFFF" />}
                  </View>
                  <Text className="text-text text-sm flex-1 capitalize">
                    {p.productName}
                    {p.kind === 'group' ? <Text className="text-muted text-xs">{`  · ${b.sizedTag} ${p.sizes.length}`}</Text> : null}
                  </Text>
                  <Text className="text-muted text-xs">{b.availPieces(p.available)}</Text>
                </Pressable>
              );
            })
          )}
        </ScrollView>

        <View className="flex-row items-center justify-between py-3">
          <TouchableOpacity disabled={current <= 1} onPress={() => setPage(current - 1)} className={`flex-row items-center gap-1 px-3 py-2 rounded-full border border-border ${current <= 1 ? 'opacity-40' : ''}`}>
            <Icon name="chevron-left" size={16} tone="text" />
            <Text className="text-text text-xs">{b.prevPage}</Text>
          </TouchableOpacity>
          <Text className="text-muted text-xs">{b.pageOf(current, pages)}</Text>
          <TouchableOpacity disabled={current >= pages} onPress={() => setPage(current + 1)} className={`flex-row items-center gap-1 px-3 py-2 rounded-full border border-border ${current >= pages ? 'opacity-40' : ''}`}>
            <Text className="text-text text-xs">{b.nextPage}</Text>
            <Icon name="chevron-right" size={16} tone="text" />
          </TouchableOpacity>
        </View>
        <Button label={b.pickerDone(draft.size)} icon="check" onPress={() => onDone([...draft])} className="mb-4" />
      </View>
    </FormModal>
  );
}
