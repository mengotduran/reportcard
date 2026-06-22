// app/admin/grading/index.tsx
import { useEffect, useState, useCallback } from 'react'
import { useFocusEffect } from 'expo-router'
import {
  View, Text, ScrollView, TextInput, TouchableOpacity, StyleSheet,
  ActivityIndicator, RefreshControl, Alert,
} from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { getGradingScale, saveGradingScale, GradeRange, DEFAULT_RANGES } from '@/lib/api/gradingScale'
import { useTheme, Colors } from '@/lib/useTheme'
import { useT } from '@/lib/i18n'

const makeStylesStyles = (colors: Colors) => StyleSheet.create(({
  container: { flex: 1, backgroundColor: colors.bgSecondary },
  content: { padding: 16, paddingBottom: 40 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  infoBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    backgroundColor: '#FEF2F1',
    borderRadius: 12,
    padding: 12,
    marginBottom: 16,
  },
  infoText: { flex: 1, fontSize: 13, color: '#1d4ed8', lineHeight: 18 },
  tableHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: colors.bgSecondary,
    borderRadius: 10,
    marginBottom: 4,
    gap: 8,
  },
  colHead: { fontSize: 10, fontWeight: '700', color: colors.textMuted, letterSpacing: 0.5 },
  rangeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.card,
    borderRadius: 12,
    padding: 10,
    marginBottom: 6,
    borderWidth: 1,
    borderColor: colors.border,
    gap: 10,
  },
  rowEven: { backgroundColor: colors.bgSecondary },
  colorDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    flexShrink: 0,
  },
  rangeInputs: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  rangeScores: {
    flex: 1.2,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  dash: { fontSize: 13, color: colors.textSecondary },
  scoreInput: {
    flex: 1,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    paddingVertical: 7,
    paddingHorizontal: 6,
    fontSize: 13,
    color: colors.text,
    backgroundColor: colors.inputBg,
    textAlign: 'center',
  },
  gradeInput: {
    width: 46,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    paddingVertical: 7,
    paddingHorizontal: 6,
    fontSize: 13,
    color: colors.text,
    backgroundColor: colors.inputBg,
    textAlign: 'center',
    fontWeight: '700',
  },
  remarkInput: {
    flex: 1.5,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    paddingVertical: 7,
    paddingHorizontal: 8,
    fontSize: 12,
    color: colors.text,
    backgroundColor: colors.inputBg,
  },
  colorInput: {
    width: 80,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    paddingVertical: 7,
    paddingHorizontal: 6,
    fontSize: 11,
    color: colors.text,
    backgroundColor: colors.inputBg,
    textAlign: 'center',
  },
  saveBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#F03E2F',
    borderRadius: 14,
    paddingVertical: 16,
    marginTop: 12,
    shadowColor: '#F03E2F',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 5,
  },
  saveBtnText: { color: '#fff', fontWeight: '700', fontSize: 15 },
  disabled: { opacity: 0.5 },
}))

export default function GradingScaleScreen() {
  const { colors, isDark } = useTheme()
  const styles = makeStylesStyles(colors)
  const t = useT()
  const [ranges, setRanges] = useState<GradeRange[]>(DEFAULT_RANGES)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [saving, setSaving] = useState(false)

  const fetchScale = useCallback(async () => {
    try {
      const data = await getGradingScale()
      if (data.ranges?.length > 0) setRanges(data.ranges)
    } catch {
      setRanges(DEFAULT_RANGES)
    }
  }, [])

  useFocusEffect(useCallback(() => {
    fetchScale().finally(() => setLoading(false))
  }, [fetchScale]))

  const onRefresh = async () => {
    setRefreshing(true)
    await fetchScale()
    setRefreshing(false)
  }

  const updateRange = (id: string, field: keyof GradeRange, value: string) => {
    setRanges((prev) =>
      prev.map((r) => {
        if (r.id !== id) return r
        if (field === 'minScore' || field === 'maxScore') {
          return { ...r, [field]: Number(value) || 0 }
        }
        return { ...r, [field]: value }
      })
    )
  }

  const handleSave = async () => {
    setSaving(true)
    try {
      await saveGradingScale(ranges)
      Alert.alert(t('Saved'), t('Grading scale saved successfully.'))
    } catch {
      Alert.alert(t('Error'), t('Failed to save grading scale.'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
    >
      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color="#F03E2F" />
        </View>
      ) : (<>
      <View style={styles.infoBox}>
        <Ionicons name="information-circle-outline" size={16} color="#F03E2F" />
        <Text style={styles.infoText}>{t('Edit score ranges, grade letters, and remarks below. Scores are treated as percentages.')}</Text>
      </View>

      <View style={styles.tableHeader}>
        <Text style={[styles.colHead, { flex: 1.2 }]}>{t('RANGE (%)')}</Text>
        <Text style={[styles.colHead, { width: 52 }]}>{t('GRADE')}</Text>
        <Text style={[styles.colHead, { flex: 1.5 }]}>{t('REMARK')}</Text>
        <Text style={[styles.colHead, { width: 52 }]}>{t('COLOR')}</Text>
      </View>

      {ranges.map((range, index) => (
        <View key={range.id} style={[styles.rangeRow, index % 2 === 0 && styles.rowEven]}>
          <View style={[styles.colorDot, { backgroundColor: range.color }]} />
          <View style={styles.rangeInputs}>
            <View style={styles.rangeScores}>
              <TextInput
                style={styles.scoreInput}
                value={String(range.minScore)}
                onChangeText={(v) => updateRange(range.id, 'minScore', v)}
                keyboardType="numeric"
                maxLength={3}
              />
              <Text style={styles.dash}>–</Text>
              <TextInput
                style={styles.scoreInput}
                value={String(range.maxScore)}
                onChangeText={(v) => updateRange(range.id, 'maxScore', v)}
                keyboardType="numeric"
                maxLength={3}
              />
            </View>
            <TextInput
              style={[styles.gradeInput]}
              value={range.grade}
              onChangeText={(v) => updateRange(range.id, 'grade', v)}
              maxLength={3}
              autoCapitalize="characters"
            />
            <TextInput
              style={[styles.remarkInput]}
              value={range.remark}
              onChangeText={(v) => updateRange(range.id, 'remark', v)}
            />
            <TextInput
              style={[styles.colorInput]}
              value={range.color}
              onChangeText={(v) => updateRange(range.id, 'color', v)}
              autoCapitalize="none"
              maxLength={9}
            />
          </View>
        </View>
      ))}

      <TouchableOpacity
        style={[styles.saveBtn, saving && styles.disabled]}
        onPress={handleSave}
        disabled={saving}
        activeOpacity={0.85}
      >
        {saving
          ? <ActivityIndicator color="#fff" size="small" />
          : (
            <>
              <Ionicons name="save-outline" size={18} color="#fff" />
              <Text style={styles.saveBtnText}>{t('Save Grading Scale')}</Text>
            </>
          )}
      </TouchableOpacity>
      </>)}
    </ScrollView>
  )
}
