/**
 * Compares two dotted numeric versions ("1.2.10" vs "1.3").
 *
 * Returns -1 when `a` is older than `b`, 1 when newer, 0 when equal. Missing
 * segments count as 0, so "1.2" === "1.2.0". Non-numeric segments (a "-beta"
 * suffix, say) are read up to their first non-digit, which is enough for the
 * `expo.version` values this app ships and never throws on a malformed string
 * sent by a client.
 */
export function compareVersions(a: string, b: string): number {
  const parse = (v: string): number[] =>
    String(v ?? '')
      .trim()
      .split('.')
      .map((seg) => {
        const n = parseInt(seg, 10);
        return Number.isFinite(n) ? n : 0;
      });

  const left = parse(a);
  const right = parse(b);
  const len = Math.max(left.length, right.length);

  for (let i = 0; i < len; i++) {
    const l = left[i] ?? 0;
    const r = right[i] ?? 0;
    if (l !== r) return l < r ? -1 : 1;
  }
  return 0;
}
