import Feather from '@expo/vector-icons/Feather';
import type { ComponentProps } from 'react';
import { useBrand, type BrandPalette } from '../../lib/theme';

export type IconName = ComponentProps<typeof Feather>['name'];
type Tone = keyof Pick<BrandPalette, 'primary' | 'violet' | 'danger' | 'success' | 'warning' | 'muted' | 'text' | 'onPrimary'>;

interface Props {
  readonly name: IconName;
  readonly size?: number;
  /** A brand token, so the icon follows light/dark like a className would. */
  readonly tone?: Tone;
  /** A literal colour, for the rare case a token doesn't fit. */
  readonly color?: string;
}

/**
 * The app's one icon set: Feather line icons (bundled with Expo — a font, no
 * native module), replacing the emoji that used to stand in for icons. Emoji
 * render differently on every Android skin and read as a template; a single
 * stroke family reads as one product.
 */
export function Icon({ name, size = 20, tone = 'text', color }: Props) {
  const brand = useBrand();
  return <Feather name={name} size={size} color={color ?? brand[tone]} />;
}
