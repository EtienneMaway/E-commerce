import { useColorScheme } from 'nativewind';

/**
 * Brand colour literals.
 *
 * `global.css` + `tailwind.config.js` are the source of truth for anything
 * styled with a className (`bg-primary`, `text-danger`, …), and both mirror the
 * dashboard's `app/globals.css`. These constants exist for the handful of React
 * Native props that take a literal colour string and cannot read a Tailwind
 * class — `ActivityIndicator color`, `RefreshControl tintColor`,
 * `placeholderTextColor`, status-bar and navigation-bar colours.
 *
 * Keep the hexes below identical to the vars in `global.css`.
 *
 * Prefer `useBrand()` over the raw `BRAND` export: like the dashboard, the
 * palette shifts in dark mode (indigo lightens so it survives on a near-black
 * card), and a hard-coded `BRAND.primary` spinner is the kind of drift this
 * whole file exists to prevent. `BRAND` remains exported for module scope where
 * no hook can run.
 */
export interface BrandPalette {
  readonly primary: string;
  readonly primaryDark: string;
  readonly violet: string;
  readonly danger: string;
  readonly success: string;
  readonly warning: string;
  readonly muted: string;
  /** Placeholder text — dashboard's `.input::placeholder`. */
  readonly mutedSubtle: string;
  readonly onPrimary: string;
  /** Surfaces — for native chrome (tab bar, sheets) that cannot take a class. */
  readonly background: string;
  readonly surface: string;
  readonly card: string;
  readonly border: string;
  readonly text: string;
}

export const BRAND: BrandPalette = {
  /** Indigo — main actions. Matches the app icon and the web dashboard. */
  primary: '#4F46E5',
  /** Pressed / hovered primary. */
  primaryDark: '#4338CA',
  /** The gradient partner in the app icon and the dashboard's KmbLogo. */
  violet: '#7C3AED',
  /** Red — losses, debts. */
  danger: '#EF4444',
  /** Green — profits, credits. */
  success: '#10B981',
  /** Amber — warnings. */
  warning: '#F59E0B',
  /** Muted text / placeholders. */
  muted: '#8492B4',
  mutedSubtle: '#B0BBDB',
  /** Foreground used on top of `primary` / `danger` fills. */
  onPrimary: '#FFFFFF',
  background: '#EEF1FA',
  surface: '#F7F9FE',
  card: '#FFFFFF',
  border: '#E2E6F4',
  text: '#0D1226',
};

/** Dark-mode counterparts. Mirrors the `.dark` block in `global.css`. */
export const BRAND_DARK: BrandPalette = {
  primary: '#6366F1',
  primaryDark: '#818CF8',
  violet: '#8B5CF6',
  danger: '#F87171',
  success: '#34D399',
  warning: '#FCD34D',
  muted: '#4E5A80',
  mutedSubtle: '#2E3555',
  onPrimary: '#FFFFFF',
  background: '#090C18',
  surface: '#0F1322',
  card: '#131726',
  border: '#1E2438',
  text: '#E8EBF8',
};

/**
 * The brand palette for the active colour scheme.
 *
 * Use this wherever a literal colour string is unavoidable, so spinners,
 * pull-to-refresh tints and placeholders track the theme the same way a
 * `text-primary` className does.
 */
export function useBrand(): BrandPalette {
  const { colorScheme } = useColorScheme();
  return colorScheme === 'dark' ? BRAND_DARK : BRAND;
}
