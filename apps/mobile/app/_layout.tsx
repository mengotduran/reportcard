import { useEffect } from 'react'
import { View } from 'react-native'
import { SafeAreaProvider } from 'react-native-safe-area-context'
import { Stack } from 'expo-router'
import { StatusBar } from 'expo-status-bar'
import * as SplashScreen from 'expo-splash-screen'
import { useFonts } from 'expo-font'
import { Blinker_400Regular, Blinker_600SemiBold } from '@expo-google-fonts/blinker'
import { IBMPlexSans_400Regular, IBMPlexSans_500Medium } from '@expo-google-fonts/ibm-plex-sans'
import { IBMPlexMono_400Regular, IBMPlexMono_500Medium } from '@expo-google-fonts/ibm-plex-mono'
import { useTheme } from '@/lib/useTheme'
import { useT } from '@/lib/i18n'
import { useAuthStore } from '@/lib/store/auth.store'
import { applyGlobalFont } from '@/lib/theme/applyGlobalFont'

// App-wide default font (IBM Plex Sans) for any Text/TextInput that doesn't set
// its own — runs once at module load, before first render.
applyGlobalFont()

// Keep the native splash up until our custom fonts are ready — never flash the
// system font, and never paint a white frame on cold start (see backgroundColor
// on the root View below + expo.backgroundColor in app.json).
SplashScreen.preventAutoHideAsync().catch(() => {})

export default function RootLayout() {
  const { colors, isDark } = useTheme()
  const t = useT()
  const { school } = useAuthStore()

  const [fontsLoaded] = useFonts({
    Blinker_400Regular,
    Blinker_600SemiBold,
    IBMPlexSans_400Regular,
    IBMPlexSans_500Medium,
    IBMPlexMono_400Regular,
    IBMPlexMono_500Medium,
  })

  useEffect(() => {
    if (fontsLoaded) SplashScreen.hideAsync().catch(() => {})
  }, [fontsLoaded])

  if (!fontsLoaded) return <View style={{ flex: 1, backgroundColor: colors.bg }} />

  // Universities use different wording for the same screens — just a different header title.
  const isUniversity = school?.type === 'UNIVERSITY'
  const termsTitle = isUniversity ? t('Semesters') : t('Terms')
  const subjectsTitle = isUniversity ? t('Courses') : t('Subjects')
  const classesTitle = isUniversity ? t('Departments') : t('Classes')
  return (
    <SafeAreaProvider>
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <StatusBar style={isDark ? 'light' : 'dark'} />
      <Stack
      screenOptions={{
        animation: 'slide_from_right',
        animationDuration: 280,
        headerShadowVisible: false,
        headerBackButtonDisplayMode: 'minimal',
        headerStyle: { backgroundColor: colors.bg },
        headerTintColor: colors.brassInk,
        headerTitleStyle: { fontFamily: 'Blinker_600SemiBold', color: colors.text },
        contentStyle: { backgroundColor: colors.bg },
      }}
    >
      <Stack.Screen name="login" options={{ headerShown: false, animation: 'fade' }} />
      <Stack.Screen name="forgot-password" options={{ headerShown: false }} />
      <Stack.Screen name="(tabs)" options={{ headerShown: false, animation: 'fade' }} />
      <Stack.Screen name="account/index" options={{ title: t('My Account'), headerBackTitle: '' }} />
      <Stack.Screen name="notifications" options={{ title: t('Notifications'), headerBackTitle: '' }} />
      <Stack.Screen name="absences" options={{ title: t('Absences'), headerBackTitle: '' }} />
      {/* Read-only view of another teacher's timetable, opened from an absence. Its own
          header is rendered in-screen, so the stack header is hidden. */}
      <Stack.Screen name="teacher-timetable" options={{ headerShown: false }} />
      <Stack.Screen name="my-courses" options={{ headerBackTitle: '' }} />
      <Stack.Screen name="class/[classLevel]" options={{ headerBackTitle: '' }} />
      <Stack.Screen
        name="marks/[subjectId]"
        options={{
          headerBackTitle: '',
          // This screen's title is a compound "Subject · Sequence" string, often long
          // enough to butt right up against the back chevron under the default
          // left-aligned Android title placement. Centering it (already the iOS
          // default) and trimming the font size keeps it clear of the arrow on both
          // platforms without truncating.
          headerTitleAlign: 'center',
          headerTitleStyle: { fontFamily: 'Blinker_600SemiBold', fontSize: 16, color: colors.text },
        }}
      />
      <Stack.Screen name="report-card/[id]" options={{ title: t('Report Card'), headerBackTitle: '' }} />
      <Stack.Screen name="class-master/[classLevel]" options={{ headerBackTitle: '' }} />
      <Stack.Screen name="admin/report-card/[id]" options={{ title: t('Report Card'), headerBackTitle: '' }} />
      <Stack.Screen name="admin/teachers/index" options={{ title: t('Teachers'), headerBackTitle: '' }} />
      <Stack.Screen name="admin/teachers/create" options={{ title: t('Add Teacher'), headerBackTitle: '' }} />
      <Stack.Screen name="admin/classes/index" options={{ title: classesTitle, headerBackTitle: '' }} />
      <Stack.Screen name="admin/subjects/index" options={{ title: subjectsTitle, headerBackTitle: '' }} />
      <Stack.Screen name="admin/terms/index" options={{ title: termsTitle, headerBackTitle: '' }} />
      <Stack.Screen name="admin/academic-year" options={{ title: t('Academic Year'), headerBackTitle: '' }} />
      <Stack.Screen name="admin/fees/index" options={{ title: t('School Fees'), headerBackTitle: '' }} />
      <Stack.Screen name="admin/grading/index" options={{ title: t('Grading Scale'), headerBackTitle: '' }} />
      <Stack.Screen name="admin/settings/index" options={{ title: t('Settings'), headerBackTitle: '' }} />
      <Stack.Screen name="admin/report-card-design" options={{ title: t('Card Design'), headerBackTitle: '' }} />
      <Stack.Screen name="admin/class-list-design" options={{ title: t('Class List Design'), headerBackTitle: '' }} />
    </Stack>
    </View>
    </SafeAreaProvider>
  )
}
