import { useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  Pressable,
  TextInput,
  ActivityIndicator,
  Alert,
  RefreshControl,
} from 'react-native';
import { Stack } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  custodyApi,
  type CustodyHandoverPreview,
  type CustodyIssueSummary,
  type CustodyOverview,
  type CustodyPendingSale,
} from '../lib/api';
import { QK } from '../lib/query-keys';
import { EmptyState } from '../components/ui/EmptyState';
import { breakdownQuantity, formatBreakdown, formatDate, getErrorMessage } from '../lib/utils';
import { useRequireService } from '../hooks/use-require-service';
import { useT } from '../lib/i18n';

type Tab = 'volume' | 'approve' | 'handover';

const fc = (v: string | number): string => Number(v).toLocaleString('fr-CD');

/**
 * The custodian's own screen: what they are holding, what they have been
 * offered, whose sales they still have to go through, and the handover that
 * closes the period.
 *
 * Deliberately scoped to their own volume. A custodian is answerable for the
 * goods in their hands — not for the branch's cash position or the business's
 * numbers, which stay on the owner's dashboard.
 */
export default function CustodyScreen() {
  const allowed = useRequireService('custody.hold');
  const t = useT();
  const qc = useQueryClient();
  const [tab, setTab] = useState<Tab>('volume');

  const mine = useQuery({
    queryKey: QK.custodyMine,
    queryFn: () => custodyApi.mine(),
    enabled: allowed,
  });
  const issues = useQuery({
    queryKey: QK.custodyIssues,
    queryFn: () => custodyApi.myIssues(),
    enabled: allowed,
  });

  const overview = mine.data as CustodyOverview | null | undefined;
  const offered = (issues.data as CustodyIssueSummary[] | undefined) ?? [];

  const refreshAll = (): void => {
    qc.invalidateQueries({ queryKey: ['custody'] });
    qc.invalidateQueries({ queryKey: ['inventory'] });
  };

  const accept = useMutation({
    mutationFn: (id: string) => custodyApi.acceptIssue(id),
    onSuccess: () => {
      refreshAll();
      Alert.alert(t.custody.takenTitle, t.custody.takenBody);
    },
    onError: (e) => Alert.alert(t.custody.couldNotTake, getErrorMessage(e)),
  });
  const refuse = useMutation({
    mutationFn: (id: string) => custodyApi.rejectIssue(id),
    onSuccess: () => {
      refreshAll();
      Alert.alert(t.custody.refusedTitle, t.custody.refuseBody);
    },
    onError: (e) => Alert.alert(t.custody.couldNotRefuse, getErrorMessage(e)),
  });

  if (!allowed) return null;

  return (
    <>
      <Stack.Screen options={{ title: t.custody.title }} />
      <View className="flex-1 bg-white dark:bg-neutral-950">
        <View className="flex-row px-4 pt-3 gap-2">
          {(
            [
              ['volume', t.custody.tabHolding],
              ['approve', t.custody.tabApprove],
              ['handover', t.custody.tabHandover],
            ] as const
          ).map(([key, label]) => (
            <Pressable
              key={key}
              onPress={() => setTab(key)}
              className={`px-4 py-2 rounded-full ${
 tab === key ? 'bg-primary' : 'bg-neutral-100 dark:bg-neutral-800'
              }`}
            >
              <Text
                className={
                  tab === key ? 'text-white text-sm' : 'text-neutral-600 dark:text-neutral-300 text-sm'
                }
              >
                {label}
                {key === 'approve' && overview?.pendingSaleCount
                  ? ` (${overview.pendingSaleCount})`
                  : ''}
              </Text>
            </Pressable>
          ))}
        </View>

        {mine.isLoading ? (
          <View className="flex-1 items-center justify-center">
            <ActivityIndicator />
          </View>
        ) : !overview ? (
          <EmptyState
            title={t.custody.noneTitle}
            subtitle={t.custody.noneBody}
          />
        ) : tab === 'volume' ? (
          <ScrollView
            className="flex-1 px-4 pt-4"
            refreshControl={
              <RefreshControl refreshing={mine.isFetching} onRefresh={() => refreshAll()} />
            }
          >
            <View className="bg-neutral-50 dark:bg-neutral-900 rounded-2xl p-4 mb-4">
              <Text className="text-neutral-500 dark:text-neutral-400 text-xs">
                {t.custody.inYourHandsSince} {formatDate(overview.custody.openedAt)}
              </Text>
              <Text className="text-2xl font-semibold text-neutral-900 dark:text-white mt-1">
                {overview.totalUnits}{' '}
                {overview.totalUnits === 1 ? t.custody.units : t.custody.unitsPlural}
              </Text>
              <Text className="text-neutral-500 dark:text-neutral-400 text-xs mt-1">
                {overview.lines.length}{' '}
                {overview.lines.length === 1 ? t.custody.products : t.custody.productsPlural} ·{' '}
                {overview.teamSize}{' '}
                {overview.teamSize === 1 ? t.custody.teammate : t.custody.teammatesPlural}
              </Text>
            </View>

            {offered.length > 0 && (
              <View className="mb-5">
                <Text className="font-semibold text-neutral-900 dark:text-white mb-2">
                  {t.custody.offeredToYou}
                </Text>
                {offered.map((i) => (
                  <View
                    key={i.id}
                    className="border border-neutral-200 dark:border-neutral-800 rounded-2xl p-4 mb-2"
                  >
                    <Text className="text-neutral-900 dark:text-white font-medium">
                      {i.isOpeningSweep
                        ? t.custody.wholeShelf
                        : i.items
                            .map((it) => `${it.productName} ×${it.quantity}`)
                            .join(', ')}
                    </Text>
                    <Text className="text-neutral-500 dark:text-neutral-400 text-xs mt-1">
                      {formatDate(i.createdAt)}
                      {i.note ? ` · ${i.note}` : ''}
                    </Text>
                    <Text className="text-neutral-500 dark:text-neutral-400 text-xs mt-2">
                      {t.custody.takeItWarning}
                    </Text>
                    <View className="flex-row gap-2 mt-3">
                      <Pressable
                        className="flex-1 bg-primary rounded-xl py-3 items-center"
                        disabled={accept.isPending}
                        onPress={() => accept.mutate(i.id)}
                      >
                        <Text className="text-white font-medium">{t.custody.takeIt}</Text>
                      </Pressable>
                      <Pressable
                        className="px-4 rounded-xl py-3 items-center justify-center border border-neutral-300 dark:border-neutral-700"
                        disabled={refuse.isPending}
                        onPress={() =>
                          Alert.alert(t.custody.refuseTitle, t.custody.refuseBody, [
                            { text: 'Cancel', style: 'cancel' },
                            { text: t.custody.refuse, style: 'destructive', onPress: () => refuse.mutate(i.id) },
                          ])
                        }
                      >
                        <Text className="text-neutral-700 dark:text-neutral-200">{t.custody.refuse}</Text>
                      </Pressable>
                    </View>
                  </View>
                ))}
              </View>
            )}

            <Text className="font-semibold text-neutral-900 dark:text-white mb-2">
              {t.custody.whatYouHold}
            </Text>
            {overview.lines.length === 0 ? (
              <Text className="text-neutral-500 dark:text-neutral-400 text-sm mb-8">
                {t.custody.nothingYet}
              </Text>
            ) : (
              overview.lines.map((l) => (
                <View
                  key={`${l.productName}:${l.variantId ?? ''}`}
                  className="flex-row justify-between py-3 border-b border-neutral-100 dark:border-neutral-800"
                >
                  <Text className="text-neutral-900 dark:text-white flex-1">
                    {l.productName}
                    {l.variantLabel ? ` · ${l.variantLabel}` : ''}
                  </Text>
                  <Text className="text-neutral-600 dark:text-neutral-300">
                    {formatBreakdown(breakdownQuantity(l.quantityRemaining, l.piecesPerCarton))}
                  </Text>
                </View>
              ))
            )}
            <View className="h-10" />
          </ScrollView>
        ) : tab === 'approve' ? (
          <ApproveQueue />
        ) : (
          <HandoverTab />
        )}
      </View>
    </>
  );
}

