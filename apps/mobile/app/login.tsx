import { useState, useRef, useMemo, useEffect } from 'react'
import {
  View, Text, TextInput, TouchableOpacity,
  StyleSheet, KeyboardAvoidingView, Platform, ActivityIndicator, ScrollView, Animated,
  Alert, Linking,
} from 'react-native'
import { useThemeStore } from '@/lib/store/theme.store'
import { Redirect, useRouter } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import { useAuthStore } from '@/lib/store/auth.store'
import { loginApi } from '@/lib/api/auth'
import { PARENT_SIGNUP_URL } from '@/lib/config'
import { useTheme, Colors, type, space, radius, hairlineWidth } from '@/lib/useTheme'

const makeStyles = (colors: Colors) => StyleSheet.create({
  outer: { flex: 1, backgroundColor: colors.bg },
  inner: { flexGrow: 1, justifyContent: 'center', paddingTop: space.xl, paddingBottom: 100 },
  card: { paddingHorizontal: 28 },
  crestRow: { alignItems: 'center', marginBottom: space.lg },
  crest: {
    width: 56, height: 56, borderRadius: 28,
    borderWidth: 1, borderColor: colors.brassInk,
    alignItems: 'center', justifyContent: 'center', marginBottom: space.md,
  },
  wordmark: { ...type.greetingName, color: colors.text },
  tagline: { ...type.bodySmall, color: colors.textDim, textAlign: 'center', marginBottom: space.xl, lineHeight: 19 },
  // Fixed height — the card never shifts when the error appears or clears.
  errorRow: { height: 34, justifyContent: 'center', marginBottom: space.xs },
  errorText: { ...type.bodySmall, color: colors.danger, textAlign: 'center' },
  inputWrap: {
    flexDirection: 'row', alignItems: 'center',
    borderWidth: hairlineWidth, borderColor: colors.line, borderRadius: radius.control,
    backgroundColor: colors.surface,
    paddingHorizontal: space.lg, height: 52, marginBottom: space.md,
  },
  inputIcon: { marginRight: space.sm },
  inputField: { ...type.body, flex: 1, height: '100%', color: colors.text },
  eyeBtn: { padding: space.xs, marginLeft: space.xs },
  optionsRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: space.xl },
  rememberRow: { flexDirection: 'row', alignItems: 'center' },
  rememberLabel: { ...type.bodySmall, color: colors.textDim, marginLeft: space.sm },
  forgotLink: { ...type.bodySmall, color: colors.brassInk },
  button: {
    backgroundColor: colors.brassFill, borderRadius: radius.control,
    height: 52, alignItems: 'center', justifyContent: 'center',
  },
  buttonDisabled: { opacity: 0.6 },
  buttonText: { ...type.buttonLabel, color: colors.onBrass },
  parentRow: { alignItems: 'center', marginTop: space.lg },
  parentText: { ...type.bodySmall, color: colors.textDim, textAlign: 'center' },
  parentLink: { color: colors.brassInk },
  secureRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginTop: space.lg },
  secureText: { ...type.microLabel, color: colors.textFaint, marginLeft: space.xs },
})

