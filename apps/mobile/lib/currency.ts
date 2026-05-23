import { useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import { currencyApi } from './api';
import { QK } from './query-keys';

/**
 * Default decimal places for FC money displays on mobile. Whole numbers match
 * how clients actually settle in physical FC notes (no sub-unit exists), and
 * keeps cards uncluttered. USD displays — `formatCurrency` in `lib/utils.ts` —
 * keep their own 4dp default.
 */
export const MONEY_DISPLAY_DP = 0;

/**
 * Converts a USD value to FC and formats it.
 * Mobile always displays in FC — no toggle needed.
 *
 * Default precision is 0dp (whole-number FC). Pass `dp` to override (e.g. 4
 * if a screen specifically needs sub-unit precision). Values are TRUNCATED
 * to the requested precision so the rendered figure never overstates.
 */
export function formatMoney(value: string | number, rate: string, dp = MONEY_DISPLAY_DP): string {
  const n = typeof value === 'string' ? parseFloat(value) : value;
  if (isNaN(n)) return dp > 0 ? `0.${'0'.repeat(dp)} FC` : '0 FC';
  const r = parseFloat(rate) || 1;
  const factor = Math.pow(10, dp);
  const fcVal = dp === 0 ? Math.trunc(n * r) : Math.trunc(n * r * factor) / factor;
  return new Intl.NumberFormat('fr-CD', { minimumFractionDigits: dp, maximumFractionDigits: dp }).format(fcVal) + ' FC';
}

/**
 * Converts an FC value back to USD string (4 decimal places).
 * Used when the user enters an amount in FC and the API expects USD.
 */
export function fcToUsd(fcValue: string | number, rate: string): string {
  const n = typeof fcValue === 'string' ? parseFloat(fcValue) : fcValue;
  if (isNaN(n)) return '0.0000';
  const r = parseFloat(rate) || 1;
  return (n / r).toFixed(4);
}

/**
 * Hook that returns the raw usdToFcRate string (falls back to '1').
 */
export function useExchangeRate(): string {
  const { data: rateData } = useQuery({
    queryKey: QK.exchangeRate,
    queryFn: currencyApi.getRate,
    staleTime: 5 * 60_000,
    retry: false,
  });
  return rateData?.usdToFcRate ?? '1';
}

/**
 * Hook that returns a formatter function. Always formats in FC using the
 * exchange rate fetched from the API (falls back to 1:1 if not yet set).
 * Default precision is 4dp; pass `dp` (e.g. 2) for compact card displays.
 */
export function useFormatCurrency(): (value: string | number, dp?: number) => string {
  const rate = useExchangeRate();
  return useCallback((value, dp: number = MONEY_DISPLAY_DP) => formatMoney(value, rate, dp), [rate]);
}