/**
 * The batch the man in charge signs off. `expectedCount` goes with it, so a
 * queue that grew since this list rendered is refused rather than waved through
 * — which is the only thing that makes "approve all" mean anything.
 */
function ApproveQueue() {
  const qc = useQueryClient();
  const t = useT();
  const [reviewed, setReviewed] = useState(false);

  const { data, isLoading, isFetching } = useQuery({
    queryKey: QK.custodyPendingSales,
    queryFn: () => custodyApi.pendingSales(),
  });
  const sales = (data as CustodyPendingSale[] | undefined) ?? [];

  const approve = useMutation({
    mutationFn: () =>
      custodyApi.approveSales({
        saleIds: sales.map((s) => s.id),
        expectedCount: sales.length,
        reviewed: true,
      }),
    onSuccess: (r) => {
      qc.invalidateQueries({ queryKey: ['custody'] });
      setReviewed(false);
      Alert.alert(t.custody.approvedTitle, `${r.approved} ${t.custody.approvedBody}`);
    },
    onError: (e) => Alert.alert(t.custody.notApproved, getErrorMessage(e)),
  });

  if (isLoading) {
    return (
      <View className="flex-1 items-center justify-center">
        <ActivityIndicator />
      </View>
    );
  }
  if (sales.length === 0) {
    return (
      <EmptyState
        title={t.custody.nothingToApprove}
        subtitle={t.custody.nothingToApproveBody}
      />
    );
  }

  const total = sales.reduce((sum, s) => sum + Number(s.salePrice) * s.qtySold, 0);

  return (
    <ScrollView
      className="flex-1 px-4 pt-4"
      refreshControl={
        <RefreshControl
          refreshing={isFetching}
          onRefresh={() => qc.invalidateQueries({ queryKey: QK.custodyPendingSales })}
        />
      }
    >
      {sales.map((s) => (
        <View
          key={s.id}
          className="py-3 border-b border-neutral-100 dark:border-neutral-800"
        >
          <View className="flex-row justify-between">
            <Text className="text-neutral-900 dark:text-white flex-1">
              {s.productName}
              {s.variantLabel ? ` · ${s.variantLabel}` : ''} ×{s.qtySold}
            </Text>
            <Text className="text-neutral-600 dark:text-neutral-300">
              {Number(s.salePrice).toFixed(2)}
            </Text>
          </View>
          <Text className="text-neutral-500 dark:text-neutral-400 text-xs mt-1">
            {s.actor?.name ?? s.actor?.username ?? t.custody.teammateLabel} · {formatDate(s.date)}
          </Text>
        </View>
      ))}

      <View className="bg-warning-light /40 rounded-2xl p-4 mt-5">
        <Text className="text-warning text-sm">
          {sales.length} · {total.toFixed(2)} · {t.custody.approveWarning}
        </Text>
        <Pressable
          className="flex-row items-center gap-3 mt-3"
          onPress={() => setReviewed((v) => !v)}
        >
          <View
            className={`w-5 h-5 rounded border items-center justify-center ${
 reviewed ? 'bg-warning border-warning/60' : 'border-warning/60'
            }`}
          >
            {reviewed && <Text className="text-white text-xs">✓</Text>}
          </View>
          <Text className="text-warning text-sm flex-1">
            {t.custody.approveCheckbox}
          </Text>
        </Pressable>
      </View>

      <Pressable
        className={`rounded-xl py-4 items-center mt-4 ${
 reviewed ? 'bg-primary' : 'bg-neutral-300 dark:bg-neutral-800'
        }`}
        disabled={!reviewed || approve.isPending}
        onPress={() => approve.mutate()}
      >
        <Text className={reviewed ? 'text-white font-medium' : 'text-neutral-500'}>
          {approve.isPending ? t.custody.approving : `${t.custody.approve} ${sales.length}`}
        </Text>
      </Pressable>
      <View className="h-10" />
    </ScrollView>
  );
}

