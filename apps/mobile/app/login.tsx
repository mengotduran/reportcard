import { useState, useRef, useMemo } from 'react'
import {
  View, Text, TextInput, TouchableOpacity,
  StyleSheet, KeyboardAvoidingView, Platform, ActivityIndicator, ScrollView,
} from 'react-native'
import { Redirect } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import { useAuthStore } from '@/lib/store/auth.store'
import { loginApi } from '@/lib/api/auth'
import { useTheme, Colors } from '@/lib/useTheme'

const makeStylesStyles = (colors: Colors) => StyleSheet.create(({
  outer: {
    flex: 1,
    backgroundColor: colors.bgSecondary,
  },
  inner: {
    flexGrow: 1,
    justifyContent: 'center',
    padding: 24,
  },
  card: {
    backgroundColor: colors.card,
    borderRadius: 16,
    padding: 28,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 4,
  },
  title: {
    fontSize: 26,
    fontWeight: 'bold',
    color: colors.text,
    textAlign: 'center',
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 14,
    color: colors.textSecondary,
    textAlign: 'center',
    marginBottom: 16,
  },
  // Fixed height — card never shifts when error appears/disappears
  errorRow: {
    height: 36,
    justifyContent: 'center',
    marginBottom: 8,
  },
  errorText: {
    color: '#ef4444',
    fontSize: 13,
    textAlign: 'center',
  },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 14,
    fontSize: 15,
    color: colors.text,
    backgroundColor: colors.inputBg,
    marginBottom: 12,
  },
  passwordWrap: {
    position: 'relative',
    marginBottom: 12,
  },
  passwordInput: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 14,
    paddingRight: 46,
    fontSize: 15,
    color: colors.text,
    backgroundColor: colors.inputBg,
  },
  eyeBtn: {
    position: 'absolute',
    right: 14,
    top: 0,
    bottom: 0,
    justifyContent: 'center',
    alignItems: 'center',
    width: 32,
  },
  button: {
    backgroundColor: '#F03E2F',
    borderRadius: 10,
    height: 52,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 4,
  },
  buttonDisabled: { opacity: 0.6 },
  buttonText: { color: '#fff', fontWeight: '600', fontSize: 16 },
}))

export default function LoginScreen() {
  const { colors } = useTheme()
  const styles = useMemo(() => makeStylesStyles(colors), [colors])
  const { isAuthenticated, _hasHydrated, login } = useAuthStore()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const passwordRef = useRef<TextInput>(null)

  if (!_hasHydrated) return null
  if (isAuthenticated) return <Redirect href="/(tabs)" />

  const handleLogin = async () => {
    if (!email || !password) { setError('Please fill in all fields.'); return }
    setLoading(true)
    setError('')
    try {
      const data = await loginApi({ email, password })
      login(data.token, data.user, data.school)
    } catch {
      // Fields kept — user can correct without retyping
      setError('One of your credentials is incorrect. Please check and try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <KeyboardAvoidingView
      style={styles.outer}
      behavior={Platform.OS === 'ios' ? undefined : 'height'}
    >
      <ScrollView
        contentContainerStyle={styles.inner}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        bounces={false}
        automaticallyAdjustKeyboardInsets={Platform.OS === 'ios'}
      >
        <View style={styles.card}>
          <Text style={styles.title}>ReportCard</Text>
          <Text style={styles.subtitle}>Sign in to your account</Text>

          {/* Fixed-height error row — card height never shifts */}
          <View style={styles.errorRow}>
            {!!error && <Text style={styles.errorText}>{error}</Text>}
          </View>

          <TextInput
            style={styles.input}
            placeholder="Email"
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            autoCorrect={false}
            spellCheck={false}
            keyboardType="email-address"
            textContentType="emailAddress"
            returnKeyType="next"
            onSubmitEditing={() => passwordRef.current?.focus()}
            placeholderTextColor="#9ca3af"
            selectionColor="#F03E2F"
          />

          <View style={styles.passwordWrap}>
            <TextInput
              ref={passwordRef}
              style={styles.passwordInput}
              placeholder="Password"
              value={password}
              onChangeText={setPassword}
              secureTextEntry={!showPassword}
              autoCorrect={false}
              autoCapitalize="none"
              textContentType="password"
              returnKeyType="done"
              onSubmitEditing={handleLogin}
              placeholderTextColor="#9ca3af"
              selectionColor="#F03E2F"
            />
            <TouchableOpacity
              style={styles.eyeBtn}
              onPress={() => setShowPassword((v) => !v)}
              activeOpacity={0.7}
            >
              <Ionicons
                name={showPassword ? 'eye-off-outline' : 'eye-outline'}
                size={20}
                color="#9ca3af"
              />
            </TouchableOpacity>
          </View>

          <TouchableOpacity
            style={[styles.button, loading && styles.buttonDisabled]}
            onPress={handleLogin}
            disabled={loading}
            activeOpacity={0.8}
          >
            {loading
              ? <ActivityIndicator color="#fff" />
              : <Text style={styles.buttonText}>Sign In</Text>}
          </TouchableOpacity>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  )
}
