import { useEffect, useState } from 'react'
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ActivityIndicator, Alert } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { CompetencyLevel, DEFAULT_COMPETENCY_LEVELS, levelLabel } from '@/lib/competency'
import { getCompetencyScaleApi, saveCompetencyScaleApi } from '@/lib/api/competencyScale'
import { useTheme, Colors } from '@/lib/useTheme'
import { useT } from '@/lib/i18n'
import { useAuthStore } from '@/lib/store/auth.store'

/**
 * The rating levels a nursery / pre-primary class is assessed on, on a phone.
 *
 * Mirrors the web editor. Sits under the numeric grading scale rather than on its own
 * screen, because a primary school runs both at once, and is only mounted when the school
 * actually has a COMPETENCY class.
 *
 * Colour is NOT editable here: a phone has no usable colour picker, and getting one wrong is
 * worse than inheriting it. A level added on mobile takes a neutral slate that the admin can
 * change on the web, which is also where the whole scale is easier to lay out.
 */
export default function CompetencyScaleEditor() {
  const { colors } = useTheme()
  const s = makeStyles(colors)
  const t = useT()
  const { school } = useAuthStore()
  const lang: 'EN' | 'FR' = school?.language === 'FR' ? 'FR' : 'EN'

  const [levels, setLevels] = useState<CompetencyLevel[]>(DEFAULT_COMPETENCY_LEVELS)
  const [isDefault, setIsDefault] = useState(true)
  const [frozenBy, setFrozenBy] = useState<{ className: string; termName: string } | null>(null)
  const [limits, setLimits] = useState({ min: 2, max: 6 })
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    getCompetencyScaleApi().then((sc) => {
      setLevels(sc.levels); setIsDefault(sc.isDefault); setFrozenBy(sc.frozenBy); setLimits(sc.limits)
    }).finally(() => setLoading(false))
  }, [])

  const locked = frozenBy !== null

  const patch = (i: number, field: 'labelEn' | 'labelFr' | 'short', value: string) =>
    setLevels((ls) => ls.map((l, idx) => (idx === i ? { ...l, [field]: value } : l)))

  const move = (i: number, dir: -1 | 1) =>
    setLevels((ls) => {
      const j = i + dir
      if (j < 0 || j >= ls.length) return ls
      const next = [...ls]
      ;[next[i], next[j]] = [next[j], next[i]]
      return next
    })

  const addLevel = () =>
    setLevels((ls) => ls.length >= limits.max ? ls
      : [...ls, { id: `lvl_${Date.now()}`, labelEn: '', labelFr: '', short: '', color: '#475569' }])

  const removeLevel = (i: number) =>
    setLevels((ls) => ls.length <= limits.min ? ls : ls.filter((_, idx) => idx !== i))

  const save = async () => {
    if (levels.some((l) => l.labelEn.trim() === '')) {
      Alert.alert(t('Error'), t('Every level needs an English name.')); return
    }
    const seen = new Set<string>()
    for (const l of levels) {
      const key = l.labelEn.trim().toLowerCase()
      if (seen.has(key)) { Alert.alert(t('Error'), `"${l.labelEn}" ${t('is listed twice.')}`); return }
      seen.add(key)
    }
    setSaving(true)
    try {
      const saved = await saveCompetencyScaleApi(levels)
      setLevels(saved.levels); setIsDefault(saved.isDefault)
      Alert.alert(t('Saved'), t('Rating levels saved'))
    } catch (err: any) {
      Alert.alert(t('Error'), err?.response?.data?.message || t('Could not save the rating levels'))
    } finally { setSaving(false) }
  }

  const reset = async () => {
    setSaving(true)
    try {
      const saved = await saveCompetencyScaleApi(DEFAULT_COMPETENCY_LEVELS, true)
      setLevels(saved.levels); setIsDefault(true)
      Alert.alert(t('Saved'), t('Back to the standard rating levels'))
    } catch (err: any) {
      Alert.alert(t('Error'), err?.response?.data?.message || t('Could not reset the rating levels'))
    } finally { setSaving(false) }
  }

  if (loading) return null

  return (
    <View style={s.wrap}>
      <Text style={s.title}>{t('Nursery Rating Levels')}</Text>
      <Text style={s.sub}>
        {t('How nursery and pre-primary classes are assessed. These classes carry a rating per subject instead of a mark, so their report cards show no total, no average and no position.')}
      </Text>
      {isDefault && <Text style={s.hint}>{t('Currently using the standard levels.')}</Text>}

      {locked && (
        <View style={s.frozen}>
          <Ionicons name="lock-closed-outline" size={15} color="#92400e" />
          <Text style={s.frozenText}>
            {t('Report cards for')} {frozenBy!.className} {t('have already been published for')} {frozenBy!.termName}
            {t(', so these levels are settled until the next academic year.')}
          </Text>
        </View>
      )}

      {levels.map((l, i) => (
        <View key={l.id} style={s.card}>
          <View style={s.cardTop}>
            <View style={[s.dot, { backgroundColor: l.color }]} />
            <Text style={s.cardIndex}>{i + 1}</Text>
            <Text style={s.cardPreview} numberOfLines={1}>{levelLabel(l, lang, t) || t('(unnamed)')}</Text>
            <View style={{ flex: 1 }} />
            <TouchableOpacity onPress={() => move(i, -1)} disabled={locked || i === 0} style={s.iconBtn}>
              <Ionicons name="chevron-up" size={16} color={locked || i === 0 ? colors.textMuted : colors.text} />
            </TouchableOpacity>
            <TouchableOpacity onPress={() => move(i, 1)} disabled={locked || i === levels.length - 1} style={s.iconBtn}>
              <Ionicons name="chevron-down" size={16} color={locked || i === levels.length - 1 ? colors.textMuted : colors.text} />
            </TouchableOpacity>
            <TouchableOpacity onPress={() => removeLevel(i)} disabled={locked || levels.length <= limits.min} style={s.iconBtn}>
              <Ionicons name="trash-outline" size={15} color={locked || levels.length <= limits.min ? colors.textMuted : '#ef4444'} />
            </TouchableOpacity>
          </View>
          <View style={s.fieldRow}>
            <Text style={s.fieldLabel}>{t('Name (English)')}</Text>
            <TextInput value={l.labelEn} onChangeText={(v) => patch(i, 'labelEn', v)} editable={!locked}
              placeholder={t('e.g. Attained')} placeholderTextColor={colors.textMuted} style={s.input} />
          </View>
          <View style={s.fieldRow}>
            <Text style={s.fieldLabel}>{t('Name (French)')}</Text>
            <TextInput value={l.labelFr} onChangeText={(v) => patch(i, 'labelFr', v)} editable={!locked}
              placeholder={t('e.g. Acquis')} placeholderTextColor={colors.textMuted} style={s.input} />
          </View>
          <View style={s.fieldRow}>
            <Text style={s.fieldLabel}>{t('Short')}</Text>
            <TextInput value={l.short} onChangeText={(v) => patch(i, 'short', v)} editable={!locked}
              maxLength={4} placeholder="A" placeholderTextColor={colors.textMuted} style={[s.input, { width: 80 }]} />
          </View>
        </View>
      ))}

      {!locked && (
        <>
          <TouchableOpacity onPress={addLevel} disabled={levels.length >= limits.max} style={s.addBtn} activeOpacity={0.85}>
            <Ionicons name="add" size={16} color="#F03E2F" />
            <Text style={s.addBtnText}>
              {levels.length >= limits.max ? `${t('Up to')} ${limits.max} ${t('levels')}` : t('Add level')}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity onPress={save} disabled={saving} style={[s.saveBtn, saving && { opacity: 0.5 }]} activeOpacity={0.85}>
            {saving ? <ActivityIndicator color="#fff" size="small" /> : (
              <>
                <Ionicons name="save-outline" size={17} color="#fff" />
                <Text style={s.saveBtnText}>{t('Save Levels')}</Text>
              </>
            )}
          </TouchableOpacity>

          {!isDefault && (
            <TouchableOpacity onPress={reset} disabled={saving} style={s.resetBtn} activeOpacity={0.85}>
              <Text style={s.resetBtnText}>{t('Reset to default')}</Text>
            </TouchableOpacity>
          )}
        </>
      )}

      <Text style={s.footnote}>
        {t('Highest first. The English name is what gets stored on a report card, so renaming a level later does not change cards already issued. They keep the wording they were printed with.')}
      </Text>
    </View>
  )
}

