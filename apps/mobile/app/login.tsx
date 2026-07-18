import { useState, useRef, useMemo, useEffect } from 'react'
import {
  View, Text, TextInput, TouchableOpacity,
  StyleSheet, KeyboardAvoidingView, Platform, ActivityIndicator, ScrollView, Animated,
} from 'react-native'
import AuthBackground from '@/components/AuthBackground'
import { useThemeStore } from '@/lib/store/theme.store'
import { Redirect } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import { useAuthStore } from '@/lib/store/auth.store'
import { loginApi } from '@/lib/api/auth'
import { useTheme, Colors } from '@/lib/useTheme'

const makeStylesStyles = (colors: Colors) => StyleSheet.create(({
  outer: {
    flex: 1,
    // The animated AuthBackground paints the base; an opaque colour here would hide it.
    backgroundColor: 'transparent',
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
  logoBox: {
    width: 52,
    height: 52,
    borderRadius: 14,
    backgroundColor: '#F03E2F',
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'center',
    marginBottom: 12,
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
  const { colors, isDark } = useTheme()
  const styles = useMemo(() => makeStylesStyles(colors), [colors])
  // The theme toggler the web login has, top-right.
  // A plain two-state toggle on what you SEE: cycling through 'system' meant a tap from
  // dark to system looked like nothing happened on a dark-mode phone, and reaching light
  // took two taps. The icon shows what a tap gives you (sun while dark, moon while light).
  const { setTheme } = useThemeStore()
  const cycleTheme = () => setTheme(isDark ? 'light' : 'dark')
  const themeIcon = isDark ? 'sunny-outline' : 'moon-outline'

  // The web login shakes its error box on every failed attempt; same here. Keyed on a
  // counter so a SECOND failure re-fires even though the message text is identical.
  const [errorKey, setErrorKey] = useState(0)
  const shake = useRef(new Animated.Value(0)).current
  useEffect(() => {
    if (!errorKey) return
    shake.setValue(0)
    Animated.sequence(
      [1, -1, 0.8, -0.8, 0.4, 0].map(v =>
        Animated.timing(shake, { toValue: v, duration: 70, useNativeDriver: true })
      )
    ).start()
  }, [errorKey, shake])
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
    } catch (err: any) {
      // Fields kept — user can correct without retyping.
      // Only a real server REJECTION means bad credentials. A timeout or refused
      // connection used to show the same message, sending people to re-type a correct
      // password while the actual problem was the phone not reaching the server at all.
      setError(err?.response
        ? 'One of your credentials is incorrect. Please check and try again.'
        : 'Cannot reach the school server. Check that your phone and the server are on the same network.')
      setErrorKey(k => k + 1)
    } finally {
      setLoading(false)
    }
  }

  return (
    <View style={{ flex: 1 }}>
      <AuthBackground dark={isDark} />
      <TouchableOpacity
        onPress={cycleTheme}
        activeOpacity={0.7}
        style={{ position: 'absolute', top: 52, right: 20, zIndex: 20, padding: 10, borderRadius: 12, backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.05)' }}>
        <Ionicons name={themeIcon} size={20} color={isDark ? '#cfe0f4' : '#6f6553'} />
      </TouchableOpacity>
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
        {/* Light mode: warm parchment, not stark white — the card sat too bright on the
            paper backdrop. Dark mode keeps the theme card colour. */}
        <View style={[styles.card, !isDark && { backgroundColor: '#f6f0e2', borderWidth: 1, borderColor: 'rgba(140,120,85,0.28)' }]}>
          <View style={styles.logoBox}>
            <Ionicons name="school" size={26} color="#fff" />
          </View>
          <Text style={styles.title}>Bulletin</Text>
          <Text style={styles.subtitle}>Sign in to your school account</Text>

          {/* Fixed-height error row — card height never shifts; shakes on each failure */}
          <Animated.View style={[styles.errorRow, { transform: [{ translateX: shake.interpolate({ inputRange: [-1, 1], outputRange: [-6, 6] }) }] }]}>
            {!!error && <Text style={styles.errorText}>{error}</Text>}
          </Animated.View>

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
    </View>
  )
}
