import { useEffect, useState } from 'react'
import { View, Text, TouchableOpacity } from 'react-native'
import { useRouter } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import { getTerms } from '@/lib/api/terms'
import { getClasses } from '@/lib/api/classes'
import { useTheme, Colors } from '@/lib/useTheme'
import { useT } from '@/lib/i18n'

// The two real prerequisites the rest of the app already hard-blocks on
// separately (no current term → can't add students; no class → nothing to
// assign a student to) — surfaced here in one place, in the right order,
// instead of a new admin discovering each one only by hitting a blocked
// action on whatever screen they try next. Disappears once both are done;
// nothing to dismiss or persist. Mirrors apps/web/components/SetupChecklist.tsx.
export default function SetupChecklist() {
  const { colors } = useTheme()
  const t = useT()
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [hasCurrentTerm, setHasCurrentTerm] = useState(false)
  const [hasClasses, setHasClasses] = useState(false)

  useEffect(() => {
    let cancelled = false
    Promise.all([getTerms(), getClasses()])
      .then(([termData, classData]) => {
        if (cancelled) return
        setHasCurrentTerm(termData.terms.some((tm) => tm.isCurrent))
        setHasClasses(classData.classLevels.length > 0)
      })
      .catch(() => { /* non-fatal — checklist just doesn't render */ })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [])

  if (loading || (hasCurrentTerm && hasClasses)) return null

  const items: { done: boolean; label: string; path: string }[] = [
    { done: hasCurrentTerm, label: t('Set the current academic year/term'), path: '/admin/academic-year' },
    { done: hasClasses, label: t('Create at least one class'), path: '/admin/classes' },
  ]

  return (
    <View style={{
      backgroundColor: colors.card, borderRadius: 14, padding: 14, marginBottom: 16,
      borderWidth: 1, borderColor: colors.border,
    }}>
      <Text style={{ fontSize: 13, fontWeight: '700', color: colors.text, marginBottom: 8 }}>
        {t('Finish setting up your school')}
      </Text>
      {items.map((item) => (
        <TouchableOpacity
          key={item.path}
          onPress={() => router.push(item.path as any)}
          activeOpacity={0.7}
          style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 8 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 }}>
            <Ionicons
              name={item.done ? 'checkmark-circle' : 'ellipse-outline'}
              size={17}
              color={item.done ? '#22c55e' : colors.textMuted}
            />
            <Text style={{
              fontSize: 13, flex: 1, color: item.done ? colors.textMuted : colors.text,
              fontWeight: item.done ? '400' : '600',
              textDecorationLine: item.done ? 'line-through' : 'none',
            }}>
              {item.label}
            </Text>
          </View>
          {!item.done && <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />}
        </TouchableOpacity>
      ))}
    </View>
  )
}
