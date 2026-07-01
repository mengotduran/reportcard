import { useMemo, useState } from 'react'

/**
 * Client-side pagination over an ALREADY-filtered array.
 *
 * Important: callers pass the list *after* applying search/filters, so paging
 * never hides a match — searching narrows the full set first, then we page the
 * result. Pass `resetKey` (e.g. the search text + active filter) so the page
 * jumps back to 1 whenever the filter changes and the match is visible.
 *
 * Pass `persistKey` to remember the current page across a navigate-away-and-back
 * (e.g. opening a row's detail page then hitting Back) — sessionStorage survives
 * the component unmounting, which plain useState doesn't.
 *
 * Pass `ready: false` while `items` is still an empty placeholder from an
 * in-flight fetch (i.e. the real list hasn't loaded yet). Without it, an empty
 * `items` array makes totalPages briefly look like 1, and the "stay in range"
 * adjustment below would clamp a restored page straight back down to 1 before
 * the real data — and its real page count — ever arrives.
 *
 * The reset/clamp adjustments run synchronously during render (React's
 * "adjusting state during render" pattern — see react.dev) rather than in a
 * useEffect. An effect-based version fires one render late and, for a caller
 * whose resetKey is rebuilt from multiple pieces of async-loaded state (each
 * landing in its own commit), can fire on an intermediate value that doesn't
 * reflect what the caller meant — silently clamping a page that should have
 * been left alone. Doing it inline avoids that whole class of ordering bugs.
 */
export function usePagination<T>(items: T[], pageSize = 15, resetKey?: unknown, persistKey?: string, ready = true) {
  const [page, setPageState] = useState(() => {
    if (persistKey && typeof window !== 'undefined') {
      const saved = Number(sessionStorage.getItem(persistKey))
      if (saved > 0) return saved
    }
    return 1
  })
  const [prevResetKey, setPrevResetKey] = useState(resetKey)

  const setPage = (p: number) => {
    setPageState(p)
    if (persistKey && typeof window !== 'undefined') sessionStorage.setItem(persistKey, String(p))
  }

  let renderPage = page
  if (prevResetKey !== resetKey) {
    setPrevResetKey(resetKey)
    renderPage = 1
    setPageState(1)
    if (persistKey && typeof window !== 'undefined') sessionStorage.setItem(persistKey, '1')
  }

  const totalPages = Math.max(1, Math.ceil(items.length / pageSize))

  // Stay in range if the list shrank (e.g. a row was deleted) — only once the
  // real data is in (see `ready` above).
  if (ready && renderPage > totalPages) {
    renderPage = totalPages
    setPageState(totalPages)
    if (persistKey && typeof window !== 'undefined') sessionStorage.setItem(persistKey, String(totalPages))
  }

  const start = (renderPage - 1) * pageSize
  const pageItems = useMemo(() => items.slice(start, start + pageSize), [items, start, pageSize])

  return { page: renderPage, setPage, totalPages, pageItems, total: items.length, pageSize, start }
}
