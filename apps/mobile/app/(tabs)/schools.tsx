import { useEffect, useState, useCallback } from 'react'
import { useFocusEffect, useRouter } from 'expo-router'
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  ActivityIndicator, RefreshControl, Modal, TextInput,
  Alert, Switch, KeyboardAvoidingView, Platform,
} from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { useTheme, Colors } from '@/lib/useTheme'
import { useAuthStore } from '@/lib/store/auth.store'
import {
  getOverview, toggleSchool, toggleParentSchool, createStandaloneSchool, getSchoolAdmins,
  OverviewData, SchoolSection, ParentSchool,
} from '@/lib/api/superadmin'
import { resetUserPasswordApi } from '@/lib/api/auth'

const TYPE_COLOR: Record<string, { bg: string; text: string }> = {
  PRIMARY:    { bg: '#FEF2F1', text: '#F03E2F' },
  SECONDARY:  { bg: '#f5f3ff', text: '#7c3aed' },
  UNIVERSITY: { bg: '#fff7ed', text: '#ea580c' },
}

const SCHOOL_TYPES = ['PRIMARY', 'SECONDARY', 'UNIVERSITY']

const emptyForm = {
  schoolName: '', schoolType: 'SECONDARY', language: 'EN', schoolEmail: '', subdomain: '',
  adminName: '', adminEmail: '', adminPassword: '', phone: '',
}

const makeSStyles = (colors: Colors) => StyleSheet.create(({
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24, gap: 12 },

  summaryGrid: { flexDirection: 'row', flexWrap: 'wrap', padding: 14, gap: 10 },
  summaryCard: {
    width: '47.5%', backgroundColor: colors.card, borderRadius: 14,
    padding: 14, borderWidth: 1, borderColor: colors.border,
    alignItems: 'flex-start', gap: 4,
  },
  summaryIconWrap: { width: 36, height: 36, borderRadius: 10, justifyContent: 'center', alignItems: 'center', marginBottom: 4 },
  summaryVal: { fontSize: 22, fontWeight: '800', color: colors.text },
  summaryLabel: { fontSize: 11, color: colors.textMuted, lineHeight: 14 },

  group: {
    backgroundColor: colors.card, borderRadius: 14, marginBottom: 12,
    borderWidth: 1, borderColor: colors.border,
    overflow: 'hidden',
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04, shadowRadius: 3, elevation: 1,
  },
  groupHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    padding: 14, backgroundColor: colors.card,
    borderBottomWidth: 1, borderBottomColor: '#f3f4f6',
  },
  groupLeft: { flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 },
  groupRight: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  groupName: { fontSize: 15, fontWeight: '700', color: colors.text },
  groupSub: { fontSize: 11, color: colors.textMuted, marginTop: 1 },
  sections: { padding: 10, gap: 8, flexDirection: 'column' },

  schoolCard: {
    backgroundColor: colors.bgSecondary, borderRadius: 10,
    padding: 12, borderWidth: 1, borderColor: colors.border,
    marginBottom: 8,
  },
  schoolHeader: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 10 },
  schoolLeft: { flex: 1, gap: 2 },
  typeBadge: { alignSelf: 'flex-start', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 4, marginBottom: 4 },
  typeText: { fontSize: 10, fontWeight: '700' },
  schoolName: { fontSize: 13, fontWeight: '700', color: colors.text },
  schoolSub: { fontSize: 11, color: colors.textMuted },

  statsRow: { flexDirection: 'row', gap: 0, borderTopWidth: 1, borderTopColor: colors.border, paddingTop: 8 },
  stat: { flex: 1, alignItems: 'center', gap: 2 },
  statVal: { fontSize: 14, fontWeight: '700', color: colors.text },
  statLabel: { fontSize: 9, color: colors.textMuted, textTransform: 'uppercase' },

  emptyText: { fontSize: 13, color: colors.textMuted, textAlign: 'center', padding: 12 },

  fab: {
    position: 'absolute', bottom: 24, right: 20,
    width: 54, height: 54, borderRadius: 27,
    backgroundColor: '#dc2626', justifyContent: 'center', alignItems: 'center',
    shadowColor: '#dc2626', shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4, shadowRadius: 8, elevation: 8,
  },

  // Modal
  modalOverlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.5)' },
  modalSheet: {
    backgroundColor: colors.card, borderTopLeftRadius: 24, borderTopRightRadius: 24,
    padding: 20, maxHeight: '90%',
    paddingBottom: Platform.OS === 'ios' ? 36 : 20,
  },
  modalHandle: {
    width: 40, height: 4, backgroundColor: '#e5e7eb',
    borderRadius: 2, alignSelf: 'center', marginBottom: 16,
  },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  modalTitle: { fontSize: 18, fontWeight: '700', color: colors.text },

  formField: { marginBottom: 12 },
  formLabel: { fontSize: 12, fontWeight: '600', color: colors.text, marginBottom: 6 },
  formInput: {
    borderWidth: 1, borderColor: '#d1d5db', borderRadius: 10,
    paddingHorizontal: 12, paddingVertical: 10,
    fontSize: 14, color: colors.text, backgroundColor: colors.card,
  },

  typeRow: { flexDirection: 'row', gap: 8 },
  typeBtn: {
    flex: 1, paddingVertical: 8, borderRadius: 8,
    borderWidth: 1.5, borderColor: colors.border,
    alignItems: 'center', backgroundColor: colors.bgSecondary,
  },
  typeBtnActive: { borderColor: '#dc2626', backgroundColor: '#fef2f2' },
  typeBtnText: { fontSize: 11, fontWeight: '600', color: colors.textSecondary },
  typeBtnTextActive: { color: '#dc2626' },

  createBtn: {
    backgroundColor: '#dc2626', borderRadius: 12,
    paddingVertical: 14, alignItems: 'center', marginTop: 8, marginBottom: 16,
  },
  createBtnText: { color: '#fff', fontWeight: '700', fontSize: 15 },
  disabled: { opacity: 0.5 },
}))

