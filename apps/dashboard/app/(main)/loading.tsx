/**
 * Route-level loading fallback for every authenticated page.
 *
 * Without this file a slow navigation renders nothing at all — Next.js has no
 * fallback to show, so the viewport stays blank until the route's JS and data
 * arrive. On a 2G link that reads as "the app is broken" rather than "the app
 * is loading", which is the single most common complaint from the field.
 */
export default function Loading() {
  return (
    <div className="p-6 animate-pulse" aria-busy="true" aria-live="polite">
      <div className="h-7 w-48 rounded mb-6" style={{ background: 'var(--muted-bg, rgba(128,128,128,0.15))' }} />
      <div className="grid gap-4 mb-6" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))' }}>
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="h-24 rounded-xl" style={{ background: 'var(--muted-bg, rgba(128,128,128,0.12))' }} />
        ))}
      </div>
      <div className="h-64 rounded-xl" style={{ background: 'var(--muted-bg, rgba(128,128,128,0.10))' }} />
    </div>
  );
}
