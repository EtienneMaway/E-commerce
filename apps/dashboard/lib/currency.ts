'use client';

import { useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useCurrencyStore, type DisplayCurrency } from '../store/currency.store';
import { QK } from './query-keys';
import { currencyApi } from './api';

/** Pure formatting function — no hooks, safe to call anywhere. */
export function formatMoney(
  value: string | number,
  display: DisplayCurrency,
  rate: string,
): string {
  const n = typeof value === 'string' ? parseFloat(value) : value;
  if (isNaN(n)) return display === 'FC' ? '0 FC' : '$0.00';

  if (display === 'FC') {
    const r = parseFloat(rate) || 1;
    // Round to 2 decimal places to avoid floating point noise
    const fcVal = Math.round(n * r * 100) / 100;
    return new Intl.NumberFormat('fr-CD').format(fcVal) + ' FC';
  }

  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n);
}

/**
 * React hook that returns a formatCurrency function bound to the current
 * display currency preference and exchange rate.
 *
 * Drop-in replacement for the old `formatCurrency` util:
 *   const formatCurrency = useFormatCurrency();
 *   formatCurrency('25.00')  // → "$25.00" or "67 500 FC"
 */
export function useFormatCurrency(): (value: string | number) => string {
  const { displayCurrency } = useCurrencyStore();

  const { data: rateData } = useQuery({
    queryKey: QK.exchangeRate,
    queryFn: currencyApi.getRate,
    staleTime: 5 * 60_000,
    retry: false,
  });

  const rate = rateData?.usdToFcRate ?? '1';

  return useCallback(
    (value: string | number) => formatMoney(value, displayCurrency, rate),
    [displayCurrency, rate],
  );
}
