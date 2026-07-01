import { useEffect, useState } from 'react'
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native'
import { useRouter } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import { useAuthStore } from '@/lib/store/auth.store'
import { getAcademicYears, AcademicYear } from '@/lib/api/dashboard'
import { useTheme, Colors } from '@/lib/useTheme'
import { useT } from '@/lib/i18n'

const makeStyles = (colors: Colors) => StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bgSecondary },
  content: { padding: 16, paddingBottom: 40 },
  intro: { fontSize: 13, color: colors.textSecondary, marginBottom: 16 },
  card: {
    backgroundColor: colors.card, borderRadius: 16, padding: 16, marginBottom: 12,
    borderWidth: 1, borderColor: colors.border,
  },
  cardActive: { borderColor: '#F03E2F', borderWidth: 1.5 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  iconBox: { width: 44, height: 44, borderRadius: 12, backgroundColor: '#FEF2F1', justifyContent: 'center', alignItems: 'center' },
  iconBoxActive: { backgroundColor: '#F03E2F' },
  year: { fontSize: 17, fontWeight: '700', color: colors.text },
  badges: { flexDirection: 'row', gap: 6, marginTop: 4 },
  badge: { fontSize: 10, fontWeight: '700', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 10, overflow: 'hidden' },
  activate: { marginTop: 12, backgroundColor: '#F03E2F', borderRadius: 10, paddingVertical: 10, alignItems: 'center' },
  activateText: { color: '#fff', fontWeight: '700', fontSize: 14 },
  viewing: { marginTop: 12, fontSize: 13, color: colors.textSecondary, fontWeight: '600' },
})

export default function AcademicYearScreen() {
  const { colors } = useTheme()
  const styles = makeStyles(colors)
  const t = useT()
  const router = useRouter()
  const { activeSession, setActiveSession } = useAuthStore()
  const [years, setYears] = useState<AcademicYear[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    getAcademicYears().then((d) => setYears(d.academicYears)).catch(() => {}).finally(() => setLoading(false))
  }, [])

  const activate = (session: string) => {
    setActiveSession(session)
    router.replace('/(tabs)')
  }

  if (loading) {
    return <View style={[styles.container, { justifyContent: 'center' }]}><ActivityIndicator color="#F03E2F" /></View>
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.intro}>{t('Activate a year to view its data across the whole app.')}</Text>
      {years.map((y) => {
        const isActive = activeSession === y.session
        return (
          <View key={y.session} style={[styles.card, isActive && styles.cardActive]}>
            <View style={styles.row}>
              <View style={[styles.iconBox, isActive && styles.iconBoxActive]}>
                <Ionicons name="calendar-number-outline" size={22} color={isActive ? '#fff' : '#F03E2F'} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.year}>{y.session}</Text>
                <View style={styles.badges}>
                  {y.current && <Text style={[styles.badge, { backgroundColor: '#FEF3C7', color: '#92400E' }]}>{t('Live term')}</Text>}
                  {isActive && <Text style={[styles.badge, { backgroundColor: '#D1FAE5', color: '#065F46' }]}>{t('Active')}</Text>}
                </View>
              </View>
            </View>
            {isActive ? (
              <Text style={styles.viewing}>{t('Currently viewing')}</Text>
            ) : (
              <TouchableOpacity style={styles.activate} onPress={() => activate(y.session)} activeOpacity={0.8}>
                <Text style={styles.activateText}>{t('Activate this year')}</Text>
              </TouchableOpacity>
            )}
          </View>
        )
      })}
    </ScrollView>
  )
}
