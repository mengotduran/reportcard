// app/admin/teachers/create.tsx
import { useState, useEffect } from 'react'
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  ScrollView, ActivityIndicator, Alert, KeyboardAvoidingView, Platform,
} from 'react-native'
import { useRouter } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import { createTeacher } from '@/lib/api/teachers'
import { getDepartments } from '@/lib/api/departments'
import { getClasses } from '@/lib/api/classes'
import { useTheme, Colors } from '@/lib/useTheme'
import { useT } from '@/lib/i18n'
import { useAuthStore } from '@/lib/store/auth.store'

// University class-name convention: "HND {Department} - Level 1|2", "Degree
// {Department}". Universities have no real Department table row — mirrors
// deptFromClassName in apps/web/app/(dashboard)/classes/page.tsx.
const univDeptFromClassName = (name: string): string => {
  if (/^HND .+ - Level \d+$/i.test(name)) return name.replace(/^HND /, '').replace(/ - Level \d+$/i, '')
  if (name.startsWith('Degree ')) return name.replace(/^Degree /, '')
  return name
}

const makeStylesStyles = (colors: Colors) => StyleSheet.create(({
  container: { flex: 1, backgroundColor: colors.bgSecondary },
  content: { padding: 16, paddingBottom: 40 },
  section: {
    backgroundColor: colors.card,
    borderRadius: 16,
    padding: 16,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: colors.border,
  },
  sectionLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.textMuted,
    letterSpacing: 1,
    marginBottom: 14,
  },
  label: { fontSize: 13, fontWeight: '600', color: colors.text, marginBottom: 6 },
  required: { color: '#ef4444' },
  input: {
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 10,
    padding: 12,
    fontSize: 14,
    color: colors.text,
    backgroundColor: colors.card,
    marginBottom: 14,
  },
  passwordWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 10,
    backgroundColor: colors.card,
    marginBottom: 14,
  },
  passwordInput: { flex: 1, padding: 12, fontSize: 14, color: colors.text, backgroundColor: 'transparent' },
  eyeBtn: { padding: 12 },
  toggle: {
    flexDirection: 'row',
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 10,
    overflow: 'hidden',
  },
  toggleBtn: {
    flex: 1,
    paddingVertical: 12,
    alignItems: 'center',
    backgroundColor: colors.bgSecondary,
  },
  toggleActive: { backgroundColor: '#F03E2F' },
  toggleText: { fontSize: 14, fontWeight: '600', color: colors.textSecondary },
  toggleTextActive: { color: '#fff' },
  submitBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#F03E2F',
    borderRadius: 14,
    paddingVertical: 16,
    marginTop: 4,
    shadowColor: '#F03E2F',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 5,
  },
  submitText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  disabled: { opacity: 0.5 },
  deptRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  deptChip: {
    paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20,
    borderWidth: 1, borderColor: '#d1d5db', backgroundColor: colors.bgSecondary,
  },
  deptChipActive: { backgroundColor: '#F03E2F', borderColor: '#F03E2F' },
  deptChipText: { fontSize: 13, fontWeight: '600', color: colors.textSecondary },
  deptChipTextActive: { color: '#fff' },
  hint: { fontSize: 12, color: colors.textMuted, marginTop: 10 },
}))

