'use client'
import { useAuthStore } from '@/lib/store/auth.store'
import PrimaryDashboard from './PrimaryDashboard'
import SecondaryDashboard from './SecondaryDashboard'
import UniversityDashboard from './UniversityDashboard'

// Each school type gets its own fully independent dashboard component (see
// PrimaryDashboard.tsx / SecondaryDashboard.tsx / UniversityDashboard.tsx) —
// they started as identical copies, but are expected to diverge over time as
// each type needs different widgets/CTAs, so this file only ever picks one.
export default function DashboardPage() {
  const { school } = useAuthStore()

  if (school?.type === 'PRIMARY') return <PrimaryDashboard />
  if (school?.type === 'UNIVERSITY') return <UniversityDashboard />
  return <SecondaryDashboard />
}
