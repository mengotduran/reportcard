import { useCallback, useEffect, useMemo, useState } from 'react'
import { useLocalSearchParams, useNavigation } from 'expo-router'
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet, ActivityIndicator, RefreshControl,
} from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import {
  getChildReportCards, getChildFees, getChildReportCard,
  ParentReportCardRow, ParentFullCard,
} from '@/lib/api/parent'
import { StudentFees, formatXAF } from '@/lib/api/fees'
import { useTheme, Colors } from '@/lib/useTheme'
import { useT } from '@/lib/i18n'

const makeStyles = (colors: Colors) => StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bgSecondary },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24, gap: 12 },
  content: { padding: 16, paddingBottom: 40 },
  sectionTitle: {
    fontSize: 12, fontWeight: '700', color: colors.textSecondary,
    textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 8, marginTop: 4,
  },
  card: {
    backgroundColor: colors.card, borderRadius: 12,
    borderWidth: 1, borderColor: colors.border, marginBottom: 16,
  },
  feeRow: { flexDirection: 'row', paddingVertical: 14 },
  feeCell: { flex: 1, alignItems: 'center' },
  feeLabel: { fontSize: 11, color: colors.textMuted, marginBottom: 3 },
  feeValue: { fontSize: 14, fontWeight: '700', color: colors.text },
  feePaid: { color: '#16a34a' },
  feeOwing: { color: colors.brassInk },
  feeNote: {
    fontSize: 12, color: '#16a34a', textAlign: 'center',
    paddingBottom: 12, paddingHorizontal: 12, fontWeight: '600',
  },
  termRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingVertical: 13, paddingHorizontal: 14,
  },
  termDivider: { borderTopWidth: 1, borderTopColor: colors.border },
  termName: { fontSize: 14, fontWeight: '700', color: colors.text },
  termSession: { fontSize: 11, color: colors.textMuted, marginTop: 1 },
  figure: { alignItems: 'flex-end', minWidth: 54 },
  figureLabel: { fontSize: 10, color: colors.textMuted },
  figureValue: { fontSize: 14, fontWeight: '700', color: colors.text },
  detail: { paddingHorizontal: 14, paddingBottom: 14, borderTopWidth: 1, borderTopColor: colors.border, paddingTop: 10 },
  entryRow: { flexDirection: 'row', alignItems: 'flex-start', paddingVertical: 7 },
  entryDivider: { borderTopWidth: 1, borderTopColor: colors.border },
  entryName: { flex: 1, fontSize: 13, color: colors.text, paddingRight: 8 },
  entryScore: { width: 52, fontSize: 13, fontWeight: '600', color: colors.text, textAlign: 'right' },
  entryGrade: { width: 44, fontSize: 13, color: colors.textSecondary, textAlign: 'right' },
  entryRemark: { fontSize: 11, color: colors.textMuted, marginTop: 2 },
  verdict: { marginTop: 10, paddingTop: 10, borderTopWidth: 1, borderTopColor: colors.border, gap: 4 },
  verdictLine: { fontSize: 13, color: colors.text },
  verdictLabel: { color: colors.textMuted },
  emptyText: { fontSize: 14, color: colors.textMuted, textAlign: 'center', lineHeight: 21, padding: 20 },
})

/**
 * One child: what is owed, and every report card the school has published.
 *
 * Cards open one at a time, on demand. Each one is a round trip that carries the class-wide
 * subject statistics with it, and a parent reads one term at a time, so fetching all of them
 * up front would be a lot of data for a phone to no purpose.
 */
