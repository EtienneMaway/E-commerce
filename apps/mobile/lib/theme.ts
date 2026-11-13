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
  /** Malachite — main actions. Same identity as the public site. */
  primary: '#0E7A5B',
  /** Pressed primary. */
  primaryDark: '#0B5842',
  /** Copper accent (historical name: the token used to be violet). */
  violet: '#C25E27',
  /** Brick — losses, debts. */
  danger: '#B23A2B',
  /** Green — profits, credits. */
  success: '#1A8C52',
  /** Ochre — warnings. */
  warning: '#B06A0C',
  /** Muted text / placeholders. */
  muted: '#767F79',
  mutedSubtle: '#ACB2AB',
  /** Foreground used on top of `primary` / `danger` fills. */
  onPrimary: '#FFFFFF',
  background: '#F3ECDF',
  surface: '#ECE4D4',
  card: '#FBF8F1',
  border: '#E0D6C4',
  text: '#15211C',
};

/** Dark-mode counterparts. Mirrors the `.dark:root` block in `global.css`. */
export const BRAND_DARK: BrandPalette = {
  primary: '#279B74',
  primaryDark: '#5FD6AC',
  violet: '#EA8C4F',
  danger: '#F27E68',
  success: '#52D68C',
  warning: '#ECB252',
  muted: '#7E8983',
  mutedSubtle: '#48534D',
  onPrimary: '#FFFFFF',
  background: '#0D1311',
  surface: '#141D19',
  card: '#16201C',
  border: '#25322C',
  text: '#EFE8D8',
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

/**
 * Native stack header styling — paper, no hairline, serif title, malachite back
 * arrow. Shared by every Stack (root and nested ones like /account), since a
 * nested navigator does not inherit its parent's screenOptions.
 */
export function useHeaderOptions() {
  const brand = useBrand();
  return {
    headerStyle: { backgroundColor: brand.background },
    headerShadowVisible: false,
    headerTintColor: brand.primary,
    headerTitleStyle: { fontWeight: '700', fontSize: 20, color: brand.text },
    contentStyle: { backgroundColor: brand.background },
  } as const;
}