/** What I owe if I close now, and the form that closes it. */
function HandoverTab() {
  const qc = useQueryClient();
  const t = useT();
  const [cash, setCash] = useState('');
  const [note, setNote] = useState('');

  const { data, isLoading, isFetching } = useQuery({
    queryKey: QK.custodyPreview,
    queryFn: () => custodyApi.handoverPreview(),
  });
  const p = data as CustodyHandoverPreview | null | undefined;

  const submit = useMutation({
    mutationFn: () =>
      custodyApi.submitHandover({
        cashDeclaredFc: Number(cash || 0).toFixed(4),
        note: note.trim() || undefined,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['custody'] });
      setCash('');
      setNote('');
      Alert.alert(t.custody.handedOverTitle, t.custody.handedOverBody);
    },
    onError: (e) => Alert.alert(t.custody.notHandedOver, getErrorMessage(e)),
  });

  if (isLoading) {
    return (
      <View className="flex-1 items-center justify-center">
        <ActivityIndicator />
      </View>
    );
  }
  if (!p) return <EmptyState title={t.custody.nothingToHandOver} />;

  const blocked = p.unattestedSaleCount > 0;

  return (
    <ScrollView
      className="flex-1 px-4 pt-4"
      refreshControl={
        <RefreshControl
          refreshing={isFetching}
          onRefresh={() => qc.invalidateQueries({ queryKey: QK.custodyPreview })}
        />
      }
    >
      <View className="bg-neutral-50 dark:bg-neutral-900 rounded-2xl p-4 mb-4">
        <View className="flex-row items-center justify-between mb-1">
          <Text className="font-semibold text-neutral-900 dark:text-white">
            {t.custody.handoverSummary}
          </Text>
          <Text className="text-neutral-500 dark:text-neutral-400 text-xs">
            {t.custody.since} {formatDate(p.periodStart)}
          </Text>
        </View>
        <Row label={t.custody.youSold} value={`${fc(p.salesFc)} FC`} />
        {Number(p.miniRollupCashFc) > 0 && (
          <Row label={t.custody.fromYourMinis} value={`${fc(p.miniRollupCashFc)} FC`} />
        )}
        {Number(p.expensesFc) > 0 && (
          <Row label={t.custody.youSpent} value={`−${fc(p.expensesFc)} FC`} />
        )}
        {Number(p.branchReceivedFc ?? 0) > 0 && (
          <Row label={t.custody.youReceivedBranches} value={`${fc(p.branchReceivedFc)} FC`} />
        )}
        {Number(p.branchPaidOutFc ?? 0) > 0 && (
          <Row label={t.custody.youPaidBranches} value={`−${fc(p.branchPaidOutFc)} FC`} />
        )}
        <View className="h-px bg-neutral-200 dark:bg-neutral-800 my-2" />
        <Row label={t.custody.youOwe} value={`${fc(p.cashExpectedFc)} FC`} strong />
      </View>

      {p.pendingMiniHandovers.length > 0 && (
        <View className="bg-primary-light /40 rounded-2xl p-4 mb-4">
          <Text className="text-primary text-sm">
            {t.custody.stillOutTitle}{' '}
            {p.pendingMiniHandovers.map((m) => m.miniName).join(', ')}. {t.custody.stillOutBody}
          </Text>
        </View>
      )}

      {blocked && (
        <View className="bg-warning-light /40 rounded-2xl p-4 mb-4">
          <Text className="text-warning text-sm">
            {p.unattestedSaleCount} {t.custody.blockedByApproval}
          </Text>
        </View>
      )}

      {p.soldLines.length > 0 && (
        <View className="bg-neutral-50 dark:bg-neutral-900 rounded-2xl p-4 mb-4">
          <Text className="font-semibold text-neutral-900 dark:text-white mb-0.5">
            {t.custody.soldSectionTitle}
          </Text>
          <Text className="text-neutral-500 dark:text-neutral-400 text-xs mb-2">
            {t.custody.soldSectionHint}
          </Text>
          {p.soldLines.map((l, i) => (
            <LineRow
              key={i}
              left={`${l.productName}${l.variantLabel ? ` · ${l.variantLabel}` : ''}`}
              mid={formatBreakdown(breakdownQuantity(l.qtySold, l.piecesPerCarton))}
              right={`${fc(l.valueFc)} FC`}
            />
          ))}
        </View>
      )}

      {p.miniRollupLines.length > 0 && (
        <View className="bg-neutral-50 dark:bg-neutral-900 rounded-2xl p-4 mb-4">
          <Text className="font-semibold text-neutral-900 dark:text-white mb-2">
            {t.custody.miniRollupTitle}
          </Text>
          {p.miniRollupLines.map((l) => (
            <LineRow
              key={l.miniId}
              left={l.miniName}
              mid={`${l.returnedUnits} ${t.custody.unitsReturned}`}
              right={`${fc(l.cashFc)} FC`}
            />
          ))}
        </View>
      )}

      {p.rejectedLines.length > 0 && (
        <View className="bg-neutral-50 dark:bg-neutral-900 rounded-2xl p-4 mb-4">
          <Text className="font-semibold text-neutral-900 dark:text-white mb-2">
            {t.custody.voidedSectionTitle}
          </Text>
          {p.rejectedLines.map((l, i) => (
            <LineRow key={i} left={l.productName} right={`×${l.qtySold}`} muted />
          ))}
        </View>
      )}

      <View className="bg-neutral-50 dark:bg-neutral-900 rounded-2xl p-4 mb-4">
        <Text className="font-semibold text-neutral-900 dark:text-white mb-0.5">
          {t.custody.returnsTitle}
        </Text>
        <Text className="text-neutral-500 dark:text-neutral-400 text-xs mb-2">
          {t.custody.returnsHint}
        </Text>
        {p.holding.length === 0 ? (
          <Text className="text-neutral-500 dark:text-neutral-400 text-sm">
            {t.custody.nothingYet}
          </Text>
        ) : (
          p.holding.map((l) => (
            <LineRow
              key={l.inventoryEntryId}
              left={`${l.productName}${l.variantLabel ? ` · ${l.variantLabel}` : ''}`}
              right={formatBreakdown(breakdownQuantity(l.quantityRemaining, l.piecesPerCarton))}
            />
          ))
        )}
      </View>

      <Text className="font-semibold text-neutral-900 dark:text-white mb-2">
        {t.custody.cashLabel}
      </Text>
      <TextInput
        value={cash}
        onChangeText={setCash}
        keyboardType="numeric"
        placeholder={fc(p.cashExpectedFc)}
        className="border border-neutral-300 dark:border-neutral-700 rounded-xl px-4 py-3 text-neutral-900 dark:text-white mb-4"
        placeholderTextColor="#9ca3af"
      />

      <TextInput
        value={note}
        onChangeText={setNote}
        placeholder={t.custody.notePlaceholder}
        className="border border-neutral-300 dark:border-neutral-700 rounded-xl px-4 py-3 text-neutral-900 dark:text-white mb-4"
        placeholderTextColor="#9ca3af"
      />

      <View className="bg-warning-light /40 rounded-2xl p-4 mb-4">
        <Text className="text-warning text-sm">
          {t.custody.fullReturnWarning}
        </Text>
      </View>

      <Pressable
        className={`rounded-xl py-4 items-center mt-1 ${
 blocked ? 'bg-neutral-300 dark:bg-neutral-800' : 'bg-primary'
        }`}
        disabled={blocked || submit.isPending}
        onPress={() => submit.mutate()}
      >
        <Text className={blocked ? 'text-neutral-500' : 'text-white font-medium'}>
          {submit.isPending ? t.custody.handingOver : t.custody.handOver}
        </Text>
      </Pressable>
      <View className="h-10" />
    </ScrollView>
  );
}

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <View className="flex-row justify-between mt-2">
      <Text className="text-neutral-600 dark:text-neutral-300">{label}</Text>
      <Text
        className={
          strong
            ? 'text-neutral-900 dark:text-white font-semibold'
            : 'text-neutral-700 dark:text-neutral-200'
        }
      >
        {value}
      </Text>
    </View>
  );
}

/** One itemized report row: a name, an optional middle detail (qty), and a value on the right. */
function LineRow({
  left,
  mid,
  right,
  muted,
}: {
  left: string;
  mid?: string;
  right: string;
  muted?: boolean;
}) {
  return (
    <View className="flex-row items-center justify-between py-1.5 border-t border-neutral-100 dark:border-neutral-800">
      <Text
        className={`flex-1 pr-2 ${muted ? 'text-neutral-500 dark:text-neutral-400' : 'text-neutral-900 dark:text-white'}`}
        numberOfLines={1}
      >
        {left}
      </Text>
      <View className="flex-row items-center gap-3">
        {mid && <Text className="text-neutral-500 dark:text-neutral-400 text-xs">{mid}</Text>}
        <Text
          className={`font-medium ${muted ? 'text-neutral-500 dark:text-neutral-400' : 'text-neutral-900 dark:text-white'}`}
        >
          {right}
        </Text>
      </View>
    </View>
  );
}
