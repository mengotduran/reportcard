import { useState, useMemo } from 'react'
import {
  View, Text, TextInput, TouchableOpacity,
  StyleSheet, KeyboardAvoidingView, Platform, ActivityIndicator, ScrollView,
} from 'react-native'
import AuthBackground from '@/components/AuthBackground'
import { useRouter } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import { forgotPasswordApi } from '@/lib/api/auth'
import { useTheme, Colors } from '@/lib/useTheme'

const makeStyles = (colors: Colors) => StyleSheet.create({
  outer: { flex: 1, backgroundColor: 'transparent' },
  inner: { flexGrow: 1, justifyContent: 'center', padding: 24 },
  card: {
    backgroundColor: colors.card, borderRadius: 16, padding: 28,
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.08, shadowRadius: 8, elevation: 4,
  },
  backBtn: { position: 'absolute', top: 52, left: 20, zIndex: 20, padding: 10, borderRadius: 12, backgroundColor: 'rgba(0,0,0,0.05)' },
  title: { fontSize: 24, fontWeight: 'bold', color: colors.text, textAlign: 'center', marginBottom: 6 },
  subtitle: { fontSize: 14, color: colors.textSecondary, textAlign: 'center', marginBottom: 20, lineHeight: 20 },
  input: {
    borderWidth: 1, borderColor: colors.border, borderRadius: 10,
    paddingHorizontal: 14, paddingVertical: 14, fontSize: 15, color: colors.text,
    backgroundColor: colors.inputBg, marginBottom: 12,
  },
  button: { backgroundColor: '#F03E2F', borderRadius: 10, height: 52, alignItems: 'center', justifyContent: 'center', marginTop: 4 },
  buttonDisabled: { opacity: 0.6 },
  buttonText: { color: '#fff', fontWeight: '600', fontSize: 16 },
  errorText: { color: '#ef4444', fontSize: 13, textAlign: 'center', marginBottom: 8 },
  successBox: { alignItems: 'center', gap: 10 },
  successText: { fontSize: 14, color: colors.textSecondary, textAlign: 'center', lineHeight: 20 },
  backLink: { alignSelf: 'center', marginTop: 18, padding: 4 },
  backLinkText: { color: colors.textSecondary, fontSize: 13, fontWeight: '600' },
})

export default function ForgotPasswordScreen() {
  const { colors, isDark } = useTheme()
  const styles = useMemo(() => makeStyles(colors), [colors])
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [sent, setSent] = useState(false)

  const handleSubmit = async () => {
    if (!email.trim()) return
    setError('')
    setLoading(true)
    try {
      await forgotPasswordApi(email.trim())
      setSent(true)
    } catch {
      setError('Something went wrong. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <View style={{ flex: 1 }}>
      <AuthBackground dark={isDark} />
      <TouchableOpacity style={styles.backBtn} onPress={() => router.back()} activeOpacity={0.7}>
        <Ionicons name="arrow-back" size={20} color={isDark ? '#cfe0f4' : '#6f6553'} />
      </TouchableOpacity>
      <KeyboardAvoidingView style={styles.outer} behavior={Platform.OS === 'ios' ? undefined : 'height'}>
        <ScrollView contentContainerStyle={styles.inner} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false} bounces={false}>
          <View style={[styles.card, !isDark && { backgroundColor: '#f6f0e2', borderWidth: 1, borderColor: 'rgba(140,120,85,0.28)' }]}>
            {sent ? (
              <View style={styles.successBox}>
                <Ionicons name="checkmark-circle" size={40} color="#16a34a" />
                <Text style={styles.title}>Check your email</Text>
                <Text style={styles.successText}>
                  If {email.trim()} is registered, a password reset link has been sent to it. Open it on any device to set a new password.
                </Text>
                <TouchableOpacity style={styles.backLink} onPress={() => router.replace('/login')} activeOpacity={0.7}>
                  <Text style={styles.backLinkText}>Back to sign in</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <>
                <Text style={styles.title}>Forgot password?</Text>
                <Text style={styles.subtitle}>Enter your login email and we'll send you a link to reset it.</Text>

                {!!error && <Text style={styles.errorText}>{error}</Text>}

                <TextInput
                  style={styles.input}
                  placeholder="Email"
                  value={email}
                  onChangeText={(v) => { setEmail(v); if (error) setError('') }}
                  autoCapitalize="none"
                  autoCorrect={false}
                  spellCheck={false}
                  keyboardType="email-address"
                  textContentType="emailAddress"
                  returnKeyType="done"
                  onSubmitEditing={handleSubmit}
                  placeholderTextColor="#9ca3af"
                  selectionColor="#F03E2F"
                />

                <TouchableOpacity
                  style={[styles.button, (loading || !email.trim()) && styles.buttonDisabled]}
                  onPress={handleSubmit}
                  disabled={loading || !email.trim()}
                  activeOpacity={0.8}
                >
                  {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Send reset link</Text>}
                </TouchableOpacity>

                <TouchableOpacity style={styles.backLink} onPress={() => router.back()} activeOpacity={0.7}>
                  <Text style={styles.backLinkText}>Back to sign in</Text>
                </TouchableOpacity>
              </>
            )}
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  )
}
