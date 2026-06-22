'use client'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { useT } from '@/lib/i18n'

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
        <span className="text-xs text-muted-foreground px-2 tabular-nums">{page} / {totalPages}</span>
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
