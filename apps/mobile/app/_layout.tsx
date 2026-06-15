import { Stack } from 'expo-router'
import { useTheme } from '@/lib/useTheme'

export default function RootLayout() {
  const { colors } = useTheme()
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
      <Stack.Screen name="report-card/[id]" options={{ title: 'Report Card', headerBackTitle: '' }} />
      <Stack.Screen name="class-master/[classLevel]" options={{ headerBackTitle: '' }} />
      <Stack.Screen name="admin/report-card/[id]" options={{ title: 'Report Card', headerBackTitle: '' }} />
      <Stack.Screen name="admin/teachers/index" options={{ title: 'Teachers', headerBackTitle: '' }} />
      <Stack.Screen name="admin/teachers/create" options={{ title: 'Add Teacher', headerBackTitle: '' }} />
      <Stack.Screen name="admin/classes/index" options={{ title: 'Classes', headerBackTitle: '' }} />
      <Stack.Screen name="admin/subjects/index" options={{ title: 'Subjects', headerBackTitle: '' }} />
      <Stack.Screen name="admin/terms/index" options={{ title: 'Terms', headerBackTitle: '' }} />
      <Stack.Screen name="admin/grading/index" options={{ title: 'Grading Scale', headerBackTitle: '' }} />
      <Stack.Screen name="admin/settings/index" options={{ title: 'Settings', headerBackTitle: '' }} />
      <Stack.Screen name="admin/report-card-design" options={{ title: 'Card Design', headerBackTitle: '' }} />
      <Stack.Screen name="admin/class-list-design" options={{ title: 'Class List Design', headerBackTitle: '' }} />
    </Stack>
  )
}
