import { useEffect, useState } from 'react'
import {
  View, Text, ScrollView, StyleSheet, ActivityIndicator,
  TouchableOpacity,
} from 'react-native'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import { useTheme, Colors } from '@/lib/useTheme'
import { getSchoolDetailApi, SchoolDetail } from '@/lib/api/superadmin'

const TYPE_COLOR: Record<string, { bg: string; text: string }> = {
  PRIMARY:    { bg: '#FEF2F1', text: '#F03E2F' },
  SECONDARY:  { bg: '#f5f3ff', text: '#7c3aed' },
  UNIVERSITY: { bg: '#fff7ed', text: '#ea580c' },
}

const ROLE_LABELS: Record<string, string> = {
  SCHOOL_ADMIN: 'School Admin',
  VICE_PRINCIPAL: 'Vice Principal',
  CLASS_MASTER: 'Class Master',
  CLASS_TEACHER: 'Class Teacher',
  SUBJECT_TEACHER: 'Subject Teacher',
}

const makeStyles = (colors: Colors) => StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bgSecondary },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24, gap: 12 },
  header: {
    backgroundColor: colors.card, paddingTop: 56, paddingBottom: 20,
    paddingHorizontal: 20, borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  backBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 14 },
  backText: { fontSize: 14, color: '#F03E2F', fontWeight: '600' },
  headerTop: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  avatar: {
    width: 52, height: 52, borderRadius: 14, backgroundColor: '#FEE2E0',
    justifyContent: 'center', alignItems: 'center', flexShrink: 0,
  },
  avatarText: { fontSize: 22, fontWeight: '800', color: '#F03E2F' },
  headerInfo: { flex: 1 },
  typeBadge: { alignSelf: 'flex-start', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6, marginBottom: 4 },
  typeText: { fontSize: 10, fontWeight: '700' },
  schoolName: { fontSize: 18, fontWeight: '800', color: colors.text, marginBottom: 2 },
  schoolMeta: { fontSize: 12, color: colors.textMuted },
  statusBadge: { marginTop: 6, alignSelf: 'flex-start', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 20 },
  statusText: { fontSize: 11, fontWeight: '600' },
  body: { padding: 16, gap: 16 },
  statsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  statCard: {
    width: '47.5%', backgroundColor: colors.card, borderRadius: 14, padding: 14,
    borderWidth: 1, borderColor: colors.border, alignItems: 'center',
  },
  statIconWrap: { width: 40, height: 40, borderRadius: 12, justifyContent: 'center', alignItems: 'center', marginBottom: 8 },
  statVal: { fontSize: 24, fontWeight: '800', color: colors.text },
  statLabel: { fontSize: 11, color: colors.textMuted, textAlign: 'center', marginTop: 2 },
  section: { backgroundColor: colors.card, borderRadius: 14, borderWidth: 1, borderColor: colors.border, overflow: 'hidden' },
  sectionHeader: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingHorizontal: 14, paddingVertical: 12,
    borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  sectionAccent: { width: 3, height: 16, borderRadius: 2, backgroundColor: '#F03E2F' },
  sectionTitle: { fontSize: 13, fontWeight: '700', color: colors.text },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 14, paddingVertical: 12 },
  rowBorder: { borderTopWidth: 1, borderTopColor: colors.border },
  rowLeft: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  classIcon: { width: 28, height: 28, borderRadius: 8, backgroundColor: '#f0fdf4', justifyContent: 'center', alignItems: 'center' },
  rowLabel: { fontSize: 13, color: colors.text, fontWeight: '500' },
  rowValue: { fontSize: 14, fontWeight: '700', color: colors.text },
  infoRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 14, paddingVertical: 10 },
  infoLabel: { fontSize: 12, color: colors.textMuted, flex: 1 },
  infoValue: { fontSize: 12, color: colors.text, fontWeight: '600', flex: 2, textAlign: 'right' },
  parentBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: '#ede9fe', paddingHorizontal: 10, paddingVertical: 6,
    borderRadius: 8, margin: 14,
  },
  parentText: { fontSize: 12, color: '#7c3aed', fontWeight: '600' },
  emptyText: { fontSize: 13, color: colors.textMuted, textAlign: 'center', padding: 14 },
})

