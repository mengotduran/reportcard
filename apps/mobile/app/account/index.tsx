import { useState } from 'react'
import { View, Text, ScrollView, TextInput, TouchableOpacity, StyleSheet, Alert, ActivityIndicator } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { useAuthStore } from '@/lib/store/auth.store'
import { useTheme, Colors } from '@/lib/useTheme'
import { changeMyPasswordApi } from '@/lib/api/auth'
import { useT } from '@/lib/i18n'

const makeStyles = (colors: Colors) => StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bgSecondary },
  content: { padding: 16, paddingBottom: 40 },
  card: {
    backgroundColor: colors.card, borderRadius: 16, padding: 16, marginBottom: 16,
    borderWidth: 1, borderColor: colors.border,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.04, shadowRadius: 3, elevation: 1,
  },
  profileRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  avatar: { width: 44, height: 44, borderRadius: 12, backgroundColor: '#FEF2F1', justifyContent: 'center', alignItems: 'center' },
  name: { fontSize: 16, fontWeight: '700', color: colors.text },
  email: { fontSize: 12.5, color: colors.textSecondary, marginTop: 2 },
  cardTitle: { fontSize: 15, fontWeight: '700', color: colors.text, marginBottom: 2 },
  cardSub: { fontSize: 12.5, color: colors.textSecondary, marginBottom: 14 },
  label: { fontSize: 12, fontWeight: '600', color: colors.textSecondary, marginBottom: 6 },
  inputWrap: { position: 'relative', marginBottom: 14 },
  input: {
    borderWidth: 1, borderColor: colors.border, borderRadius: 10,
    paddingHorizontal: 14, paddingVertical: 12, paddingRight: 42, fontSize: 14, color: colors.text,
    backgroundColor: colors.inputBg,
  },
  eyeBtn: { position: 'absolute', right: 10, top: 0, bottom: 0, justifyContent: 'center', alignItems: 'center', width: 32 },
  button: {
    backgroundColor: '#F03E2F', borderRadius: 10, height: 46,
    alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 8,
  },
  buttonDisabled: { opacity: 0.5 },
  buttonText: { color: '#fff', fontWeight: '700', fontSize: 14.5 },
})

export default function AccountScreen() {
  const { colors } = useTheme()
  const styles = makeStyles(colors)
  const { user } = useAuthStore()
  const t = useT()

  const [current, setCurrent] = useState('')
  const [next, setNext] = useState('')
  const [confirm, setConfirm] = useState('')
  const [show, setShow] = useState(false)
  const [saving, setSaving] = useState(false)

  const canSubmit = current.length > 0 && next.length >= 6 && next === confirm

  const handleSubmit = async () => {
    if (!canSubmit) return
    if (next.length < 6) { Alert.alert(t('Error'), t('New password must be at least 6 characters')); return }
    if (next !== confirm) { Alert.alert(t('Error'), t('New passwords do not match')); return }
    setSaving(true)
    try {
      await changeMyPasswordApi(current, next)
      setCurrent(''); setNext(''); setConfirm('')
      Alert.alert(t('Saved'), t('Password changed successfully.'))
    } catch (err: any) {
      Alert.alert(t('Error'), err?.response?.data?.message || t('Failed to change password.'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.card}>
        <View style={styles.profileRow}>
          <View style={styles.avatar}>
            <Ionicons name="person-outline" size={22} color="#F03E2F" />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.name}>{user?.name}</Text>
            <Text style={styles.email}>{user?.email}</Text>
          </View>
        </View>
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>{t('Change Password')}</Text>
        <Text style={styles.cardSub}>{t('Update the password you sign in with')}</Text>

        <Text style={styles.label}>{t('Current Password')}</Text>
        <View style={styles.inputWrap}>
          <TextInput
            style={styles.input}
            value={current}
            onChangeText={setCurrent}
            secureTextEntry={!show}
            autoCapitalize="none"
            autoCorrect={false}
            placeholderTextColor="#9ca3af"
            textContentType="password"
          />
          <TouchableOpacity style={styles.eyeBtn} onPress={() => setShow((v) => !v)} activeOpacity={0.7}>
            <Ionicons name={show ? 'eye-off-outline' : 'eye-outline'} size={18} color="#9ca3af" />
          </TouchableOpacity>
        </View>

        <Text style={styles.label}>{t('New Password')}</Text>
        <TextInput
          style={[styles.input, { marginBottom: 14 }]}
          value={next}
          onChangeText={setNext}
          secureTextEntry={!show}
          autoCapitalize="none"
          autoCorrect={false}
          placeholderTextColor="#9ca3af"
          textContentType="newPassword"
        />

        <Text style={styles.label}>{t('Confirm New Password')}</Text>
        <TextInput
          style={[styles.input, { marginBottom: 18 }]}
          value={confirm}
          onChangeText={setConfirm}
          secureTextEntry={!show}
          autoCapitalize="none"
          autoCorrect={false}
          placeholderTextColor="#9ca3af"
          textContentType="newPassword"
          returnKeyType="done"
          onSubmitEditing={handleSubmit}
        />

        <TouchableOpacity
          style={[styles.button, (saving || !canSubmit) && styles.buttonDisabled]}
          onPress={handleSubmit}
          disabled={saving || !canSubmit}
          activeOpacity={0.8}
        >
          {saving ? <ActivityIndicator color="#fff" /> : (
            <>
              <Ionicons name="key-outline" size={16} color="#fff" />
              <Text style={styles.buttonText}>{t('Change Password')}</Text>
            </>
          )}
        </TouchableOpacity>
      </View>
    </ScrollView>
  )
}
