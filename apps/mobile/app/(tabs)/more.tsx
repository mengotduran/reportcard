// app/(tabs)/more.tsx
import { View, Text, ScrollView, TouchableOpacity, StyleSheet } from 'react-native'
import { useRouter } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import { useAuthStore } from '@/lib/store/auth.store'
import { useTheme, Colors } from '@/lib/useTheme'
import { useT } from '@/lib/i18n'
import ThemeToggle from '@/components/ThemeToggle'

const MENU_ITEMS = [
  { label: 'Academic Year', icon: 'calendar-number-outline' as const, route: '/admin/academic-year' },
  { label: 'Teachers', icon: 'people-outline' as const, route: '/admin/teachers' },
  { label: 'Classes', icon: 'school-outline' as const, route: '/admin/classes' },
  { label: 'Subjects', icon: 'book-outline' as const, route: '/admin/subjects' },
  { label: 'Terms', icon: 'calendar-outline' as const, route: '/admin/terms' },
  { label: 'School Fees', icon: 'wallet-outline' as const, route: '/admin/fees' },
  { label: 'Grading Scale', icon: 'stats-chart-outline' as const, route: '/admin/grading' },
  { label: 'Settings', icon: 'settings-outline' as const, route: '/admin/settings' },
  { label: 'Report Card Design', icon: 'laptop-outline' as const, route: '/admin/report-card-design' },
  { label: 'Class List Design', icon: 'list-outline' as const, route: '/admin/class-list-design' },
]

const makeStylesStyles = (colors: Colors) => StyleSheet.create(({
  container: { flex: 1, backgroundColor: colors.bgSecondary },
  content: { padding: 16, paddingBottom: 40 },
  schoolHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.card,
    borderRadius: 16,
    padding: 16,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: colors.border,
    gap: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 3,
    elevation: 1,
  },
  schoolIconWrap: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: '#FEF2F1',
    justifyContent: 'center',
    alignItems: 'center',
  },
  schoolName: { fontSize: 16, fontWeight: '700', color: colors.text },
  schoolType: { fontSize: 11, color: colors.textSecondary, marginTop: 2, fontWeight: '500', letterSpacing: 0.5 },
  themeRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: colors.card, borderRadius: 14, padding: 14,
    marginBottom: 16, borderWidth: 1, borderColor: colors.border,
  },
  themeLabel: { fontSize: 15, fontWeight: '600', color: colors.text },
  sectionLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.textMuted,
    letterSpacing: 1,
    marginBottom: 10,
    marginLeft: 4,
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.card,
    borderRadius: 16,
    padding: 16,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: colors.border,
    gap: 14,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 3,
    elevation: 1,
  },
  iconBox: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: '#FEF2F1',
    justifyContent: 'center',
    alignItems: 'center',
  },
  cardLabel: { flex: 1, fontSize: 15, fontWeight: '600', color: colors.text },
}))

export default function MoreScreen() {
  const { colors, isDark } = useTheme()
  const t = useT()
  const styles = makeStylesStyles(colors)
  const router = useRouter()
  const { school } = useAuthStore()
  // Universities use different wording for the same routes/data — just relabel the menu.
  const UNIVERSITY_MENU_LABELS: Record<string, string> = {
    '/admin/terms': 'Semesters',
    '/admin/subjects': 'Courses',
    '/admin/classes': 'Departments',
  }
  const menuItems = school?.type === 'UNIVERSITY'
    ? MENU_ITEMS.map((item) => UNIVERSITY_MENU_LABELS[item.route] ? { ...item, label: UNIVERSITY_MENU_LABELS[item.route] } : item)
    : MENU_ITEMS

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.schoolHeader}>
        <View style={styles.schoolIconWrap}>
          <Ionicons name="business-outline" size={20} color="#F03E2F" />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.schoolName}>{school?.name ?? t('School')}</Text>
          <Text style={styles.schoolType}>{school?.type ? `${t(school.type)} ${t('SCHOOL')}` : t('Admin Panel')}</Text>
        </View>
      </View>

<Text style={styles.sectionLabel}>{t('MANAGEMENT')}</Text>

      {menuItems.map((item) => (
        <TouchableOpacity
          key={item.route}
          style={styles.card}
          onPress={() => router.push(item.route as any)}
          activeOpacity={0.7}
        >
          <View style={styles.iconBox}>
            <Ionicons name={item.icon} size={22} color="#F03E2F" />
          </View>
          <Text style={styles.cardLabel}>{t(item.label)}</Text>
          <Ionicons name="chevron-forward" size={18} color="#9ca3af" />
        </TouchableOpacity>
      ))}
    </ScrollView>
  )
}