export default function LoginScreen() {
  const { colors, isDark } = useTheme()
  const styles = useMemo(() => makeStyles(colors), [colors])
  const { setTheme } = useThemeStore()
  const cycleTheme = () => setTheme(isDark ? 'light' : 'dark')
  const themeIcon = isDark ? 'sunny-outline' : 'moon-outline'

  // Shake the error box on every failed attempt (keyed so a repeat failure re-fires).
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
  const router = useRouter()
  const { isAuthenticated, _hasHydrated, user, login } = useAuthStore()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [rememberMe, setRememberMe] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const passwordRef = useRef<TextInput>(null)

  if (!_hasHydrated) return null
  // A remembered session lands wherever that role belongs. Parents have their own group;
  // see the PARENT branch in handleLogin.
  if (isAuthenticated) return <Redirect href={user?.role === 'PARENT' ? '/(parent)/children' : '/(tabs)'} />

  const handleLogin = async () => {
    if (!email || !password) { setError('Please fill in all fields.'); setErrorKey(k => k + 1); return }
    setLoading(true)
    setError('')
    try {
      const data = await loginApi({ email, password })

      login(data.token, data.user, data.school, rememberMe)

      // A parent goes to their own route group, never to the staff tabs: every screen in
      // there is written against a staff user with a school, and a parent's account has
      // neither (User.schoolId is null by design, since their children can be at two
      // schools at once). The API draws the same line, refusing a PARENT token on every
      // staff route, so this is not merely cosmetic routing.
      //
      // Same account and same password as the website. There is no separate sign-up here:
      // a parent asks for access on the site, sets their password once from the link they
      // are sent, and signs in here with it from then on.
      if (data.user?.role === 'PARENT') { router.replace('/(parent)/children'); return }
    } catch (err: any) {
      setError(err?.response
        ? 'One of your credentials is incorrect. Please check and try again.'
        : 'Cannot reach the school server. Check that your phone and the server are on the same network.')
      setErrorKey(k => k + 1)
    } finally {
      setLoading(false)
    }
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <TouchableOpacity
        onPress={cycleTheme}
        activeOpacity={0.7}
        hitSlop={8}
        style={{ position: 'absolute', top: 52, right: 20, zIndex: 20, padding: 10 }}>
        <Ionicons name={themeIcon} size={20} color={colors.brassInk} />
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
          <View style={styles.card}>
            <View style={styles.crestRow}>
              <View style={styles.crest}>
                <Ionicons name="school-outline" size={26} color={colors.brassInk} />
              </View>
              <Text style={styles.wordmark}>Bulletin</Text>
            </View>
            <Text style={styles.tagline}>Marks, attendance and report cards{'\n'}for your school, all in one place.</Text>

            <Animated.View style={[styles.errorRow, { transform: [{ translateX: shake.interpolate({ inputRange: [-1, 1], outputRange: [-6, 6] }) }] }]}>
              {!!error && <Text style={styles.errorText}>{error}</Text>}
            </Animated.View>

            <View style={styles.inputWrap}>
              <Ionicons name="mail-outline" size={18} color={colors.textFaint} style={styles.inputIcon} />
              <TextInput
                style={styles.inputField}
                placeholder="Email, phone or username"
                value={email}
                onChangeText={setEmail}
                autoCapitalize="none"
                autoCorrect={false}
                spellCheck={false}
                keyboardType="email-address"
                // The field takes either identifier (a teacher with no email logs in with a
                // username — see User.username), so AutoFill is told "username", not
                // "emailAddress", which would offer only addresses. Matches web's
                // autoComplete="username".
                textContentType="username"
                returnKeyType="next"
                onSubmitEditing={() => passwordRef.current?.focus()}
                placeholderTextColor={colors.textFaint}
                selectionColor={colors.brassInk}
              />
            </View>

            <View style={styles.inputWrap}>
              <Ionicons name="lock-closed-outline" size={18} color={colors.textFaint} style={styles.inputIcon} />
              <TextInput
                ref={passwordRef}
                style={styles.inputField}
                placeholder="Password"
                value={password}
                onChangeText={setPassword}
                secureTextEntry={!showPassword}
                autoCorrect={false}
                autoCapitalize="none"
                textContentType="password"
                returnKeyType="done"
                onSubmitEditing={handleLogin}
                placeholderTextColor={colors.textFaint}
                selectionColor={colors.brassInk}
              />
              <TouchableOpacity
                style={styles.eyeBtn}
                onPress={() => setShowPassword((v) => !v)}
                activeOpacity={0.7}
              >
                <Ionicons
                  name={showPassword ? 'eye-off-outline' : 'eye-outline'}
                  size={20}
                  color={colors.textFaint}
                />
              </TouchableOpacity>
            </View>

            <View style={styles.optionsRow}>
              <TouchableOpacity
                style={styles.rememberRow}
                onPress={() => setRememberMe(v => !v)}
                activeOpacity={0.7}
              >
                <Ionicons
                  name={rememberMe ? 'checkbox' : 'square-outline'}
                  size={19}
                  color={rememberMe ? colors.brassInk : colors.textFaint}
                />
                <Text style={styles.rememberLabel}>Remember me</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => router.push('/forgot-password')} activeOpacity={0.7}>
                <Text style={styles.forgotLink}>Forgot password?</Text>
              </TouchableOpacity>
            </View>

            <TouchableOpacity
              style={[styles.button, loading && styles.buttonDisabled]}
              onPress={handleLogin}
              disabled={loading}
              activeOpacity={0.85}
            >
              {loading
                ? <ActivityIndicator color={colors.onBrass} />
                : <Text style={styles.buttonText}>Sign in</Text>}
            </TouchableOpacity>

            {/* Parents sign in here like anyone else, but there is no sign-up in the app:
                asking for access needs the school and class pickers, and the link that comes
                back is emailed. That whole flow lives on the website, so this hands them to
                it. Once their password is set, this same screen is their way in. */}
            <TouchableOpacity
              onPress={() => Linking.openURL(PARENT_SIGNUP_URL).catch(() =>
                Alert.alert('Could not open the browser', `Visit ${PARENT_SIGNUP_URL} to ask for access.`))}
              activeOpacity={0.7}
              style={styles.parentRow}
            >
              <Text style={styles.parentText}>
                Parent? <Text style={styles.parentLink}>Get access to your child&apos;s results</Text>
              </Text>
            </TouchableOpacity>

            <View style={styles.secureRow}>
              <Ionicons name="lock-closed-outline" size={12} color={colors.textFaint} />
              <Text style={styles.secureText}>secure sign-in</Text>
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  )
}
