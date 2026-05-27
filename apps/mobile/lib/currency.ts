import { useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import { currencyApi } from './api';
import { QK } from './query-keys';
import { useOfflineStore } from '../store/offline.store';

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
 * Converts a USD value to its FC equivalent as a plain whole-number string.
 * Use when pre-filling an FC input from a USD value returned by the API.
 * Empty / NaN input yields ''.
 */
export function usdToFcStr(usdValue: string | number, rate: string): string {
  const n = typeof usdValue === 'string' ? parseFloat(usdValue) : usdValue;
  if (isNaN(n) || n === 0) return n === 0 ? '0' : '';
  const r = parseFloat(rate) || 1;
  return String(Math.round(n * r));
}

/**
 * Formats an FC value (already in FC, NOT USD) as "1 234 FC".
 * Pure display — does NOT multiply by an exchange rate. Use when the value
 * is already an FC figure (e.g. from a user input that's FC-native).
 */
export function formatFcValue(value: string | number): string {
  const n = typeof value === 'string' ? parseFloat(value) : value;
  if (isNaN(n)) return '0 FC';
  return new Intl.NumberFormat('fr-CD').format(Math.round(n)) + ' FC';
}

/**
 * Hook that returns the raw usdToFcRate string (falls back to '1').
 *
 * When offline, prefers the rate that was snapshotted at the moment of going
 * offline — the API rate is set administratively and doesn't fluctuate
 * intraday, so freezing the value for the duration of an offline session
 * yields correct FC math everywhere (cards, receipts, sale modal). Without
 * this, the currency query would fail offline and silently fall back to '1',
 * making the entire FC display equal the USD value.
 */
export function useExchangeRate(): string {
  const { isOffline, snapshotRate } = useOfflineStore();
  const { data: rateData } = useQuery({
    queryKey: QK.exchangeRate,
    queryFn: currencyApi.getRate,
    staleTime: 5 * 60_000,
    retry: false,
    enabled: !isOffline,
  });
  if (isOffline && snapshotRate) return snapshotRate;
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
