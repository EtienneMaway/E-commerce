import { useState } from 'react';
import { Text, View } from 'react-native';
import { Button } from './ui/Button';
import { Sheet } from './ui/Sheet';
import { computeSpendRemaining, type SpendRemainingInput } from '../lib/spend-remaining';
import { useT } from '../lib/i18n';

interface Props {
  readonly input: SpendRemainingInput;
  readonly isOffline: boolean;
  readonly className?: string;
}

const fcFmt = new Intl.NumberFormat('fr-CD');
const usdFmt = new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/**
 * "Left to spend" button and its sheet: the expense headroom in FC and in USD.
 * Closes on the Close button or a tap outside. Renders nothing when no limit is
 * visible to this account (e.g. a role without the cash overview).
 */
export function SpendRemainingButton({ input, isOffline, className }: Props) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const remaining = computeSpendRemaining(input);
  if (!remaining) return null;

  const nothingLeft = remaining.fc <= 0;
  const hint =
    remaining.limitedBy === 'mini'
      ? t.expenses.spendLeftMiniHint
      : remaining.limitedBy === 'daily'
        ? t.expenses.spendLeftDailyHint
        : t.expenses.spendLeftBusinessHint;

  return (
    <>
      <Button
        label={t.expenses.spendLeftBtn}
        variant="outline"
        icon="pocket"
        onPress={() => setOpen(true)}
        className={className}
      />
      <Sheet
        visible={open}
        onClose={() => setOpen(false)}
        icon="pocket"
        tone={nothingLeft ? 'warning' : 'primary'}
        title={t.expenses.spendLeftTitle}
        subtitle={nothingLeft ? t.expenses.spendLeftNone : undefined}
        actions={<Button label={t.expenses.spendLeftClose} variant="ink" onPress={() => setOpen(false)} />}
      >
        <View className="flex-row gap-3">
          <View className="flex-1 bg-surface rounded-2xl px-4 py-3">
            <Text className="font-mono text-[11px] uppercase tracking-wide text-muted">
              {t.expenses.spendLeftFcLabel}
            </Text>
            <Text className={`text-2xl font-bold mt-1 ${nothingLeft ? 'text-danger' : 'text-text'}`}>
              {fcFmt.format(remaining.fc)} FC
            </Text>
          </View>
          <View className="flex-1 bg-surface rounded-2xl px-4 py-3">
            <Text className="font-mono text-[11px] uppercase tracking-wide text-muted">
              {t.expenses.spendLeftUsdLabel}
            </Text>
            <Text className={`text-2xl font-bold mt-1 ${nothingLeft ? 'text-danger' : 'text-text'}`}>
              ${usdFmt.format(remaining.usd)}
            </Text>
          </View>
        </View>
        <Text className="text-muted text-sm mt-4 leading-5">{hint}</Text>
        {isOffline && <Text className="text-warning text-sm mt-2 leading-5">{t.expenses.spendLeftOffline}</Text>}
      </Sheet>
    </>
  );
}
