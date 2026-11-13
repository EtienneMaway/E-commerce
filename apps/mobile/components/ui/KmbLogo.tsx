import { View, type ViewStyle } from 'react-native';

interface Props {
  /** Edge length in px. */
  size?: number;
  className?: string;
}

/**
 * The KMB-Talk mark — a paper K on a malachite tile, its copper leg crossing
 * over the arm — drawn with plain Views from the same 1024-space geometry as
 * `assets/src/logo-mark.svg` and the web `KmbLogo`.
 *
 * Why Views and not `assets/logo-mark.png`: in release builds the bitmap laid
 * out but never painted (the ImageView was there, empty), so the auth screens
 * showed a blank square. Views need nothing loaded, stay sharp at any size, and
 * the gradients use RN 0.83's `experimental_backgroundImage` like the rest of
 * the app. The crossing gap is a field-coloured collar under the copper leg —
 * the gap only ever sits on the tile, so that matches the SVG's mask.
 */
const FIELD = '#0E7A5B';
const PAPER = '#F3ECDF';

/** A round-capped bar from (x1,y1) to (x2,y2), width w, in 1024 units scaled by k. */
function bar(x1: number, y1: number, x2: number, y2: number, w: number, k: number): ViewStyle {
  const len = Math.hypot(x2 - x1, y2 - y1) + w;
  const cx = (x1 + x2) / 2;
  const cy = (y1 + y2) / 2;
  const angle = (Math.atan2(y2 - y1, x2 - x1) * 180) / Math.PI;
  return {
    position: 'absolute',
    width: len * k,
    height: w * k,
    left: (cx - len / 2) * k,
    top: (cy - w / 2) * k,
    borderRadius: (w / 2) * k,
    transform: [{ rotate: `${angle}deg` }],
  };
}

export function KmbLogo({ size = 56, className }: Props) {
  const k = size / 1024;
  return (
    <View
      className={className}
      accessibilityRole="image"
      accessibilityLabel="KMB-Talk"
      style={{
        width: size,
        height: size,
        borderRadius: 230 * k,
        overflow: 'hidden',
        backgroundColor: FIELD,
        experimental_backgroundImage: 'radial-gradient(circle at 32% 25%, #1E9E76 0%, #0E7A5B 50%, #094A37 100%)',
      }}
    >
      <View style={[bar(370, 264, 370, 760, 112, k), { backgroundColor: PAPER }]} />
      <View style={[bar(370, 600, 706, 264, 112, k), { backgroundColor: PAPER }]} />
      <View style={[bar(564, 446, 746, 760, 172, k), { backgroundColor: FIELD }]} />
      <View
        style={[
          bar(564, 446, 746, 760, 112, k),
          { backgroundColor: '#C25E27', experimental_backgroundImage: 'linear-gradient(90deg, #F2A86C 0%, #C25E27 100%)' },
        ]}
      />
    </View>
  );
}
