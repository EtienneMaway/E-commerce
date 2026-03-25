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
 * Converts an FC value back to USD string (2 decimal places).
 * Used when the user enters an amount in FC and the API expects USD.
 */
export function fcToUsd(fcValue: string | number, rate: string): string {
  const n = typeof fcValue === 'string' ? parseFloat(fcValue) : fcValue;
  if (isNaN(n)) return '0.00';
  const r = parseFloat(rate) || 1;
  return (n / r).toFixed(2);
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
 */
export function useFormatCurrency(): (value: string | number) => string {
  const rate = useExchangeRate();
  return useCallback((value) => formatMoney(value, rate), [rate]);
}