function SchoolCard({ school, onToggle, onPress }: { school: SchoolSection; onToggle: () => void; onPress: () => void }) {
  const { colors } = useTheme()
  const s = makeSStyles(colors)
  const tc = TYPE_COLOR[school.type] ?? { bg: '#f3f4f6', text: '#374151' }

  const handleResetAdminPassword = async () => {
    try {
      const { admins } = await getSchoolAdmins(school.id)
      if (admins.length === 0) { Alert.alert('No Admins', 'This school has no admin accounts.'); return }
      const adminNames = admins.map((a, i) => `${i + 1}. ${a.name} (${a.role.replace('_', ' ')})`).join('\n')
      Alert.alert(
        'Reset Admin Password',
        `Admins for ${school.name}:\n\n${adminNames}\n\nEnter admin number to reset:`,
        [
          { text: 'Cancel', style: 'cancel' },
          ...admins.map((admin, i) => ({
            text: `${i + 1}. ${admin.name.split(' ')[0]}`,
            onPress: () => {
              Alert.prompt(
                `New Password`,
                `Set new password for ${admin.name}`,
                [
                  { text: 'Cancel', style: 'cancel' },
                  {
                    text: 'Set',
                    onPress: async (pw) => {
                      if (!pw || pw.length < 6) { Alert.alert('Error', 'Min 6 characters.'); return }
                      try {
                        await resetUserPasswordApi(admin.id, pw)
                        Alert.alert('Done', `Password updated for ${admin.name}.`)
                      } catch (e: any) {
                        Alert.alert('Error', e?.response?.data?.message || 'Failed to reset.')
                      }
                    },
                  },
                ],
                'secure-text'
              )
            },
          })).slice(0, 3), // Alert supports max 3 buttons on iOS
        ]
      )
    } catch {
      Alert.alert('Error', 'Failed to load admins.')
    }
  }

  return (
    <View style={s.schoolCard}>
      <TouchableOpacity onPress={onPress} activeOpacity={0.7}>
        <View style={s.schoolHeader}>
          <View style={s.schoolLeft}>
            <View style={[s.typeBadge, { backgroundColor: tc.bg }]}>
              <Text style={[s.typeText, { color: tc.text }]}>{school.type}</Text>
            </View>
            <Text style={s.schoolName} numberOfLines={1}>{school.name}</Text>
            <Text style={s.schoolSub}>{school.email}</Text>
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <TouchableOpacity onPress={handleResetAdminPassword} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Ionicons name="key-outline" size={16} color="#ea580c" />
            </TouchableOpacity>
            <Switch
              value={school.isActive}
              onValueChange={onToggle}
              trackColor={{ false: '#e5e7eb', true: '#bbf7d0' }}
              thumbColor={school.isActive ? '#16a34a' : '#9ca3af'}
            />
            <Ionicons name="chevron-forward" size={14} color="#9ca3af" />
          </View>
        </View>
        <View style={s.statsRow}>
          {[
            { icon: 'people-outline', val: school._count.students, label: 'Students' },
            { icon: 'person-outline', val: school._count.users, label: 'Staff' },
            { icon: 'document-text-outline', val: school._count.reportCards, label: 'Cards' },
          ].map((stat) => (
            <View key={stat.label} style={s.stat}>
              <Ionicons name={stat.icon as any} size={13} color="#6b7280" />
              <Text style={s.statVal}>{stat.val}</Text>
              <Text style={s.statLabel}>{stat.label}</Text>
            </View>
          ))}
        </View>
      </TouchableOpacity>
    </View>
  )
}

