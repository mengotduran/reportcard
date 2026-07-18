import { useEffect, useState, useCallback } from 'react'
import {
  View, Text, ScrollView, TextInput, TouchableOpacity, StyleSheet,
  ActivityIndicator, Alert, Modal, KeyboardAvoidingView, Platform,
} from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { useTheme, Colors } from '@/lib/useTheme'
import { useT, useLocaleCode } from '@/lib/i18n'
import { useAuthStore } from '@/lib/store/auth.store'
import {
  getStudentHndRegistration, addHndRegistrationPayment, deleteHndRegistrationPayment,
  HndRegDetail, RegStatus,
} from '@/lib/api/hndRegistration'
import { formatXAF } from '@/lib/api/fees'

function statusChip(status: RegStatus, t: (s: string) => string) {
  const map: Record<RegStatus, { label: string; bg: string; fg: string }> = {
    COMPLETE: { label: t('Registration paid'), bg: '#dcfce7', fg: '#16a34a' },
    PARTIAL: { label: t('Partly paid'), bg: '#fef3c7', fg: '#92400e' },
    UNPAID: { label: t('Not paid'), bg: '#fee2e2', fg: '#dc2626' },
  }
  return map[status]
}

export default function ExamRegistrationModal({
  studentId,
  studentName,
  visible,
  onClose,
  onChanged,
}: {
  studentId: string
  studentName: string
  visible: boolean
  onClose: () => void
  onChanged?: () => void
}) {
  const { colors } = useTheme()
  const s = makeStyles(colors)
  const t = useT()
  const locale = useLocaleCode()
  const { school } = useAuthStore()
  const isUniversity = school?.type === 'UNIVERSITY'
  const [data, setData] = useState<HndRegDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [amount, setAmount] = useState('')
  const [paidOn, setPaidOn] = useState(() => new Date().toISOString().slice(0, 10))
  const [note, setNote] = useState('')
  const [saving, setSaving] = useState(false)

  const load = useCallback(async () => {
    try {
      setLoading(true)
      setData(await getStudentHndRegistration(studentId))
    } catch {
      Alert.alert(t('Error'), t('Failed to load registration details.'))
    } finally {
      setLoading(false)
    }
  }, [studentId])

  useEffect(() => { if (visible) load() }, [visible, load])

  const handleAdd = async () => {
    const amt = Number(amount)
    if (!Number.isFinite(amt) || amt <= 0) {
      Alert.alert(t('Validation'), t('Enter a payment amount greater than zero'))
      return
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(paidOn)) {
      Alert.alert(t('Validation'), t('Enter the date as YYYY-MM-DD'))
      return
    }
    setSaving(true)
    try {
      const updated = await addHndRegistrationPayment(studentId, { amount: amt, paidOn, note: note.trim() || undefined })
      setData(updated)
      setAmount('')
      setNote('')
      onChanged?.()
    } catch (e: any) {
      Alert.alert(t('Error'), e?.response?.data?.message ?? t('Failed to record payment.'))
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = (paymentId: string) => {
    Alert.alert(t('Remove payment'), t('This cannot be undone.'), [
      { text: t('Cancel'), style: 'cancel' },
      {
        text: t('Delete'),
        style: 'destructive',
        onPress: async () => {
          try {
            await deleteHndRegistrationPayment(paymentId)
            await load()
            onChanged?.()
          } catch {
            Alert.alert(t('Error'), t('Failed to remove payment.'))
          }
        },
      },
    ])
  }

  const fmtDate = (iso: string) =>
    new Date(iso).toLocaleDateString(locale, { day: '2-digit', month: 'short', year: 'numeric' })

  const chip = data ? statusChip(data.status, t) : null
  let cumulative = 0

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView style={s.overlay} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={s.sheet}>
          <View style={s.handle} />
          <View style={s.header}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 }}>
              <Ionicons name="bookmark-outline" size={20} color="#F03E2F" />
              <View style={{ flex: 1 }}>
                <Text style={s.title}>{isUniversity ? t('HND Registration') : t('GCE Registration')}</Text>
                <Text style={s.subtitle} numberOfLines={1}>{studentName}{data?.session ? ` · ${data.session}` : ''}</Text>
              </View>
            </View>
            <TouchableOpacity onPress={onClose} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
              <Ionicons name="close" size={22} color="#6b7280" />
            </TouchableOpacity>
          </View>

          {loading ? (
            <View style={{ paddingVertical: 40 }}><ActivityIndicator size="large" color="#F03E2F" /></View>
          ) : data ? (
            <ScrollView keyboardShouldPersistTaps="handled" style={{ maxHeight: '88%' }}>
              {/* Summary */}
              <View style={s.summaryRow}>
                <View style={s.summaryCard}>
                  <Text style={s.summaryLabel}>{t('Registration fee')}</Text>
                  <Text style={s.summaryValue}>{formatXAF(data.fee)}</Text>
                </View>
                <View style={s.summaryCard}>
                  <Text style={s.summaryLabel}>{t('Paid')}</Text>
                  <Text style={[s.summaryValue, { color: '#16a34a' }]}>{formatXAF(data.totalPaid)}</Text>
                </View>
                <View style={s.summaryCard}>
                  <Text style={s.summaryLabel}>{t('Balance')}</Text>
                  <Text style={[s.summaryValue, { color: '#F03E2F' }]}>{formatXAF(data.balance)}</Text>
                </View>
              </View>
              {/* Student details */}
              <View style={s.detailBox}>
                <View style={s.detailRow}>
                  <Text style={s.detailLabel}>{t('Student ID')}</Text>
                  <Text style={s.detailValue}>{data.student.studentId}</Text>
                </View>
                <View style={s.detailRow}>
                  <Text style={s.detailLabel}>{isUniversity ? t('Department') : t('Class')}</Text>
                  <Text style={s.detailValue}>{data.student.classLevel.replace(/^HND /, '').replace(/ - Level \d+$/i, '')}</Text>
                </View>
                <View style={s.detailRow}>
                  <Text style={s.detailLabel}>{t('Session')}</Text>
                  <Text style={s.detailValue}>{data.session || '—'}</Text>
                </View>
                <View style={[s.detailRow, { borderBottomWidth: 0 }]}>
                  <Text style={s.detailLabel}>{t('Installments')}</Text>
                  <Text style={s.detailValue}>{data.payments.length}</Text>
                </View>
              </View>
              {chip && (
                <View style={{ alignSelf: 'flex-start', marginBottom: 12 }}>
                  <View style={[s.chip, { backgroundColor: chip.bg }]}>
                    <Text style={[s.chipText, { color: chip.fg }]}>{chip.label}</Text>
                  </View>
                </View>
              )}

              {/* Ledger */}
              <View style={s.ledger}>
                <View style={s.ledgerHead}>
                  <Text style={[s.lhText, { flex: 1.3 }]}>{t('Date')}</Text>
                  <Text style={[s.lhText, { flex: 1, textAlign: 'right' }]}>{t('Amount paid')}</Text>
                  <Text style={[s.lhText, { flex: 1, textAlign: 'right' }]}>{t('Balance left')}</Text>
                  <View style={{ width: 28 }} />
                </View>
                {data.payments.length === 0 ? (
                  <Text style={s.empty}>{t('No payments recorded yet.')}</Text>
                ) : data.payments.map((p) => {
                  cumulative += p.amount
                  const left = Math.max(0, data.fee - cumulative)
                  return (
                    <View key={p.id} style={s.ledgerRow}>
                      <View style={{ flex: 1.3 }}>
                        <Text style={s.cellText}>{fmtDate(p.paidOn)}</Text>
                        {!!p.note && <Text style={s.noteText} numberOfLines={1}>{p.note}</Text>}
                      </View>
                      <Text style={[s.cellText, { flex: 1, textAlign: 'right', color: '#16a34a', fontWeight: '700' }]}>{formatXAF(p.amount)}</Text>
                      <Text style={[s.cellText, { flex: 1, textAlign: 'right' }]}>{formatXAF(left)}</Text>
                      <TouchableOpacity style={{ width: 28, alignItems: 'flex-end' }} onPress={() => handleDelete(p.id)}>
                        <Ionicons name="trash-outline" size={15} color="#ef4444" />
                      </TouchableOpacity>
                    </View>
                  )
                })}
              </View>

              {/* Add payment */}
              {data.balance > 0 ? (
                <View style={s.addBox}>
                  <Text style={s.addTitle}>{t('Record a payment')}</Text>
                  <Text style={s.fieldLabel}>{t('Amount paid')} <Text style={s.required}>*</Text></Text>
                  <TextInput style={s.input} value={amount} onChangeText={setAmount}
                    placeholder={String(data.fee)} placeholderTextColor="#9ca3af" keyboardType="numeric" />
                  <Text style={s.fieldLabel}>{t('Payment date')} <Text style={s.required}>*</Text></Text>
                  <TextInput style={s.input} value={paidOn} onChangeText={setPaidOn}
                    placeholder="YYYY-MM-DD" placeholderTextColor="#9ca3af" autoCapitalize="none" />
                  <Text style={s.fieldLabel}>{t('Note (optional)')}</Text>
                  <TextInput style={s.input} value={note} onChangeText={setNote}
                    placeholder={t('e.g. Cash')} placeholderTextColor="#9ca3af" />
                  <TouchableOpacity style={[s.addBtn, saving && { opacity: 0.5 }]} onPress={handleAdd} disabled={saving}>
                    {saving
                      ? <ActivityIndicator color="#fff" size="small" />
                      : <><Ionicons name="add" size={16} color="#fff" /><Text style={s.addBtnText}>{t('Add')}</Text></>}
                  </TouchableOpacity>
                </View>
              ) : (
                <Text style={[s.hint, { color: '#16a34a', fontWeight: '600' }]}>{t('Registration fee fully paid. ✓')}</Text>
              )}
            </ScrollView>
          ) : null}
        </View>
      </KeyboardAvoidingView>
    </Modal>
  )
}

