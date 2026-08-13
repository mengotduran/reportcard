// Shown the moment a dashboard route is clicked, until that route is ready.
//
// Without a loading boundary React keeps the OLD page on screen for the whole
// transition, so on a slow connection a click looks like it did nothing at all
// for several seconds and users click again. This is deliberately a plain
// skeleton in existing tokens rather than a spinner: it occupies roughly the
// shape of a page, so the swap to real content does not jump.
export default function Loading() {
  return (
    <div className="animate-pulse" aria-busy="true" aria-live="polite">
      <span className="sr-only">Loading</span>
      <div className="h-7 w-48 rounded-md bg-muted" />
      <div className="mt-2 h-4 w-72 rounded bg-muted/60" />
      <div className="mt-6 rounded-lg border border-border bg-card p-4">
        <div className="h-9 w-full rounded bg-muted/70" />
        <div className="mt-3 space-y-2.5">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="h-8 w-full rounded bg-muted/40" />
          ))}
        </div>
      </div>
    </div>
  )
}