const makeStyles = (colors: Colors) => StyleSheet.create({
  wrap: { marginTop: 24, paddingTop: 20, borderTopWidth: 1, borderTopColor: colors.border },
  title: { fontSize: 16, fontWeight: '800', color: colors.text },
  sub: { fontSize: 12, color: colors.textSecondary, marginTop: 4, lineHeight: 18 },
  hint: { fontSize: 11, color: colors.textMuted, marginTop: 4 },
  frozen: {
    flexDirection: 'row', gap: 8, alignItems: 'flex-start',
    backgroundColor: '#fef3c7', borderColor: '#fde68a', borderWidth: 1,
    borderRadius: 12, padding: 10, marginTop: 12,
  },
  frozenText: { flex: 1, fontSize: 11, color: '#92400e', lineHeight: 16 },
  card: {
    backgroundColor: colors.card, borderRadius: 12, borderWidth: 1, borderColor: colors.border,
    padding: 12, marginTop: 12,
  },
  cardTop: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 },
  dot: { width: 10, height: 10, borderRadius: 5 },
  cardIndex: { fontSize: 11, fontWeight: '700', color: colors.textMuted },
  cardPreview: { fontSize: 13, fontWeight: '700', color: colors.text, maxWidth: 150 },
  iconBtn: { padding: 5 },
  fieldRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 6 },
  fieldLabel: { width: 108, fontSize: 11, color: colors.textSecondary },
  input: {
    flex: 1, borderWidth: 1, borderColor: colors.border, borderRadius: 9,
    paddingHorizontal: 10, paddingVertical: 7, fontSize: 13, color: colors.text,
    backgroundColor: colors.inputBg,
  },
  addBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 12, marginTop: 12 },
  addBtnText: { fontSize: 13, fontWeight: '700', color: '#F03E2F' },
  saveBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: '#F03E2F', borderRadius: 12, paddingVertical: 14, marginTop: 4,
  },
  saveBtnText: { color: '#fff', fontWeight: '700', fontSize: 15 },
  resetBtn: { alignItems: 'center', paddingVertical: 12, marginTop: 4 },
  resetBtnText: { fontSize: 12, color: colors.textSecondary },
  footnote: { fontSize: 11, color: colors.textMuted, marginTop: 14, lineHeight: 16 },
})
