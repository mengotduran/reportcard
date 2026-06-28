// app/(tabs)/index.tsx
import { useEffect, useState, useCallback } from 'react'
import { useFocusEffect } from 'expo-router'
import { View, Text, ScrollView, TouchableOpacity, StyleSheet } from 'react-native'
import { useRouter } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import { useAuthStore } from '@/lib/store/auth.store'
import { getOverview, OverviewData } from '@/lib/api/superadmin'
import { getMeApi } from '@/lib/api/auth'
import { useTheme, Colors } from '@/lib/useTheme'
import PrimaryHome from '@/components/dashboard/PrimaryHome'
import SecondaryHome from '@/components/dashboard/SecondaryHome'
import UniversityHome from '@/components/dashboard/UniversityHome'

function getGreeting() {
  const h = new Date().getHours()
  if (h < 12) return 'Good morning'
  if (h < 17) return 'Good afternoon'
  return 'Good evening'
}

// SuperAdminHome isn't school-type-specific — a superadmin oversees schools of
// every type at once, so unlike Teacher/Admin home it stays shared rather than
// split 3 ways (see PrimaryHome/SecondaryHome/UniversityHome for that split).
function SuperAdminHome() {
  const { colors } = useTheme()
  const sa = makeSaStyles(colors)
  const { user } = useAuthStore()
  const router = useRouter()
  const [overview, setOverview] = useState<OverviewData | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    getOverview().then(setOverview).catch(console.error).finally(() => setLoading(false))
  }, [])

  useFocusEffect(useCallback(() => {
    getOverview().then(setOverview).catch(console.error)
  }, []))

  const totalSchools = (overview?.parentSchools.reduce((s, p) => s + p.sections.length, 0) ?? 0) + (overview?.standaloneSchools.length ?? 0)
  const totalStudents = [
    ...(overview?.standaloneSchools ?? []),
    ...(overview?.parentSchools.flatMap(p => p.sections) ?? []),
  ].reduce((s, sc) => s + sc._count.students, 0)
  const totalGroups = overview?.parentSchools.length ?? 0

  return (
    <ScrollView style={sa.container} contentContainerStyle={{ paddingBottom: 40 }}>
      <View style={sa.header}>
        <View>
          <Text style={sa.greeting}>{getGreeting()},</Text>
          <Text style={sa.name}>{user?.name}</Text>
          <View style={sa.badge}><Text style={sa.badgeText}>SUPERADMIN</Text></View>
        </View>
      </View>

      <View style={sa.grid}>
        {[
          { label: 'Schools', value: totalSchools, icon: 'business-outline', color: '#dc2626', bg: '#fef2f2' },
          { label: 'Groups', value: totalGroups, icon: 'layers-outline', color: '#7c3aed', bg: '#f5f3ff' },
          { label: 'Students', value: totalStudents, icon: 'people-outline', color: '#F03E2F', bg: '#FEF2F1' },
          { label: 'Active', value: [
              ...(overview?.standaloneSchools ?? []),
              ...(overview?.parentSchools.flatMap(p => p.sections) ?? []),
            ].filter(s => s.isActive).length, icon: 'checkmark-circle-outline', color: '#16a34a', bg: '#f0fdf4' },
        ].map(card => (
          <View key={card.label} style={[sa.card, { borderTopColor: card.color }]}>
            <View style={[sa.iconBox, { backgroundColor: card.bg }]}>
              <Ionicons name={card.icon as any} size={20} color={card.color} />
            </View>
            {loading
              ? <View style={sa.skeleton} />
              : <Text style={sa.cardVal}>{card.value}</Text>}
            <Text style={sa.cardLabel}>{card.label}</Text>
          </View>
        ))}
      </View>

      <TouchableOpacity style={sa.actionBtn} onPress={() => router.push('/(tabs)/schools' as any)} activeOpacity={0.85}>
        <Ionicons name="business-outline" size={18} color="#fff" />
        <Text style={sa.actionBtnText}>Manage Schools</Text>
        <Ionicons name="arrow-forward-outline" size={16} color="rgba(255,255,255,0.7)" />
      </TouchableOpacity>
    </ScrollView>
  )
}

const makeSaStyles = (colors: Colors) => StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bgSecondary },
  header: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start',
    backgroundColor: '#dc2626', padding: 24, paddingTop: 16,
  },
  greeting: { fontSize: 13, color: 'rgba(255,255,255,0.8)' },
  name: { fontSize: 20, fontWeight: '800', color: '#fff', marginTop: 2 },
  badge: { backgroundColor: 'rgba(255,255,255,0.2)', alignSelf: 'flex-start', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 4, marginTop: 6 },
  badgeText: { fontSize: 10, fontWeight: '700', color: '#fff', letterSpacing: 1 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', padding: 12, gap: 10 },
  card: {
    width: '47%', backgroundColor: colors.card, borderRadius: 12, padding: 14,
    borderWidth: 1, borderColor: colors.border, borderTopWidth: 3,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.04, shadowRadius: 3, elevation: 1,
  },
  iconBox: { width: 36, height: 36, borderRadius: 10, justifyContent: 'center', alignItems: 'center', marginBottom: 10 },
  cardVal: { fontSize: 24, fontWeight: '800', color: colors.text },
  cardLabel: { fontSize: 12, color: colors.textSecondary, marginTop: 2 },
  skeleton: { width: 40, height: 24, backgroundColor: colors.bgSecondary, borderRadius: 6, marginBottom: 4 },
  actionBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: '#dc2626', borderRadius: 14, margin: 16,
    paddingVertical: 16, paddingHorizontal: 20,
    shadowColor: '#dc2626', shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3, shadowRadius: 8, elevation: 6,
  },
  actionBtnText: { flex: 1, color: '#fff', fontWeight: '700', fontSize: 15 },
})

export default function DashboardScreen() {
  const { user, school, setSchool } = useAuthStore()

  // Refresh school data on mount so cover images added after login are visible
  useEffect(() => {
    getMeApi().then((me) => { if (me.school) setSchool(me.school) }).catch(() => {})
  }, [])

  if (user?.role === 'SUPERADMIN') return <SuperAdminHome />
  if (school?.type === 'PRIMARY') return <PrimaryHome />
  if (school?.type === 'UNIVERSITY') return <UniversityHome />
  return <SecondaryHome />
}
