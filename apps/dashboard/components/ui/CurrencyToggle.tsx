'use client';

import { useCurrencyStore } from '../../store/currency.store';

export function CurrencyToggle() {
  const { displayCurrency, toggle } = useCurrencyStore();

  return (
    <button
      onClick={toggle}
      className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-200"
      style={{ color: 'rgba(255,255,255,0.5)' }}
      onMouseEnter={(e) => {
        (e.currentTarget as HTMLButtonElement).style.background = 'rgba(255,255,255,0.06)';
        (e.currentTarget as HTMLButtonElement).style.color = '#fff';
      }}
      onMouseLeave={(e) => {
        (e.currentTarget as HTMLButtonElement).style.background = 'transparent';
        (e.currentTarget as HTMLButtonElement).style.color = 'rgba(255,255,255,0.5)';
      }}
      title={displayCurrency === 'USD' ? 'Switch to FC display' : 'Switch to USD display'}
    >
      <span
        className="flex-shrink-0 text-xs font-bold w-4 h-4 flex items-center justify-center rounded"
        style={{ color: 'rgba(255,255,255,0.35)' }}
      >
        ⇄
      </span>
      <span>
        {displayCurrency === 'USD' ? 'View in FC' : 'View in USD'}
      </span>
      <span
        className="ml-auto text-xs font-bold px-1.5 py-0.5 rounded"
        style={{
          background: displayCurrency === 'FC'
            ? 'rgba(99,102,241,0.25)'
            : 'rgba(255,255,255,0.08)',
          color: displayCurrency === 'FC' ? '#818CF8' : 'rgba(255,255,255,0.4)',
        }}
      >
        {displayCurrency}
      </span>
    </button>
  );
}