export default function CreateTeacherScreen() {
  const { colors, isDark } = useTheme()
  const styles = makeStylesStyles(colors)
  const t = useT()
  const router = useRouter()
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [role, setRole] = useState<'CLASS_TEACHER' | 'CLASS_MASTER'>('CLASS_TEACHER')
  const [masterClassLevel, setMasterClassLevel] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)

  const { school } = useAuthStore()
  const isUniversity = school?.type === 'UNIVERSITY'
  const isSecondary = school?.type === 'SECONDARY'
  const hasDeptView = isSecondary || isUniversity
  const [deptNames, setDeptNames] = useState<string[]>([])
  const [departments, setDepartments] = useState<string[]>([])

  useEffect(() => {
    if (!hasDeptView) return
    if (isSecondary) {
      getDepartments().then((d) => setDeptNames(d.departments.map((dep) => dep.name))).catch(() => {})
    } else {
      getClasses().then((c) => setDeptNames([...new Set(c.classLevels.map((cl) => univDeptFromClassName(cl.name)))].sort())).catch(() => {})
    }
  }, [hasDeptView, isSecondary])

  const handleSubmit = async () => {
    if (!name.trim() || !email.trim() || !password.trim()) {
      Alert.alert(t('Validation'), t('Name, email, and password are required.'))
      return
    }
    if (role === 'CLASS_MASTER' && !masterClassLevel.trim()) {
      Alert.alert(t('Validation'), t('Master class level is required for Class Master.'))
      return
    }
    setLoading(true)
    try {
      await createTeacher({
        name: name.trim(),
        email: email.trim(),
        password,
        role,
        masterClassLevel: role === 'CLASS_MASTER' ? masterClassLevel.trim() : undefined,
        departments,
      })
      Alert.alert(t('Success'), t('Teacher created successfully.'), [
        { text: t('OK'), onPress: () => router.back() },
      ])
    } catch (err: any) {
      const msg = err?.response?.data?.message ?? t('Failed to create teacher.')
      Alert.alert(t('Error'), msg)
    } finally {
      setLoading(false)
    }
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView style={styles.container} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>{t('TEACHER DETAILS')}</Text>

          <Text style={styles.label}>{t('Full Name')} <Text style={styles.required}>*</Text></Text>
          <TextInput
            style={styles.input}
            value={name}
            onChangeText={setName}
            placeholder={t('e.g. Jane Doe')}
            placeholderTextColor="#9ca3af"
            autoCapitalize="words"
          />

          <Text style={styles.label}>{t('Email Address')} <Text style={styles.required}>*</Text></Text>
          <TextInput
            style={styles.input}
            value={email}
            onChangeText={setEmail}
            placeholder={t('e.g. jane@school.com')}
            placeholderTextColor="#9ca3af"
            keyboardType="email-address"
            autoCapitalize="none"
          />

          <Text style={styles.label}>{t('Password')} <Text style={styles.required}>*</Text></Text>
          <View style={styles.passwordWrap}>
            <TextInput
              style={styles.passwordInput}
              value={password}
              onChangeText={setPassword}
              placeholder={t('Set a password')}
              placeholderTextColor="#9ca3af"
              secureTextEntry={!showPassword}
              autoCapitalize="none"
            />
            <TouchableOpacity onPress={() => setShowPassword((v) => !v)} style={styles.eyeBtn}>
              <Ionicons name={showPassword ? 'eye-off-outline' : 'eye-outline'} size={20} color="#6b7280" />
            </TouchableOpacity>
          </View>
        </View>

        {hasDeptView && deptNames.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>{t('DEPARTMENTS')}</Text>
            <View style={styles.deptRow}>
              {deptNames.map((d) => {
                const on = departments.includes(d)
                return (
                  <TouchableOpacity key={d}
                    style={[styles.deptChip, on && styles.deptChipActive]}
                    onPress={() => setDepartments((prev) => prev.includes(d) ? prev.filter((x) => x !== d) : [...prev, d])}>
                    <Text style={[styles.deptChipText, on && styles.deptChipTextActive]}>{d}</Text>
                  </TouchableOpacity>
                )
              })}
            </View>
            <Text style={styles.hint}>{t('A teacher can belong to more than one department.')}</Text>
          </View>
        )}

        <View style={styles.section}>
          <Text style={styles.sectionLabel}>{t('ROLE')}</Text>
          <View style={styles.toggle}>
            <TouchableOpacity
              style={[styles.toggleBtn, role === 'CLASS_TEACHER' && styles.toggleActive]}
              onPress={() => setRole('CLASS_TEACHER')}
            >
              <Text style={[styles.toggleText, role === 'CLASS_TEACHER' && styles.toggleTextActive]}>
                {t('Class Teacher')}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.toggleBtn, role === 'CLASS_MASTER' && styles.toggleActive]}
              onPress={() => setRole('CLASS_MASTER')}
            >
              <Text style={[styles.toggleText, role === 'CLASS_MASTER' && styles.toggleTextActive]}>
                {t('Class Master')}
              </Text>
            </TouchableOpacity>
          </View>

          {role === 'CLASS_MASTER' && (
            <>
              <Text style={[styles.label, { marginTop: 16 }]}>{t('Master Class Level')} <Text style={styles.required}>*</Text></Text>
              <TextInput
                style={styles.input}
                value={masterClassLevel}
                onChangeText={setMasterClassLevel}
                placeholder={t('e.g. Form 3A')}
                placeholderTextColor="#9ca3af"
                autoCapitalize="words"
              />
            </>
          )}
        </View>

        <TouchableOpacity
          style={[styles.submitBtn, loading && styles.disabled]}
          onPress={handleSubmit}
          disabled={loading}
          activeOpacity={0.85}
        >
          {loading
            ? <ActivityIndicator color="#fff" size="small" />
            : (
              <>
                <Ionicons name="person-add-outline" size={18} color="#fff" />
                <Text style={styles.submitText}>{t('Create Teacher')}</Text>
              </>
            )}
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  )
}