export default function SchoolsScreen() {
  const { colors, isDark } = useTheme()
  const s = makeSStyles(colors)
  const { user } = useAuthStore()
  const router = useRouter()
  const isSuperAdmin = user?.role === 'SUPERADMIN'
  const [data, setData] = useState<OverviewData | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [expanded, setExpanded] = useState<Record<string, boolean>>({})
  const [showCreate, setShowCreate] = useState(false)
  const [form, setForm] = useState(emptyForm)
  const [creating, setCreating] = useState(false)
  const [showPw, setShowPw] = useState(false)

  const fetchData = useCallback(async () => {
    try {
      const d = await getOverview()
      setData(d)
      const exp: Record<string, boolean> = {}
      d.parentSchools.forEach(p => { exp[p.id] = true })
      setExpanded(exp)
    } catch {
      Alert.alert('Error', 'Failed to load schools.')
    }
  }, [])

  useEffect(() => {
    if (!isSuperAdmin) { setLoading(false); return }
    fetchData().finally(() => setLoading(false))
  }, [fetchData, isSuperAdmin])

  useFocusEffect(useCallback(() => {
    if (!isSuperAdmin) return
    fetchData()
  }, [fetchData, isSuperAdmin]))

  const onRefresh = async () => { setRefreshing(true); await fetchData(); setRefreshing(false) }

  const handleToggleSchool = async (id: string) => {
    try {
      await toggleSchool(id)
      fetchData()
    } catch { Alert.alert('Error', 'Failed to update school status.') }
  }

  const handleToggleParent = async (id: string) => {
    try {
      await toggleParentSchool(id)
      fetchData()
    } catch { Alert.alert('Error', 'Failed to update group status.') }
  }

  const handleCreate = async () => {
    if (!form.schoolName || !form.schoolEmail || !form.subdomain || !form.adminName || !form.adminEmail || !form.adminPassword) {
      Alert.alert('Missing fields', 'Please fill in all required fields.')
      return
    }
    setCreating(true)
    try {
      await createStandaloneSchool(form)
      setShowCreate(false)
      setForm(emptyForm)
      fetchData()
      Alert.alert('Created', 'School created successfully.')
    } catch (e: any) {
      Alert.alert('Error', e?.response?.data?.message || 'Failed to create school.')
    } finally { setCreating(false) }
  }

  const totalSchools = (data?.parentSchools.reduce((s, p) => s + p.sections.length, 0) ?? 0) + (data?.standaloneSchools.length ?? 0)
  const allSchools = [
    ...(data?.standaloneSchools ?? []),
    ...(data?.parentSchools.flatMap(p => p.sections) ?? []),
  ]
  const totalStudents = allSchools.reduce((s, sc) => s + sc._count.students, 0)
  const totalReportCards = allSchools.reduce((s, sc) => s + sc._count.reportCards, 0)

  return (
    <View style={{ flex: 1, backgroundColor: colors.bgSecondary }}>
      {loading ? (
        <View style={s.center}><ActivityIndicator size="large" color="#dc2626" /></View>
      ) : <ScrollView
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        contentContainerStyle={{ paddingBottom: 100 }}
      >
        {/* Summary grid */}
        <View style={s.summaryGrid}>
          {[
            { label: 'Multi-Section Schools', value: data?.parentSchools.length ?? 0, icon: 'layers-outline', color: '#F03E2F' },
            { label: 'Standalone Schools', value: data?.standaloneSchools.length ?? 0, icon: 'school-outline', color: '#16a34a' },
            { label: 'Total Students', value: totalStudents, icon: 'people-outline', color: '#7c3aed' },
            { label: 'Total Report Cards', value: totalReportCards, icon: 'document-text-outline', color: '#ea580c' },
          ].map(item => (
            <View key={item.label} style={s.summaryCard}>
              <View style={[s.summaryIconWrap, { backgroundColor: item.color + '18' }]}>
                <Ionicons name={item.icon as any} size={18} color={item.color} />
              </View>
              <Text style={s.summaryVal}>{item.value}</Text>
              <Text style={s.summaryLabel}>{item.label}</Text>
            </View>
          ))}
        </View>

        <View style={{ padding: 14 }}>
          {/* Parent school groups */}
          {(data?.parentSchools ?? []).map(parent => (
            <View key={parent.id} style={s.group}>
              <TouchableOpacity
                style={s.groupHeader}
                onPress={() => setExpanded(e => ({ ...e, [parent.id]: !e[parent.id] }))}
                activeOpacity={0.7}
              >
                <View style={s.groupLeft}>
                  <Ionicons name="business-outline" size={16} color="#dc2626" />
                  <View>
                    <Text style={s.groupName}>{parent.name}</Text>
                    {parent.city && <Text style={s.groupSub}>{parent.city}{parent.country ? `, ${parent.country}` : ''}</Text>}
                  </View>
                </View>
                <View style={s.groupRight}>
                  <Switch
                    value={parent.isActive}
                    onValueChange={() => handleToggleParent(parent.id)}
                    trackColor={{ false: '#e5e7eb', true: '#fecaca' }}
                    thumbColor={parent.isActive ? '#dc2626' : '#9ca3af'}
                  />
                  <Ionicons
                    name={expanded[parent.id] ? 'chevron-up' : 'chevron-down'}
                    size={16} color="#9ca3af"
                  />
                </View>
              </TouchableOpacity>

              {expanded[parent.id] && (
                <View style={s.sections}>
                  {parent.sections.map(sc => (
                    <SchoolCard key={sc.id} school={sc} onToggle={() => handleToggleSchool(sc.id)} onPress={() => router.push(`/superadmin/school/${sc.id}` as any)} />
                  ))}
                  {parent.sections.length === 0 && (
                    <Text style={s.emptyText}>No sections yet.</Text>
                  )}
                </View>
              )}
            </View>
          ))}

          {/* Standalone schools */}
          {(data?.standaloneSchools ?? []).length > 0 && (
            <View style={s.group}>
              <View style={[s.groupHeader, { backgroundColor: colors.bgSecondary }]}>
                <View style={s.groupLeft}>
                  <Ionicons name="school-outline" size={16} color="#374151" />
                  <Text style={s.groupName}>Standalone Schools</Text>
                </View>
              </View>
              <View style={s.sections}>
                {data!.standaloneSchools.map(sc => (
                  <SchoolCard key={sc.id} school={sc} onToggle={() => handleToggleSchool(sc.id)} onPress={() => router.push(`/superadmin/school/${sc.id}` as any)} />
                ))}
              </View>
            </View>
          )}

          {totalSchools === 0 && (
            <View style={s.center}>
              <Ionicons name="business-outline" size={48} color="#d1d5db" />
              <Text style={s.emptyText}>No schools yet. Create the first one.</Text>
            </View>
          )}
        </View>
      </ScrollView>}

      {/* FAB — create school */}
      <TouchableOpacity style={s.fab} onPress={() => setShowCreate(true)} activeOpacity={0.85}>
        <Ionicons name="add" size={26} color="#fff" />
      </TouchableOpacity>

      {/* Create school modal */}
      <Modal visible={showCreate} animationType="slide" transparent onRequestClose={() => setShowCreate(false)}>
        <KeyboardAvoidingView style={s.modalOverlay} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
          <View style={s.modalSheet}>
            <View style={s.modalHandle} />
            <View style={s.modalHeader}>
              <Text style={s.modalTitle}>Create School</Text>
              <TouchableOpacity onPress={() => setShowCreate(false)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                <Ionicons name="close" size={22} color="#6b7280" />
              </TouchableOpacity>
            </View>

            <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
              {[
                { label: 'School Name *', key: 'schoolName', placeholder: 'St. Mary College' },
                { label: 'School Email *', key: 'schoolEmail', placeholder: 'info@school.com', type: 'email-address' },
                { label: 'Subdomain *', key: 'subdomain', placeholder: 'st-mary' },
                { label: 'Phone', key: 'phone', placeholder: '+237 6XX XXX XXX', type: 'phone-pad' },
                { label: 'Admin Name *', key: 'adminName', placeholder: 'John Doe' },
                { label: 'Admin Email *', key: 'adminEmail', placeholder: 'admin@school.com', type: 'email-address' },
              ].map(field => (
                <View key={field.key} style={s.formField}>
                  <Text style={s.formLabel}>{field.label}</Text>
                  <TextInput
                    style={s.formInput}
                    value={(form as any)[field.key]}
                    onChangeText={v => setForm(f => ({ ...f, [field.key]: v }))}
                    placeholder={field.placeholder}
                    placeholderTextColor="#9ca3af"
                    keyboardType={(field.type as any) ?? 'default'}
                    autoCapitalize="none"
                  />
                </View>
              ))}

              <View style={s.formField}>
                <Text style={s.formLabel}>Admin Password *</Text>
                <View style={{ position: 'relative' }}>
                  <TextInput
                    style={s.formInput}
                    value={form.adminPassword}
                    onChangeText={v => setForm(f => ({ ...f, adminPassword: v }))}
                    placeholder="••••••••"
                    placeholderTextColor="#9ca3af"
                    secureTextEntry={!showPw}
                  />
                  <TouchableOpacity
                    onPress={() => setShowPw(p => !p)}
                    style={{ position: 'absolute', right: 12, top: 12 }}
                  >
                    <Ionicons name={showPw ? 'eye-off-outline' : 'eye-outline'} size={18} color="#9ca3af" />
                  </TouchableOpacity>
                </View>
              </View>

              <View style={s.formField}>
                <Text style={s.formLabel}>School Type *</Text>
                <View style={s.typeRow}>
                  {SCHOOL_TYPES.map(t => (
                    <TouchableOpacity
                      key={t}
                      style={[s.typeBtn, form.schoolType === t && s.typeBtnActive]}
                      onPress={() => setForm(f => ({ ...f, schoolType: t }))}
                      activeOpacity={0.7}
                    >
                      <Text style={[s.typeBtnText, form.schoolType === t && s.typeBtnTextActive]}>{t}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>

              <View style={s.formField}>
                <Text style={s.formLabel}>Language * (AI remarks)</Text>
                <View style={s.typeRow}>
                  {[{ k: 'EN', label: 'English' }, { k: 'FR', label: 'French' }].map(l => (
                    <TouchableOpacity
                      key={l.k}
                      style={[s.typeBtn, form.language === l.k && s.typeBtnActive]}
                      onPress={() => setForm(f => ({ ...f, language: l.k }))}
                      activeOpacity={0.7}
                    >
                      <Text style={[s.typeBtnText, form.language === l.k && s.typeBtnTextActive]}>{l.label}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>

              <TouchableOpacity
                style={[s.createBtn, creating && s.disabled]}
                onPress={handleCreate}
                disabled={creating}
                activeOpacity={0.85}
              >
                {creating
                  ? <ActivityIndicator color="#fff" />
                  : <Text style={s.createBtnText}>Create School</Text>}
              </TouchableOpacity>
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  )
}
