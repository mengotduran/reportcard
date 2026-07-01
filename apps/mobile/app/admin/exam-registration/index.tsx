import { useEffect, useState, useMemo, useCallback } from 'react'
import {
  View, Text, ScrollView, TextInput, TouchableOpacity, StyleSheet,
  ActivityIndicator, Alert, Keyboard,
} from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { useAuthStore } from '@/lib/store/auth.store'
import { getHndRegistrationList, updateDepartmentFee, HndRegList, HndRegRow, DepartmentFeeRow, RegStatus } from '@/lib/api/hndRegistration'
import { formatXAF } from '@/lib/api/fees'
import { useTheme, Colors } from '@/lib/useTheme'
import { useT } from '@/lib/i18n'
import ExamRegistrationModal from '@/components/ExamRegistrationModal'

function statusChipColors(status: RegStatus): { bg: string; fg: string } {
  switch (status) {
    case 'COMPLETE': return { bg: '#dcfce7', fg: '#16a34a' }
    case 'PARTIAL': return { bg: '#fef3c7', fg: '#92400e' }
    case 'UNPAID': return { bg: '#fee2e2', fg: '#dc2626' }
  }
}

export default function ExamRegistrationScreen() {
  const { colors } = useTheme()
  const s = makeStyles(colors)
  const t = useT()
  const { school } = useAuthStore()
  const isUniversity = school?.type === 'UNIVERSITY'
  const groupWord = isUniversity ? t('Department') : t('Class')

  const [data, setData] = useState<HndRegList | null>(null)
  const [loading, setLoading] = useState(true)
  const [activeDept, setActiveDept] = useState('ALL')
  const [search, setSearch] = useState('')
  const [detailFor, setDetailFor] = useState<{ id: string; name: string } | null>(null)
  const [editingFee, setEditingFee] = useState<string | null>(null)
  const [feeInput, setFeeInput] = useState('')
  const [savingFee, setSavingFee] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      setData(await getHndRegistrationList())
    } catch {
      Alert.alert(t('Error'), t('Failed to load exam registration data.'))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  const departments = useMemo(() => {
    if (!data) return []
    return ['ALL', ...Array.from(new Set(data.students.map((d) => d.department))).sort()]
  }, [data])

  const filtered = useMemo<HndRegRow[]>(() => {
    if (!data) return []
    let rows = activeDept === 'ALL' ? data.students : data.students.filter((r) => r.department === activeDept)
    if (search.trim()) {
      const q = search.toLowerCase()
      rows = rows.filter((r) => r.name.toLowerCase().includes(q) || r.studentIdCode.toLowerCase().includes(q))
    }
    return rows
  }, [data, activeDept, search])

  const stats = useMemo(() => {
    if (!data) return { total: 0, paid: 0, partial: 0, unpaid: 0 }
    const src = activeDept === 'ALL' ? data.students : data.students.filter((r) => r.department === activeDept)
    return {
      total: src.length,
      paid: src.filter((r) => r.status === 'COMPLETE').length,
      partial: src.filter((r) => r.status === 'PARTIAL').length,
      unpaid: src.filter((r) => r.status === 'UNPAID').length,
    }
  }, [data, activeDept])

  const handleEditFee = (dept: DepartmentFeeRow) => {
    setEditingFee(dept.classLevel)
    setFeeInput(dept.isDefault ? '' : String(dept.fee))
  }

  const handleSaveFee = async (classLevel: string) => {
    Keyboard.dismiss()
    const val = feeInput.trim()
    const fee = val === '' ? null : Math.round(Number(val))
    if (val !== '' && (!Number.isFinite(fee) || fee! < 0)) {
      Alert.alert(t('Validation'), t('Enter a valid fee amount (or leave blank to use the default)'))
      return
    }
    setSavingFee(true)
    try {
      await updateDepartmentFee(classLevel, fee)
      await load()
      setEditingFee(null)
    } catch {
      Alert.alert(t('Error'), t('Failed to update fee'))
    } finally {
      setSavingFee(false)
    }
  }

  return (
    <View style={s.container}>
      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 12, paddingBottom: 40 }} keyboardShouldPersistTaps="handled">
        {loading && !data ? (
          <View style={s.center}><ActivityIndicator size="large" color="#F03E2F" /></View>
        ) : (
          <>
            {/* Stats */}
            <View style={s.statsRow}>
              {[
                { label: t('Total students'), value: stats.total, color: colors.text },
                { label: t('Paid'), value: stats.paid, color: '#16a34a' },
                { label: t('Partial'), value: stats.partial, color: '#d97706' },
                { label: t('Not paid'), value: stats.unpaid, color: '#dc2626' },
              ].map((st) => (
                <View key={st.label} style={s.statCard}>
                  <Text style={s.statLabel}>{st.label}</Text>
                  <Text style={[s.statValue, { color: st.color }]}>{st.value}</Text>
                </View>
              ))}
            </View>

            {/* Fee per department/class */}
            {data && data.departments.length > 0 && (
              <View style={s.feeBox}>
                <Text style={s.feeBoxTitle}>{t('Registration Fee per')} {groupWord}</Text>
                {data.departments.map((dept) => (
                  <View key={dept.classLevel} style={s.feeRow}>
                    <Text style={s.feeRowLabel} numberOfLines={1}>{dept.department}</Text>
                    {editingFee === dept.classLevel ? (
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                        <TextInput
                          style={s.feeInput}
                          keyboardType="numeric"
                          placeholder={String(data.defaultFee)}
                          placeholderTextColor="#9ca3af"
                          value={feeInput}
                          onChangeText={setFeeInput}
                          autoFocus
                        />
                        <TouchableOpacity onPress={() => handleSaveFee(dept.classLevel)} disabled={savingFee} style={s.feeSaveBtn}>
                          {savingFee ? <ActivityIndicator size="small" color="#fff" /> : <Ionicons name="checkmark" size={14} color="#fff" />}
                        </TouchableOpacity>
                        <TouchableOpacity onPress={() => setEditingFee(null)} style={s.feeCancelBtn}>
                          <Ionicons name="close" size={14} color={colors.textSecondary} />
                        </TouchableOpacity>
                      </View>
                    ) : (
                      <TouchableOpacity onPress={() => handleEditFee(dept)} style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                        <Text style={[s.feeValue, dept.isDefault && { color: colors.textMuted, fontWeight: '500' }]}>
                          {formatXAF(dept.fee)}{dept.isDefault ? ` (${t('default')})` : ''}
                        </Text>
                        <Ionicons name="pencil-outline" size={13} color={colors.textMuted} />
                      </TouchableOpacity>
                    )}
                  </View>
                ))}
              </View>
            )}

            {/* Department/class chips */}
            {departments.length > 1 && (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexGrow: 0 }} contentContainerStyle={s.chipsRow}>
                {departments.map((dept) => (
                  <TouchableOpacity key={dept} onPress={() => { setActiveDept(dept); setSearch('') }}
                    style={[s.chip, activeDept === dept && s.chipActive]}>
                    <Text style={[s.chipText, activeDept === dept && s.chipTextActive]}>
                      {dept === 'ALL' ? (isUniversity ? t('All departments') : t('All classes')) : dept}
                    </Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            )}

            {/* Search */}
            <View style={s.searchWrap}>
              <Ionicons name="search-outline" size={16} color={colors.textMuted} style={{ marginRight: 6 }} />
              <TextInput
                style={s.searchInput}
                placeholder={t('Search by name or matric…')}
                placeholderTextColor="#9ca3af"
                value={search}
                onChangeText={setSearch}
              />
              {!!search && (
                <TouchableOpacity onPress={() => setSearch('')}>
                  <Ionicons name="close-circle" size={16} color={colors.textMuted} />
                </TouchableOpacity>
              )}
            </View>

            {/* List */}
            {!data || data.students.length === 0 ? (
              <View style={s.center}>
                <Ionicons name="bookmark-outline" size={40} color="#d1d5db" />
                <Text style={s.empty}>
                  {isUniversity
                    ? t('No Level 2 students found. Make sure Level 2 department classes exist.')
                    : t('No Form 5 or Upper Sixth students found. Make sure those classes exist.')}
                </Text>
              </View>
            ) : filtered.length === 0 ? (
              <View style={s.center}><Text style={s.empty}>{t('No students match your search.')}</Text></View>
            ) : (
              filtered.map((row, i) => {
                const cc = statusChipColors(row.status)
                return (
                  <View key={row.studentId} style={s.card}>
                    <View style={s.cardTop}>
                      <View style={{ flex: 1 }}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                          <Text style={s.rowNum}>{i + 1}.</Text>
                          <Text style={s.name} numberOfLines={1}>{row.name}</Text>
                        </View>
                        <Text style={s.metaId}>{row.studentIdCode} · {row.department}</Text>
                        <Text style={s.metaPaid}>{t('Paid')}: {row.paid > 0 ? formatXAF(row.paid) : '—'}</Text>
                      </View>
                      <View style={{ alignItems: 'flex-end', gap: 6 }}>
                        <View style={[s.statusChip, { backgroundColor: cc.bg }]}>
                          <Text style={[s.statusText, { color: cc.fg }]}>
                            {row.status === 'COMPLETE' ? t('Paid') : row.status === 'UNPAID' ? t('Not paid') : `${formatXAF(row.balance)} ${t('left')}`}
                          </Text>
                        </View>
                        <TouchableOpacity onPress={() => setDetailFor({ id: row.studentId, name: row.name })} style={s.detailsBtn}>
                          <Text style={s.detailsText}>{t('Details')}</Text>
                        </TouchableOpacity>
                      </View>
                    </View>
                  </View>
                )
              })
            )}
          </>
        )}
      </ScrollView>

      {detailFor && (
        <ExamRegistrationModal
          studentId={detailFor.id}
          studentName={detailFor.name}
          visible={!!detailFor}
          onClose={() => setDetailFor(null)}
          onChanged={load}
        />
      )}
    </View>
  )
}

