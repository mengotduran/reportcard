import { useEffect, useState, useCallback } from 'react'
import {
  View, Text, ScrollView, TextInput, TouchableOpacity, StyleSheet,
  ActivityIndicator, Alert, Keyboard,
} from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { getClasses, ClassLevel } from '@/lib/api/classes'
import { getClassFees, addBulkPayments, formatXAF, ClassFees, FeeStatus } from '@/lib/api/fees'
import { useTheme, Colors } from '@/lib/useTheme'
import { useT } from '@/lib/i18n'
import StudentFeesModal from '@/components/StudentFeesModal'

type RowEntry = { amount: string; date: string; note: string }

function chipColors(status: FeeStatus): { bg: string; fg: string } {
  switch (status) {
    case 'COMPLETE': return { bg: '#dcfce7', fg: '#16a34a' }
    case 'PARTIAL': return { bg: '#fef3c7', fg: '#92400e' }
    case 'UNPAID': return { bg: '#fee2e2', fg: '#dc2626' }
    default: return { bg: '#f3f4f6', fg: '#6b7280' }
  }
}

export default function FeesGridScreen() {
  const { colors } = useTheme()
  const s = makeStyles(colors)
  const t = useT()
  const today = new Date().toISOString().slice(0, 10)
  const [classes, setClasses] = useState<ClassLevel[]>([])
  const [activeClass, setActiveClass] = useState('')
  const [data, setData] = useState<ClassFees | null>(null)
  const [loading, setLoading] = useState(false)
  const [rows, setRows] = useState<Record<string, RowEntry>>({})
  const [saving, setSaving] = useState(false)
  const [historyFor, setHistoryFor] = useState<{ id: string; name: string } | null>(null)

  const loadClass = useCallback(async (name: string) => {
    setActiveClass(name)
    setRows({})
    setLoading(true)
    try {
      setData(await getClassFees(name))
    } catch {
      Alert.alert(t('Error'), t('Failed to load fees.'))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    getClasses().then((d) => {
      const sorted = d.classLevels.sort((a, b) => a.order - b.order)
      setClasses(sorted)
      if (sorted.length) loadClass(sorted[0].name)
    }).catch(() => {})
  }, [loadClass])

  const reload = async () => { if (activeClass) setData(await getClassFees(activeClass)) }

  const rowOf = (id: string): RowEntry => rows[id] ?? { amount: '', date: today, note: '' }
  const setField = (id: string, field: keyof RowEntry, value: string) =>
    setRows((p) => ({ ...p, [id]: { ...rowOf(id), [field]: value } }))

  const enteredCount = Object.values(rows).filter((r) => Number(r.amount) > 0).length

  const handleSaveAll = async () => {
    Keyboard.dismiss()
    const entries = Object.entries(rows)
      .filter(([, r]) => Number(r.amount) > 0)
      .map(([studentId, r]) => ({ studentId, amount: Number(r.amount), paidOn: r.date || today, note: r.note.trim() || undefined }))
    if (entries.length === 0) {
      Alert.alert(t('Validation'), t('Enter at least one payment amount greater than zero'))
      return
    }
    if (entries.some((e) => !/^\d{4}-\d{2}-\d{2}$/.test(e.paidOn))) {
      Alert.alert(t('Validation'), t('Enter the date as YYYY-MM-DD'))
      return
    }
    setSaving(true)
    try {
      const res = await addBulkPayments({ entries })
      Alert.alert(t('Done'), `${res.recorded} ${res.recorded === 1 ? t('payment recorded') : t('payments recorded')}`)
      setRows({})
      await reload()
    } catch (e: any) {
      Alert.alert(t('Error'), e?.response?.data?.message ?? t('Failed to record payment.'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <View style={s.container}>
      {/* Class chips */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false}
        style={{ flexGrow: 0 }} contentContainerStyle={s.chipsRow}>
        {classes.map((c) => (
          <TouchableOpacity key={c.id} onPress={() => loadClass(c.name)}
            style={[s.chip, activeClass === c.name && s.chipActive]}>
            <Text style={[s.chipText, activeClass === c.name && s.chipTextActive]}>{c.name}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {loading ? (
        <View style={s.center}><ActivityIndicator size="large" color="#F03E2F" /></View>
      ) : !data || data.students.length === 0 ? (
        <View style={s.center}>
          <Ionicons name="wallet-outline" size={40} color="#d1d5db" />
          <Text style={s.empty}>{t('No students found')}</Text>
        </View>
      ) : (
        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 12, paddingBottom: 90 }} keyboardShouldPersistTaps="handled">
          {data.feeAmount === 0 && (
            <Text style={s.hint}>{t('No fee is set for this class. Set it on the Classes page.')}</Text>
          )}
          {data.students.map((st, i) => {
            const cc = chipColors(st.status)
            const done = st.balance === 0 && data.feeAmount > 0
            const r = rowOf(st.studentId)
            return (
              <View key={st.studentId} style={s.card}>
                <View style={s.cardTop}>
                  <View style={{ flex: 1 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      <Text style={s.rowNum}>{i + 1}.</Text>
                      <Text style={s.name} numberOfLines={1}>{st.name}</Text>
                    </View>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 3 }}>
                      <Text style={s.metaPaid}>{t('Paid')}: {formatXAF(st.paid)}</Text>
                      <Text style={s.metaBal}>{t('Balance')}: {formatXAF(st.balance)}</Text>
                    </View>
                  </View>
                  <View style={{ alignItems: 'flex-end', gap: 4 }}>
                    <View style={[s.statusChip, { backgroundColor: cc.bg }]}>
                      <Text style={[s.statusText, { color: cc.fg }]}>
                        {st.status === 'COMPLETE' ? t('Fees complete') : st.status === 'PARTIAL' ? t('Partly paid') : st.status === 'UNPAID' ? t('Not paid') : t('No fee set')}
                      </Text>
                    </View>
                    <TouchableOpacity onPress={() => setHistoryFor({ id: st.studentId, name: st.name })} style={s.historyBtn}>
                      <Ionicons name="eye-outline" size={14} color="#7c3aed" />
                      <Text style={s.historyText}>{t('View details')}</Text>
                    </TouchableOpacity>
                  </View>
                </View>

                {!done && data.feeAmount > 0 && (
                  <View style={s.inputsRow}>
                    <View style={{ width: 96 }}>
                      <Text style={s.inLabel}>{t('Amount')}</Text>
                      <TextInput style={s.input} value={r.amount}
                        onChangeText={(v) => setField(st.studentId, 'amount', v)}
                        keyboardType="numeric" placeholder="0" placeholderTextColor="#9ca3af" />
                    </View>
                    <View style={{ width: 120 }}>
                      <Text style={s.inLabel}>{t('Date')}</Text>
                      <TextInput style={s.input} value={r.date}
                        onChangeText={(v) => setField(st.studentId, 'date', v)}
                        placeholder="YYYY-MM-DD" placeholderTextColor="#9ca3af" autoCapitalize="none" />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={s.inLabel}>{t('Note (optional)')}</Text>
                      <TextInput style={s.input} value={r.note}
                        onChangeText={(v) => setField(st.studentId, 'note', v)}
                        placeholder={t('e.g. First installment')} placeholderTextColor="#9ca3af" />
                    </View>
                  </View>
                )}
              </View>
            )
          })}
        </ScrollView>
      )}

      {/* Save All footer */}
      {data && data.students.length > 0 && (
        <View style={s.footer}>
          <TouchableOpacity style={[s.saveBtn, (saving || enteredCount === 0) && { opacity: 0.5 }]}
            onPress={handleSaveAll} disabled={saving || enteredCount === 0}>
            {saving
              ? <ActivityIndicator color="#fff" />
              : <><Ionicons name="save-outline" size={18} color="#fff" /><Text style={s.saveBtnText}>{t('Save All')}{enteredCount ? ` (${enteredCount})` : ''}</Text></>}
          </TouchableOpacity>
        </View>
      )}

      {historyFor && (
        <StudentFeesModal
          studentId={historyFor.id}
          studentName={historyFor.name}
          visible={!!historyFor}
          onClose={() => setHistoryFor(null)}
          onChanged={reload}
        />
      )}
    </View>
  )
}

const makeStyles = (colors: Colors) => StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bgSecondary },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 10, padding: 24 },
  empty: { fontSize: 14, color: colors.textMuted },
  chipsRow: { paddingHorizontal: 12, paddingVertical: 10, gap: 8 },
  chip: { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 20, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card },
  chipActive: { borderColor: '#F03E2F', backgroundColor: '#FEF2F1' },
  chipText: { fontSize: 13, fontWeight: '600', color: colors.textSecondary },
  chipTextActive: { color: '#F03E2F' },
  hint: { fontSize: 12, color: colors.textMuted, textAlign: 'center', marginBottom: 8 },
  card: { backgroundColor: colors.card, borderRadius: 12, padding: 12, marginBottom: 8, borderWidth: 1, borderColor: colors.border },
  cardTop: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  rowNum: { fontSize: 11, color: colors.textMuted },
  name: { fontSize: 14, fontWeight: '700', color: colors.text, flexShrink: 1 },
  metaPaid: { fontSize: 11, color: '#16a34a', fontWeight: '600' },
  metaBal: { fontSize: 11, color: colors.textSecondary, fontWeight: '600' },
  statusChip: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 20 },
  statusText: { fontSize: 10, fontWeight: '700' },
  historyBtn: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  historyText: { fontSize: 11, color: '#7c3aed', fontWeight: '600' },
  inputsRow: { flexDirection: 'row', gap: 8, marginTop: 10 },
  inLabel: { fontSize: 10, color: colors.textSecondary, marginBottom: 3 },
  input: { borderWidth: 1, borderColor: colors.border, borderRadius: 10, paddingVertical: 8, paddingHorizontal: 10, fontSize: 14, color: colors.text, backgroundColor: colors.bgSecondary },
  footer: { position: 'absolute', left: 0, right: 0, bottom: 0, padding: 12, backgroundColor: colors.card, borderTopWidth: 1, borderTopColor: colors.border },
  saveBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: '#F03E2F', borderRadius: 12, paddingVertical: 14 },
  saveBtnText: { color: '#fff', fontWeight: '700', fontSize: 15 },
})
