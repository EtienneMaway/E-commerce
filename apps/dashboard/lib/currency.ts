'use client';

import { useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useCurrencyStore, type DisplayCurrency } from '../store/currency.store';
import { useIsSmallScreen } from '../hooks/use-is-small-screen';
import { QK } from './query-keys';
import { currencyApi } from './api';

/** Default fractional digits used across the app for money display. */
export const MONEY_DISPLAY_DP = 4;

/** Truncate (not round) a number to `dp` decimal places. Underlying precision is preserved upstream. */
export function truncateToDp(value: string | number, dp: number): number {
  const n = typeof value === 'string' ? parseFloat(value) : value;
  if (isNaN(n)) return 0;
  const factor = Math.pow(10, dp);
  return Math.trunc(n * factor) / factor;
}

/**
 * Pure formatting function — no hooks, safe to call anywhere.
 *
 * Defaults to 4 decimal places. Pass `dp` to override (e.g. 2 for compact card
 * displays). Values are TRUNCATED to the requested precision so the rendered
 * figure never overstates the stored amount.
 */
export function formatMoney(
  value: string | number,
  display: DisplayCurrency,
  rate: string,
  dp: number = MONEY_DISPLAY_DP,
): string {
  const n = typeof value === 'string' ? parseFloat(value) : value;
  if (isNaN(n)) return display === 'FC' ? '0 FC' : '$' + (0).toFixed(dp);

  if (display === 'FC') {
    const r = parseFloat(rate) || 1;
    const fcVal = truncateToDp(n * r, dp);
    return new Intl.NumberFormat('fr-CD', { minimumFractionDigits: dp, maximumFractionDigits: dp }).format(fcVal) + ' FC';
  }

  const usdVal = truncateToDp(n, dp);
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: dp,
    maximumFractionDigits: dp,
  }).format(usdVal);
}

/**
 * React hook that returns a formatCurrency function bound to the current
 * display currency preference and exchange rate.
 *
 * Default precision is 4dp, with one responsive override: on viewports below
 * Tailwind's `sm` breakpoint (640px), FC is rendered as whole numbers because
 * decimal-laden FC strings overflow cramped cards. USD keeps 4dp at every
 * screen size, and any explicit `dp` argument overrides the responsive logic.
 *
 *   const formatCurrency = useFormatCurrency();
 *   formatCurrency('25.0057')        // big screen → "$25.0057" or "67 515.3900 FC"
 *                                    // small screen → "$25.0057" or "67 515 FC"
 *   formatCurrency('25.0057', 2)     // → "$25.00" or "67 515.39 FC" (explicit dp wins)
 */
export function useFormatCurrency(): (value: string | number, dp?: number) => string {
  const { displayCurrency } = useCurrencyStore();
  const isSmallScreen = useIsSmallScreen();

  const { data: rateData } = useQuery({
    queryKey: QK.exchangeRate,
    queryFn: currencyApi.getRate,
    staleTime: 5 * 60_000,
    retry: false,
  });

  const rate = rateData?.usdToFcRate ?? '1';

  return useCallback(
    (value: string | number, dp?: number) => {
      const effectiveDp =
        dp !== undefined
          ? dp
          : displayCurrency === 'FC' && isSmallScreen
          ? 0
          : MONEY_DISPLAY_DP;
      return formatMoney(value, displayCurrency, rate, effectiveDp);
    },
    [displayCurrency, rate, isSmallScreen],
  );
}