const makeStyles = (colors: Colors) => StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bgSecondary },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 10, padding: 24 },
  empty: { fontSize: 13, color: colors.textMuted, textAlign: 'center' },
  statsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 12 },
  statCard: { flexBasis: '48%', flexGrow: 1, backgroundColor: colors.card, borderRadius: 12, borderWidth: 1, borderColor: colors.border, padding: 12, alignItems: 'center' },
  statLabel: { fontSize: 11, color: colors.textMuted, marginBottom: 4 },
  statValue: { fontSize: 20, fontWeight: '800' },
  feeBox: { backgroundColor: colors.card, borderRadius: 12, borderWidth: 1, borderColor: colors.border, padding: 12, marginBottom: 12 },
  feeBoxTitle: { fontSize: 12, fontWeight: '700', color: colors.text, marginBottom: 8 },
  feeRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 8, borderTopWidth: 1, borderTopColor: colors.border },
  feeRowLabel: { flex: 1, fontSize: 13, fontWeight: '600', color: colors.text, marginRight: 8 },
  feeValue: { fontSize: 13, fontWeight: '700', color: colors.text },
  feeInput: { width: 90, borderWidth: 1, borderColor: colors.border, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 6, fontSize: 13, color: colors.text, backgroundColor: colors.bgSecondary },
  feeSaveBtn: { backgroundColor: '#F03E2F', borderRadius: 8, width: 28, height: 28, alignItems: 'center', justifyContent: 'center' },
  feeCancelBtn: { borderWidth: 1, borderColor: colors.border, borderRadius: 8, width: 28, height: 28, alignItems: 'center', justifyContent: 'center' },
  chipsRow: { paddingVertical: 4, gap: 8 },
  chip: { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 20, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card },
  chipActive: { borderColor: '#F03E2F', backgroundColor: '#FEF2F1' },
  chipText: { fontSize: 13, fontWeight: '600', color: colors.textSecondary },
  chipTextActive: { color: '#F03E2F' },
  searchWrap: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 8, marginVertical: 10 },
  searchInput: { flex: 1, fontSize: 14, color: colors.text },
  card: { backgroundColor: colors.card, borderRadius: 12, padding: 12, marginBottom: 8, borderWidth: 1, borderColor: colors.border },
  cardTop: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  rowNum: { fontSize: 11, color: colors.textMuted },
  name: { fontSize: 14, fontWeight: '700', color: colors.text, flexShrink: 1 },
  metaId: { fontSize: 11, color: colors.textMuted, marginTop: 2 },
  metaPaid: { fontSize: 11, color: '#16a34a', fontWeight: '600', marginTop: 2 },
  statusChip: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 20 },
  statusText: { fontSize: 10, fontWeight: '700' },
  detailsBtn: { borderWidth: 1, borderColor: colors.border, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 5 },
  detailsText: { fontSize: 11, fontWeight: '600', color: colors.textSecondary },
})