export default function SchoolDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const router = useRouter()
  const { colors } = useTheme()
  const s = makeStyles(colors)
  const [detail, setDetail] = useState<SchoolDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!id) return
    getSchoolDetailApi(id)
      .then(setDetail)
      .catch(() => setError('Failed to load school details.'))
      .finally(() => setLoading(false))
  }, [id])

  if (loading) return (
    <View style={s.container}>
      <View style={s.center}><ActivityIndicator size="large" color="#F03E2F" /></View>
    </View>
  )

  if (error || !detail) return (
    <View style={s.container}>
      <View style={s.center}>
        <Ionicons name="alert-circle-outline" size={40} color="#f59e0b" />
        <Text style={{ color: colors.textMuted }}>{error || 'School not found.'}</Text>
      </View>
    </View>
  )

  const { school, classes, staff, subjects, reportCards } = detail
  const tc = TYPE_COLOR[school.type] ?? { bg: '#f3f4f6', text: '#374151' }
  const published = reportCards.find(r => r.status === 'PUBLISHED')?.count ?? 0
  const draft = reportCards.find(r => r.status === 'DRAFT')?.count ?? 0
  const teachers = staff.filter(st => ['CLASS_MASTER', 'CLASS_TEACHER', 'SUBJECT_TEACHER'].includes(st.role)).reduce((a, b) => a + b.count, 0)

  const stats = [
    { label: 'Students', value: school.totalStudents, icon: 'people-outline', color: '#7c3aed', bg: '#ede9fe' },
    { label: 'Teachers', value: teachers, icon: 'person-outline', color: '#16a34a', bg: '#f0fdf4' },
    // The school being viewed decides the word, not the superadmin's own school.
    { label: school.type === 'UNIVERSITY' ? 'Courses' : 'Subjects', value: subjects, icon: 'book-outline', color: '#ea580c', bg: '#fff7ed' },
    { label: 'Report Cards', value: school.totalReportCards, icon: 'document-text-outline', color: '#F03E2F', bg: '#FEF2F1' },
  ]

  return (
    <View style={s.container}>
      {/* Header */}
      <View style={s.header}>
        <TouchableOpacity style={s.backBtn} onPress={() => router.back()}>
          <Ionicons name="chevron-back" size={18} color="#F03E2F" />
          <Text style={s.backText}>Schools</Text>
        </TouchableOpacity>
        <View style={s.headerTop}>
          <View style={s.avatar}>
            <Text style={s.avatarText}>{school.name.charAt(0)}</Text>
          </View>
          <View style={s.headerInfo}>
            <View style={[s.typeBadge, { backgroundColor: tc.bg }]}>
              <Text style={[s.typeText, { color: tc.text }]}>{school.type}</Text>
            </View>
            <Text style={s.schoolName}>{school.name}</Text>
            <Text style={s.schoolMeta}>{school.subdomain}</Text>
            <View style={[s.statusBadge, { backgroundColor: school.isActive ? '#dcfce7' : '#fee2e2' }]}>
              <Text style={[s.statusText, { color: school.isActive ? '#16a34a' : '#dc2626' }]}>
                {school.isActive ? 'Active' : 'Inactive'}
              </Text>
            </View>
          </View>
        </View>
      </View>

      <ScrollView contentContainerStyle={s.body} showsVerticalScrollIndicator={false}>
        {/* Part of a multi-section institution? */}
        {school.parentSchool && (
          <View style={s.parentBadge}>
            <Ionicons name="layers-outline" size={14} color="#7c3aed" />
            <Text style={s.parentText}>Part of {school.parentSchool.name}</Text>
          </View>
        )}

        {/* Stats grid */}
        <View style={s.statsGrid}>
          {stats.map(st => (
            <View key={st.label} style={s.statCard}>
              <View style={[s.statIconWrap, { backgroundColor: st.bg }]}>
                <Ionicons name={st.icon as any} size={18} color={st.color} />
              </View>
              <Text style={s.statVal}>{st.value}</Text>
              <Text style={s.statLabel}>{st.label}</Text>
            </View>
          ))}
        </View>

        {/* Classes */}
        <View style={s.section}>
          <View style={s.sectionHeader}>
            <View style={s.sectionAccent} />
            <Text style={s.sectionTitle}>Classes ({classes.length})</Text>
          </View>
          {classes.length === 0 ? (
            <Text style={s.emptyText}>No classes yet.</Text>
          ) : classes.map((cls, i) => (
            <View key={cls.classLevel} style={[s.row, i > 0 && s.rowBorder]}>
              <View style={s.rowLeft}>
                <View style={s.classIcon}>
                  <Text style={{ fontSize: 11, fontWeight: '700', color: '#16a34a' }}>{cls.classLevel.charAt(0)}</Text>
                </View>
                <Text style={s.rowLabel}>{cls.classLevel}</Text>
              </View>
              <Text style={s.rowValue}>{cls.students} student{cls.students !== 1 ? 's' : ''}</Text>
            </View>
          ))}
        </View>

        {/* Staff breakdown */}
        <View style={s.section}>
          <View style={s.sectionHeader}>
            <View style={s.sectionAccent} />
            <Text style={s.sectionTitle}>Staff ({school.totalUsers})</Text>
          </View>
          {staff.length === 0 ? (
            <Text style={s.emptyText}>No staff yet.</Text>
          ) : staff.map((st, i) => (
            <View key={st.role} style={[s.row, i > 0 && s.rowBorder]}>
              <Text style={s.rowLabel}>{ROLE_LABELS[st.role] ?? st.role}</Text>
              <Text style={s.rowValue}>{st.count}</Text>
            </View>
          ))}
        </View>

        {/* Report cards */}
        <View style={s.section}>
          <View style={s.sectionHeader}>
            <View style={s.sectionAccent} />
            <Text style={s.sectionTitle}>Report Cards ({school.totalReportCards})</Text>
          </View>
          <View style={s.row}>
            <View style={s.rowLeft}>
              <View style={[s.classIcon, { backgroundColor: '#dcfce7' }]}>
                <Ionicons name="checkmark-circle-outline" size={14} color="#16a34a" />
              </View>
              <Text style={s.rowLabel}>Published</Text>
            </View>
            <Text style={[s.rowValue, { color: '#16a34a' }]}>{published}</Text>
          </View>
          <View style={[s.row, s.rowBorder]}>
            <View style={s.rowLeft}>
              <View style={[s.classIcon, { backgroundColor: '#fef9c3' }]}>
                <Ionicons name="time-outline" size={14} color="#92400e" />
              </View>
              <Text style={s.rowLabel}>Draft</Text>
            </View>
            <Text style={[s.rowValue, { color: '#92400e' }]}>{draft}</Text>
          </View>
        </View>

        {/* School info */}
        <View style={s.section}>
          <View style={s.sectionHeader}>
            <View style={s.sectionAccent} />
            <Text style={s.sectionTitle}>School Info</Text>
          </View>
          {[
            { label: 'Email', value: school.email },
            { label: 'Phone', value: school.phone ?? '—' },
            { label: 'Address', value: school.address ?? '—' },
            { label: 'Subdomain', value: school.subdomain },
            { label: 'Registered', value: new Date(school.createdAt).toLocaleDateString() },
          ].map((info, i) => (
            <View key={info.label} style={[s.infoRow, i > 0 && s.rowBorder]}>
              <Text style={s.infoLabel}>{info.label}</Text>
              <Text style={s.infoValue} numberOfLines={1}>{info.value}</Text>
            </View>
          ))}
        </View>
      </ScrollView>
    </View>
  )
}
