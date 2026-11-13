import { Image } from 'react-native';

interface Props {
  /**
 * The KMB-Talk mark: a paper K on a malachite tile, its copper leg crossing
 * over the arm.
 *
 * Mobile has no `react-native-svg`, and adding it would mean a native module
 * and a full rebuild for one logo, so this renders `assets/logo-mark.png`,
 * generated from `assets/src/logo-mark.svg` by `scripts/gen-native-icons.sh`.
 * The web's `KmbLogo` draws the same mark in the same 1024 space.
 *
 * No `elevation` here: Android draws elevation from the view's square bounds,
 * not the image's alpha, so it would show a square shadow behind the rounded tile.
 */
  size?: number;
  className?: string;
}

/**
 * The KMB brand mark — a pale ring around the gradient disc, with the K inside.
 *
 * Mobile has no `react-native-svg`, and adding it would mean a native module
 * and a full rebuild for one logo, so this renders `assets/logo-mark.png`. That
 * file is generated from `assets/src/logo-mark.svg` by
 * `scripts/gen-native-icons.sh`; the disc carries the dashboard gradient
 * verbatim (#4F46E5 → #7C3AED), so the mark stays in step with the web's
 * `KmbLogo` by construction rather than by copy-paste.
 *
 * The badge is transparent outside the ring and needs no drop shadow: the pale
 * ring is the halo. An `elevation` here would actually look worse on Android,
 * which draws elevation from the view's bounds rather than the image's alpha —
 * a square shadow behind a round mark.
 */
export function KmbLogo({ size = 56, className }: Props) {
  return (
    <Image
      className={className}
      source={require('../../assets/logo-mark.png')}
      style={{ width: size, height: size }}
      resizeMode="contain"
    />
  );
}
