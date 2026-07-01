'use client'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { useT } from '@/lib/i18n'

// Windowed page list: first, last, current ±1, and '…' for the gaps —
// same idea as GitHub/most paginated tables, so jumping from page 27 to
// page 1 doesn't take 26 clicks.
function pageWindow(current: number, total: number): (number | '…')[] {
  const delta = 1
  const left = Math.max(2, current - delta)
  const right = Math.min(total - 1, current + delta)
  const pages: (number | '…')[] = [1]
  if (left > 2) pages.push('…')
  for (let i = left; i <= right; i++) pages.push(i)
  if (right < total - 1) pages.push('…')
  if (total > 1) pages.push(total)
  return pages
}

/**
 * Compact pager for client-side paginated tables. Renders nothing when
 * everything fits on one page, so it's safe to drop under any table.
 */
export default function Pagination({
  page,
  totalPages,
  total,
  pageSize,
  onPage,
}: {
  page: number
  totalPages: number
  total: number
  pageSize: number
  onPage: (p: number) => void
}) {
  const t = useT()
  if (totalPages <= 1) return null
  const from = (page - 1) * pageSize + 1
  const to = Math.min(total, page * pageSize)

  return (
    <div className="flex items-center justify-between gap-3 px-4 py-3 border-t border-border">
      <span className="text-xs text-muted-foreground">{from}–{to} {t('of')} {total}</span>
      <div className="flex items-center gap-1">
        <button
          onClick={() => onPage(page - 1)}
          disabled={page <= 1}
          aria-label={t('Previous')}
          className="p-1.5 rounded-lg border border-border text-muted-foreground hover:bg-muted disabled:opacity-40 disabled:cursor-not-allowed transition">
          <ChevronLeft size={16} />
        </button>
        {pageWindow(page, totalPages).map((p, i) =>
          p === '…' ? (
            <span key={`dots-${i}`} className="px-1.5 text-xs text-muted-foreground select-none">…</span>
          ) : (
            <button
              key={p}
              onClick={() => onPage(p)}
              aria-label={`${t('Page')} ${p}`}
              aria-current={p === page ? 'page' : undefined}
              className={`min-w-[26px] px-1.5 py-1 rounded-lg text-xs tabular-nums transition ${
                p === page
                  ? 'bg-primary text-primary-foreground font-medium'
                  : 'border border-border text-muted-foreground hover:bg-muted'
              }`}>
              {p}
            </button>
          )
        )}
        <button
          onClick={() => onPage(page + 1)}
          disabled={page >= totalPages}
          aria-label={t('Next')}
          className="p-1.5 rounded-lg border border-border text-muted-foreground hover:bg-muted disabled:opacity-40 disabled:cursor-not-allowed transition">
          <ChevronRight size={16} />
        </button>
      </div>
    </div>
  )
}
