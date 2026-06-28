import { Stack } from 'expo-router'
import { useTheme } from '@/lib/useTheme'
import { useT } from '@/lib/i18n'
import { useAuthStore } from '@/lib/store/auth.store'

export default function RootLayout() {
  const { colors } = useTheme()
  const t = useT()
  const { school } = useAuthStore()
  // Universities use different wording for the same screens — just a different header title.
  const isUniversity = school?.type === 'UNIVERSITY'
  const termsTitle = isUniversity ? t('Semesters') : t('Terms')
  const subjectsTitle = isUniversity ? t('Courses') : t('Subjects')
  const classesTitle = isUniversity ? t('Departments') : t('Classes')
  return (
    <Stack
      screenOptions={{
        animation: 'slide_from_right',
        animationDuration: 280,
        headerShadowVisible: false,
        headerBackButtonDisplayMode: 'minimal',
        contentStyle: { backgroundColor: colors.bgSecondary },
      }}
    >
      <Stack.Screen name="login" options={{ headerShown: false, animation: 'fade' }} />
      <Stack.Screen name="(tabs)" options={{ headerShown: false, animation: 'fade' }} />
      <Stack.Screen name="class/[classLevel]" options={{ headerBackTitle: '' }} />
      <Stack.Screen name="marks/[subjectId]" options={{ headerBackTitle: '' }} />
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
  )
}
