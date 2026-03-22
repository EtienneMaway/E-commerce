import { useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import { currencyApi } from './api';
import { QK } from './query-keys';

/**
 * Converts a USD value to FC and formats it.
 * Mobile always displays in FC — no toggle needed.
 */
export function formatMoney(value: string | number, rate: string): string {
  const n = typeof value === 'string' ? parseFloat(value) : value;
  if (isNaN(n)) return '0 FC';
  const r = parseFloat(rate) || 1;
  const fcVal = Math.round(n * r * 100) / 100;
  return new Intl.NumberFormat('fr-CD').format(fcVal) + ' FC';
}

/**
 * Hook that returns a formatter function. Always formats in FC using the
 * exchange rate fetched from the API (falls back to 1:1 if not yet set).
 */
export function useFormatCurrency(): (value: string | number) => string {
  const { data: rateData } = useQuery({
    queryKey: QK.exchangeRate,
    queryFn: currencyApi.getRate,
    staleTime: 5 * 60_000,
    retry: false,
  });
  const rate = rateData?.usdToFcRate ?? '1';
  return useCallback((value) => formatMoney(value, rate), [rate]);
}
