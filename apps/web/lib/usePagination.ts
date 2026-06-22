import { useEffect, useMemo, useState } from 'react'

/**
 * Client-side pagination over an ALREADY-filtered array.
 *
 * Important: callers pass the list *after* applying search/filters, so paging
 * never hides a match — searching narrows the full set first, then we page the
 * result. Pass `resetKey` (e.g. the search text + active filter) so the page
 * jumps back to 1 whenever the filter changes and the match is visible.
 */
export function usePagination<T>(items: T[], pageSize = 15, resetKey?: unknown) {
  const [page, setPage] = useState(1)

  // Back to page 1 when the filter/search changes.
  useEffect(() => { setPage(1) }, [resetKey])

  const totalPages = Math.max(1, Math.ceil(items.length / pageSize))

  // Stay in range if the list shrank (e.g. a row was deleted).
  useEffect(() => { if (page > totalPages) setPage(totalPages) }, [page, totalPages])

  const safePage = Math.min(page, totalPages)
  const start = (safePage - 1) * pageSize
  const pageItems = useMemo(() => items.slice(start, start + pageSize), [items, start, pageSize])

  return { page: safePage, setPage, totalPages, pageItems, total: items.length, pageSize, start }
}
