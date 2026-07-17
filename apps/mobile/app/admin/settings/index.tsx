// app/admin/settings/index.tsx
import { useEffect, useState } from 'react'
import { View, Text, ScrollView, StyleSheet, Image, TouchableOpacity, Alert } from 'react-native'
import api from '@/lib/api/client'
import { Ionicons } from '@expo/vector-icons'
import { useAuthStore } from '@/lib/store/auth.store'
import { useTheme, Colors } from '@/lib/useTheme'
import { API_BASE } from '@/lib/config'
import { useT } from '@/lib/i18n'

const makeStylesStyles = (colors: Colors) => StyleSheet.create(({
  container: { flex: 1, backgroundColor: colors.bgSecondary },
  content: { padding: 16, paddingBottom: 40 },
  logoSection: {
    alignItems: 'center',
    backgroundColor: colors.card,
    borderRadius: 16,
    padding: 24,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: colors.border,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 3,
    elevation: 1,
  },
  logo: {
    width: 90,
    height: 90,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: 14,
  },
  logoPlaceholder: {
    width: 90,
    height: 90,
    borderRadius: 18,
    backgroundColor: '#FEF2F1',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 14,
    borderWidth: 1,
    borderColor: '#FEE2E0',
  },
  schoolName: { fontSize: 18, fontWeight: '800', color: colors.text, textAlign: 'center' },
  typeBadge: {
    marginTop: 8,
    backgroundColor: '#FEF2F1',
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 20,
  },
  typeText: { fontSize: 11, fontWeight: '700', color: '#F03E2F', letterSpacing: 1 },
  sectionLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.textMuted,
    letterSpacing: 1,
    marginBottom: 10,
    marginLeft: 4,
  },
  card: {
    backgroundColor: colors.card,
    borderRadius: 16,
    padding: 4,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: colors.border,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 14,
  },
  rowLabel: { fontSize: 14, color: colors.textSecondary, fontWeight: '500' },
  rowValue: { fontSize: 14, color: colors.text, fontWeight: '600', maxWidth: '60%', textAlign: 'right' },
  divider: { height: 1, backgroundColor: colors.bgSecondary, marginHorizontal: 14 },
  webNote: {
    flexDirection: 'row',
    gap: 12,
    alignItems: 'flex-start',
    backgroundColor: '#FEF2F1',
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: '#FEE2E0',
  },
  webNoteTitle: { fontSize: 14, fontWeight: '700', color: '#1d4ed8', marginBottom: 4 },
  webNoteText: { fontSize: 13, color: '#F03E2F', lineHeight: 20 },
}))

function SettingRow({ label, value }: { label: string; value: string | null | undefined }) {
  const { colors } = useTheme()
  const styles = makeStylesStyles(colors)
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={styles.rowValue}>{value || '—'}</Text>
    </View>
  )
}