export default function ParentChildScreen() {
  const { colors } = useTheme()
  const styles = useMemo(() => makeStyles(colors), [colors])
  const t = useT()
  const navigation = useNavigation()
  const { studentId } = useLocalSearchParams<{ studentId: string }>()

  const [cards, setCards] = useState<ParentReportCardRow[]>([])
  const [fees, setFees] = useState<StudentFees | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState('')

  const [openId, setOpenId] = useState<string | null>(null)
  const [full, setFull] = useState<Record<string, ParentFullCard>>({})
  const [loadingCard, setLoadingCard] = useState(false)

  const fetchAll = useCallback(async () => {
    if (!studentId) return
    try {
      const [c, f] = await Promise.all([getChildReportCards(studentId), getChildFees(studentId)])
      setCards(c.reportCards)
      setFees(f)
      setError('')
    } catch {
      setError(t('Could not load this page. Pull down to try again.'))
    }
  }, [studentId, t])

  useEffect(() => {
    setLoading(true)
    fetchAll().finally(() => setLoading(false))
  }, [fetchAll])

  useEffect(() => {
    navigation.setOptions({ title: fees?.student?.name ?? t('Report Cards') })
  }, [navigation, fees?.student?.name, t])

  const onRefresh = useCallback(() => {
    setRefreshing(true)
    // A card already opened is dropped so it is re-read rather than shown stale.
    setFull({})
    fetchAll().finally(() => setRefreshing(false))
  }, [fetchAll])

  const toggle = async (cardId: string) => {
    if (openId === cardId) { setOpenId(null); return }
    setOpenId(cardId)
    if (full[cardId] || !studentId) return
    setLoadingCard(true)
    try {
      const data = await getChildReportCard(studentId, cardId)
      setFull((prev) => ({ ...prev, [cardId]: data }))
    } catch {
      setError(t('Could not open that report card.'))
    } finally {
      setLoadingCard(false)
    }
  }

  if (loading) {
    return <View style={styles.center}><ActivityIndicator color={colors.brassInk} /></View>
  }

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.brassInk} />}
    >
      {!!error && <Text style={[styles.emptyText, { color: colors.danger }]}>{error}</Text>}

      {/* Fees. Hidden entirely when the school has set no fee for the class, rather than
          showing a row of zeros that reads like "nothing to pay". */}
      {fees && fees.due > 0 && (
        <>
          <Text style={styles.sectionTitle}>{t('School Fees')}</Text>
          <View style={styles.card}>
            <View style={styles.feeRow}>
              <View style={styles.feeCell}>
                <Text style={styles.feeLabel}>{t('Total')}</Text>
                <Text style={styles.feeValue}>{formatXAF(fees.due)}</Text>
              </View>
              <View style={styles.feeCell}>
                <Text style={styles.feeLabel}>{t('Paid')}</Text>
                <Text style={[styles.feeValue, styles.feePaid]}>{formatXAF(fees.totalPaid)}</Text>
              </View>
              <View style={styles.feeCell}>
                <Text style={styles.feeLabel}>{t('Balance')}</Text>
                <Text style={[styles.feeValue, fees.balance > 0 ? styles.feeOwing : styles.feePaid]}>
                  {formatXAF(fees.balance)}
                </Text>
              </View>
            </View>
            {fees.balance === 0 && (
              <Text style={styles.feeNote}>{t('Fees fully paid. Thank you.')}</Text>
            )}
          </View>
        </>
      )}

      <Text style={styles.sectionTitle}>{t('Report Cards')}</Text>

      {cards.length === 0 ? (
        <View style={styles.card}>
          <Text style={styles.emptyText}>
            {t('No report card has been published yet. It will appear here once the school releases it.')}
          </Text>
        </View>
      ) : (
        <View style={styles.card}>
          {cards.map((c, index) => {
            const open = openId === c.id
            const detail = full[c.id]
            return (
              <View key={c.id} style={index > 0 ? styles.termDivider : undefined}>
                <TouchableOpacity style={styles.termRow} activeOpacity={0.7} onPress={() => toggle(c.id)}>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={styles.termName} numberOfLines={1}>{c.term.name}</Text>
                    <Text style={styles.termSession}>{c.term.session}</Text>
                  </View>

                  {c.average != null && (
                    <View style={styles.figure}>
                      <Text style={styles.figureLabel}>{t('Average')}</Text>
                      <Text style={styles.figureValue}>{c.average.toFixed(2)}</Text>
                    </View>
                  )}
                  {c.position != null && (
                    <View style={styles.figure}>
                      <Text style={styles.figureLabel}>{t('Position')}</Text>
                      {/* "3rd" alone means little; "3 of 42" is the question a parent is
                          actually asking. */}
                      <Text style={styles.figureValue}>
                        {c.position}{c.totalStudents ? `/${c.totalStudents}` : ''}
                      </Text>
                    </View>
                  )}

                  <Ionicons name={open ? 'chevron-up' : 'chevron-down'} size={16} color={colors.textFaint} />
                </TouchableOpacity>

                {open && (
                  <View style={styles.detail}>
                    {!detail ? (
                      loadingCard ? <ActivityIndicator color={colors.brassInk} style={{ paddingVertical: 12 }} /> : null
                    ) : (
                      <>
                        {detail.entries?.map((e, i) => (
                          <View key={e.id} style={[styles.entryRow, i > 0 ? styles.entryDivider : undefined]}>
                            <View style={{ flex: 1 }}>
                              <Text style={styles.entryName}>{e.subject?.name}</Text>
                              {!!e.remarks && <Text style={styles.entryRemark}>{e.remarks}</Text>}
                            </View>
                            <Text style={styles.entryScore}>{e.score == null ? '—' : e.score}</Text>
                            <Text style={styles.entryGrade}>{e.grade ?? ''}</Text>
                          </View>
                        ))}

                        {(detail.decision || detail.remarks) && (
                          <View style={styles.verdict}>
                            {!!detail.decision && (
                              <Text style={styles.verdictLine}>
                                <Text style={styles.verdictLabel}>{t('Decision')}: </Text>{detail.decision}
                              </Text>
                            )}
                            {!!detail.remarks && (
                              <Text style={styles.verdictLine}>
                                <Text style={styles.verdictLabel}>{t('Remark')}: </Text>{detail.remarks}
                              </Text>
                            )}
                          </View>
                        )}
                      </>
                    )}
                  </View>
                )}
              </View>
            )
          })}
        </View>
      )}
    </ScrollView>
  )
}