const makeStyles = (colors: Colors) => StyleSheet.create({
  overlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.45)' },
  sheet: { backgroundColor: colors.card, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20, paddingBottom: Platform.OS === 'ios' ? 36 : 20, maxHeight: '92%' },
  handle: { width: 40, height: 4, backgroundColor: '#e5e7eb', borderRadius: 2, alignSelf: 'center', marginBottom: 14 },
  header: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 14 },
  title: { fontSize: 16, fontWeight: '700', color: colors.text },
  subtitle: { fontSize: 12, color: colors.textSecondary, marginTop: 1 },
  summaryRow: { flexDirection: 'row', gap: 8, marginBottom: 12 },
  summaryCard: { flex: 1, backgroundColor: colors.bgSecondary, borderRadius: 12, padding: 10, alignItems: 'center' },
  summaryLabel: { fontSize: 10, color: colors.textMuted },
  summaryValue: { fontSize: 13, fontWeight: '800', color: colors.text, marginTop: 3, textAlign: 'center' },
  chip: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20 },
  chipText: { fontSize: 11, fontWeight: '700' },
  detailBox: { borderWidth: 1, borderColor: colors.border, borderRadius: 12, paddingHorizontal: 12, marginBottom: 12 },
  detailRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 9, borderBottomWidth: 1, borderBottomColor: colors.border },
  detailLabel: { fontSize: 12, color: colors.textSecondary },
  detailValue: { fontSize: 13, fontWeight: '600', color: colors.text },
  ledger: { borderWidth: 1, borderColor: colors.border, borderRadius: 12, overflow: 'hidden', marginBottom: 12 },
  ledgerHead: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.bgSecondary, paddingHorizontal: 10, paddingVertical: 8, gap: 6 },
  lhText: { fontSize: 10, fontWeight: '700', color: colors.textMuted, textTransform: 'uppercase' },
  ledgerRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 10, paddingVertical: 9, gap: 6, borderTopWidth: 1, borderTopColor: colors.border },
  cellText: { fontSize: 12, color: colors.text },
  noteText: { fontSize: 10, color: colors.textMuted, marginTop: 1 },
  empty: { textAlign: 'center', color: colors.textMuted, fontSize: 12, paddingVertical: 16 },
  addBox: { backgroundColor: colors.bgSecondary, borderRadius: 12, padding: 12, marginBottom: 8 },
  addTitle: { fontSize: 12, fontWeight: '700', color: colors.text, marginBottom: 8 },
  fieldLabel: { fontSize: 11, color: colors.textSecondary, marginBottom: 4, marginTop: 6 },
  required: { color: '#ef4444' },
  input: { borderWidth: 1, borderColor: colors.border, borderRadius: 10, padding: 10, fontSize: 14, color: colors.text, backgroundColor: colors.card },
  addBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: '#F03E2F', borderRadius: 10, paddingVertical: 12, marginTop: 12 },
  addBtnText: { color: '#fff', fontWeight: '700', fontSize: 14 },
  hint: { fontSize: 13, color: colors.textMuted, textAlign: 'center', paddingVertical: 8 },
})