export default function SettingsScreen() {
  const { colors, isDark } = useTheme()
  const styles = makeStylesStyles(colors)
  const t = useT()
  const { school, setSchool } = useAuthStore()

  // Who records marks (university only). The one setting that IS editable here, because
  // an admin standing in a marks-entry dispute should not need a computer to resolve it.
  // The cap (2 switches per semester, then the provider) is enforced by the API; this
  // screen just states it before it bites.
  const isUniversity = school?.type === 'UNIVERSITY'
  const [marksMode, setMarksMode] = useState<'TEACHERS' | 'ADMIN_ONLY'>(school?.marksEntryMode ?? 'TEACHERS')
  const [switches, setSwitches] = useState<{ used: number; limit: number; termId: string | null; allowed: boolean } | null>(null)
  const [savingMode, setSavingMode] = useState(false)

  useEffect(() => {
    if (!isUniversity) return
    api.get('/school/settings').then(res => {
      setMarksMode(res.data.school?.marksEntryMode ?? 'TEACHERS')
      setSwitches(res.data.marksEntrySwitches ?? null)
      if (res.data.school) setSchool(res.data.school)
    }).catch(() => {})
  }, [isUniversity])

  const handleSetMode = async (mode: 'TEACHERS' | 'ADMIN_ONLY') => {
    if (mode === marksMode || savingMode) return
    const previous = marksMode
    setMarksMode(mode)
    setSavingMode(true)
    try {
      const res = await api.put('/school/settings', { marksEntryMode: mode })
      if (res.data.school) setSchool(res.data.school)
      const fresh = await api.get('/school/settings')
      setSwitches(fresh.data.marksEntrySwitches ?? null)
    } catch (err: any) {
      setMarksMode(previous)   // a silent revert would misstate the policy
      // The cap's 403 explains itself ("contact your provider"); a generic error would
      // send the admin hunting a bug instead.
      Alert.alert(t('Not changed'), err?.response?.data?.message ?? t('Failed to save'))
    } finally { setSavingMode(false) }
  }

  const logoUrl = school?.logo ? `${API_BASE}${school.logo}` : null

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.logoSection}>
        {logoUrl ? (
          <Image source={{ uri: logoUrl }} style={styles.logo} resizeMode="contain" />
        ) : (
          <View style={styles.logoPlaceholder}>
            <Ionicons name="business-outline" size={36} color="#F03E2F" />
          </View>
        )}
        <Text style={styles.schoolName}>{school?.name ?? '—'}</Text>
        {school?.type && (
          <View style={styles.typeBadge}>
            <Text style={styles.typeText}>{t(school.type)} {t('SCHOOL')}</Text>
          </View>
        )}
      </View>

      <Text style={styles.sectionLabel}>{t('SCHOOL INFORMATION')}</Text>
      <View style={styles.card}>
        <SettingRow label={t('School Name')} value={school?.name} />
        <View style={styles.divider} />
        <SettingRow label={t('School Type')} value={school?.type ? t(school.type) : school?.type} />
      </View>

      {isUniversity && (
        <>
          <Text style={styles.sectionLabel}>{t('WHO ENTERS MARKS')}</Text>
          <View style={styles.card}>
            {([
              { value: 'TEACHERS' as const, label: t('Teachers') },
              { value: 'ADMIN_ONLY' as const, label: t('Administration only') },
            ]).map((opt, i) => (
              <View key={opt.value}>
                {i > 0 && <View style={styles.divider} />}
                <TouchableOpacity
                  style={styles.row}
                  disabled={savingMode || (switches?.allowed === false && marksMode !== opt.value)}
                  onPress={() => handleSetMode(opt.value)}
                >
                  <Text style={[styles.rowLabel, marksMode === opt.value && { color: '#F03E2F', fontWeight: '700' }]}>{opt.label}</Text>
                  {marksMode === opt.value && <Ionicons name="checkmark-circle" size={18} color="#F03E2F" />}
                </TouchableOpacity>
              </View>
            ))}
            {switches && switches.termId && (
              <Text style={{ fontSize: 12, color: switches.allowed ? colors.textMuted : '#ef4444', paddingHorizontal: 14, paddingBottom: 12 }}>
                {switches.allowed
                  ? `${t('Switches used this semester:')} ${switches.used} ${t('of')} ${switches.limit}`
                  : t('Both switches used this semester. Contact your provider to change this.')}
              </Text>
            )}
          </View>
        </>
      )}

      <View style={styles.webNote}>
        <Ionicons name="desktop-outline" size={18} color="#F03E2F" />
        <View style={{ flex: 1 }}>
          <Text style={styles.webNoteTitle}>{t('Full Settings on Web')}</Text>
          <Text style={styles.webNoteText}>
            {t('To manage school logo, cover image, subdomain, contact info, and more, visit the web dashboard on your computer.')}
          </Text>
        </View>
      </View>
    </ScrollView>
  )
}
