import { useEffect, useState, useCallback } from 'react'
import { useFocusEffect } from 'expo-router'
import {
  View, Text, FlatList, TouchableOpacity,
  StyleSheet, ActivityIndicator,
} from 'react-native'
import { useLocalSearchParams, useRouter, useNavigation } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import { getSubjects, Subject } from '@/lib/api/reportcards'
import { useAuthStore } from '@/lib/store/auth.store'
import { useTheme, Colors } from '@/lib/useTheme'
import { seqFull } from '@/lib/sequences'
import { useT, useLang } from '@/lib/i18n'

const makeStylesStyles = (colors: Colors) => StyleSheet.create(({
  container: { flex: 1, backgroundColor: colors.bgSecondary },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24, gap: 12 },
  remarksBar: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: '#faf5ff', paddingHorizontal: 16, paddingVertical: 14,
    borderBottomWidth: 1, borderBottomColor: '#ede9fe',
  },
  remarksBarText: { flex: 1, fontSize: 13, fontWeight: '600', color: '#7c3aed' },
  seqContainer: {
    backgroundColor: colors.card,
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  seqLabel: { fontSize: 12, color: colors.textSecondary, marginBottom: 10, fontWeight: '600', textTransform: 'uppercase' },
  seqRow: { flexDirection: 'row', gap: 10 },
  seqBtn: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: colors.border,
    alignItems: 'center',
    backgroundColor: colors.bgSecondary,
  },
  seqBtnActive: { borderColor: '#F03E2F', backgroundColor: '#FEF2F1' },
  seqBtnText: { fontSize: 13, fontWeight: '600', color: colors.textSecondary },
  seqBtnTextActive: { color: '#F03E2F' },
  list: { padding: 16, paddingBottom: 32 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.card,
    borderRadius: 12,
    padding: 16,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#f3f4f6',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 3,
    elevation: 1,
  },
  subjectIcon: {
    width: 40,
    height: 40,
    borderRadius: 10,
    backgroundColor: '#ede9fe',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 14,
  },
  subjectIconText: { color: '#7c3aed', fontWeight: 'bold', fontSize: 16 },
  subjectName: { flex: 1, fontSize: 15, fontWeight: '600', color: colors.text },
  emptyText: { fontSize: 14, color: colors.textMuted, textAlign: 'center' },
}))

export default function ClassScreen() {
  const { colors, isDark } = useTheme()
  const styles = makeStylesStyles(colors)
  const t = useT()
  const lang = useLang()
  const { classLevel, termId, termName } = useLocalSearchParams<{ classLevel: string; termId: string; termName: string }>()
  const router = useRouter()
  const navigation = useNavigation()
  const { user } = useAuthStore()
  const [subjects, setSubjects] = useState<Subject[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedSeq, setSelectedSeq] = useState(0)

  const decodedClass = decodeURIComponent(classLevel)
  const isClassMaster = user?.role === 'CLASS_MASTER'
  const isMasterOfThisClass = isClassMaster && user?.masterClassLevel === decodedClass

  useEffect(() => {
    navigation.setOptions({ title: decodedClass })
  }, [decodedClass])

  useFocusEffect(useCallback(() => {
    getSubjects()
      .then((data) => {
        const filtered = data.subjects.filter((s) => s.classLevel === decodedClass)
        setSubjects(filtered)
      })
      .finally(() => setLoading(false))
  }, [decodedClass]))

  return (
    <View style={styles.container}>
      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color="#F03E2F" />
        </View>
      ) : (
      <>
      {/* General Remarks button — only for class master of this class */}
      {isMasterOfThisClass && (
        <TouchableOpacity
          style={styles.remarksBar}
          onPress={() => router.push(`/class-master/${encodeURIComponent(decodedClass)}?termId=${termId}` as any)}
          activeOpacity={0.8}
        >
          <Ionicons name="chatbubble-ellipses-outline" size={16} color="#7c3aed" />
          <Text style={styles.remarksBarText}>{t('Add / Edit General Remarks for')} {decodedClass}</Text>
          <Ionicons name="chevron-forward" size={15} color="#7c3aed" />
        </TouchableOpacity>
      )}

      {/* Sequence selector */}
      <View style={styles.seqContainer}>
        <Text style={styles.seqLabel}>{t('Select Sequence')}</Text>
        <View style={styles.seqRow}>
          {[0, 1].map((i) => (
            <TouchableOpacity
              key={i}
              style={[styles.seqBtn, selectedSeq === i && styles.seqBtnActive]}
              onPress={() => setSelectedSeq(i)}
              activeOpacity={0.7}
            >
              <Text style={[styles.seqBtnText, selectedSeq === i && styles.seqBtnTextActive]}>
                {seqFull(termName, i, lang)}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {/* Subject list */}
      <FlatList
        data={subjects}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        ListEmptyComponent={
          <View style={styles.center}>
            <Ionicons name="book-outline" size={40} color="#d1d5db" />
            <Text style={styles.emptyText}>{t('No subjects found for')} {decodedClass}</Text>
          </View>
        }
        renderItem={({ item }) => (
          <TouchableOpacity
            style={styles.row}
            onPress={() =>
              router.push(
                `/marks/${encodeURIComponent(item.id)}?classLevel=${encodeURIComponent(decodedClass)}&termId=${termId}&termName=${encodeURIComponent(termName ?? '')}&subjectName=${encodeURIComponent(item.name)}&sequence=${selectedSeq}`
              )
            }
            activeOpacity={0.7}
          >
            <View style={styles.subjectIcon}>
              <Text style={styles.subjectIconText}>{item.name.charAt(0)}</Text>
            </View>
            <Text style={styles.subjectName}>{item.name}</Text>
            <Ionicons name="chevron-forward" size={18} color="#9ca3af" />
          </TouchableOpacity>
        )}
      />
      </>
      )}
    </View>
  )
}
