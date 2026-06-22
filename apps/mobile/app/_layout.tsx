import { Stack } from 'expo-router'
import { useTheme } from '@/lib/useTheme'
import { useT } from '@/lib/i18n'

export default function RootLayout() {
  const { colors } = useTheme()
  const t = useT()
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
      <Stack.Screen name="admin/classes/index" options={{ title: t('Classes'), headerBackTitle: '' }} />
      <Stack.Screen name="admin/subjects/index" options={{ title: t('Subjects'), headerBackTitle: '' }} />
      <Stack.Screen name="admin/terms/index" options={{ title: t('Terms'), headerBackTitle: '' }} />
      <Stack.Screen name="admin/fees/index" options={{ title: t('School Fees'), headerBackTitle: '' }} />
      <Stack.Screen name="admin/grading/index" options={{ title: t('Grading Scale'), headerBackTitle: '' }} />
      <Stack.Screen name="admin/settings/index" options={{ title: t('Settings'), headerBackTitle: '' }} />
      <Stack.Screen name="admin/report-card-design" options={{ title: t('Card Design'), headerBackTitle: '' }} />
      <Stack.Screen name="admin/class-list-design" options={{ title: t('Class List Design'), headerBackTitle: '' }} />
    </Stack>
  )
}
