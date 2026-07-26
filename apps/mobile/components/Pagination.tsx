import { View, Text, TouchableOpacity, StyleSheet } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { useTheme, Colors } from '@/lib/useTheme'
import { useT } from '@/lib/i18n'

// Mobile port of the web app's Pagination (apps/web/components/ui/Pagination.tsx) —
// same windowed page list and same "from–to of total" summary, so the two platforms
// behave identically. Kept as page buttons rather than infinite scroll at the user's
// request: on a long roster you can jump straight to a page instead of scrolling to it.

// Windowed page list: first, last, current ±1, and '…' for the gaps — so jumping from
// page 27 to page 1 doesn't take 26 taps.
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

const makeStyles = (colors: Colors) => StyleSheet.create({
  wrap: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 12, paddingVertical: 10, gap: 8,
    borderTopWidth: 1, borderTopColor: colors.border, backgroundColor: colors.card,
  },
  summary: { fontSize: 11, color: colors.textMuted, flexShrink: 1 },
  controls: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  arrow: {
    padding: 6, borderRadius: 8, borderWidth: 1, borderColor: colors.border,
  },
  arrowDisabled: { opacity: 0.4 },
  page: {
    minWidth: 28, paddingHorizontal: 6, paddingVertical: 5, borderRadius: 8,
    borderWidth: 1, borderColor: colors.border, alignItems: 'center',
  },
  pageActive: { backgroundColor: '#F03E2F', borderColor: '#F03E2F' },
  pageText: { fontSize: 12, color: colors.textSecondary, fontWeight: '600' },
  pageTextActive: { color: '#fff' },
  dots: { paddingHorizontal: 2, fontSize: 12, color: colors.textMuted },
})

/** Renders nothing when everything fits on one page, so it's safe to drop under any list. */
export default function Pagination({ page, totalPages, total, pageSize, onPage }: {
  page: number
  totalPages: number
  total: number
  pageSize: number
  onPage: (p: number) => void
}) {
  const { colors } = useTheme()
  const styles = makeStyles(colors)
  const t = useT()
  if (totalPages <= 1) return null
  const from = (page - 1) * pageSize + 1
  const to = Math.min(total, page * pageSize)

  return (
    <View style={styles.wrap}>
      <Text style={styles.summary} numberOfLines={1}>{from}–{to} {t('of')} {total}</Text>
      <View style={styles.controls}>
        <TouchableOpacity
          onPress={() => onPage(page - 1)}
          disabled={page <= 1}
          style={[styles.arrow, page <= 1 && styles.arrowDisabled]}
          hitSlop={6}
        >
          <Ionicons name="chevron-back" size={14} color={colors.textSecondary} />
        </TouchableOpacity>
        {pageWindow(page, totalPages).map((p, i) =>
          p === '…' ? (
            <Text key={`dots-${i}`} style={styles.dots}>…</Text>
          ) : (
            <TouchableOpacity
              key={p}
              onPress={() => onPage(p)}
              style={[styles.page, p === page && styles.pageActive]}
              hitSlop={4}
            >
              <Text style={[styles.pageText, p === page && styles.pageTextActive]}>{p}</Text>
            </TouchableOpacity>
          )
        )}
        <TouchableOpacity
          onPress={() => onPage(page + 1)}
          disabled={page >= totalPages}
          style={[styles.arrow, page >= totalPages && styles.arrowDisabled]}
          hitSlop={6}
        >
          <Ionicons name="chevron-forward" size={14} color={colors.textSecondary} />
        </TouchableOpacity>
      </View>
    </View>
  )
}
