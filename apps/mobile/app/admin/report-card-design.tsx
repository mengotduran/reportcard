// app/admin/report-card-design.tsx
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native'
import { useRouter } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import { useTheme, Colors } from '@/lib/useTheme'

const makeStylesStyles = (colors: Colors) => StyleSheet.create(({
  container: { flex: 1, backgroundColor: colors.bgSecondary },
  backBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    margin: 16,
    alignSelf: 'flex-start',
    paddingVertical: 8,
    paddingHorizontal: 14,
    backgroundColor: '#FEF2F1',
    borderRadius: 10,
  },
  backText: { fontSize: 14, fontWeight: '600', color: '#F03E2F' },
  body: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 32,
    marginTop: -60,
  },
  iconWrap: {
    width: 120,
    height: 120,
    borderRadius: 30,
    backgroundColor: '#FEF2F1',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 28,
  },
  title: {
    fontSize: 24,
    fontWeight: '800',
    color: colors.text,
    textAlign: 'center',
    marginBottom: 14,
  },
  description: {
    fontSize: 15,
    color: colors.textSecondary,
    textAlign: 'center',
    lineHeight: 24,
    marginBottom: 24,
  },
  hint: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: colors.bgSecondary,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 10,
  },
  hintText: { fontSize: 13, color: colors.textSecondary },
}))

export default function ReportCardDesignScreen() {
  const { colors, isDark } = useTheme()
  const styles = makeStylesStyles(colors)
  const router = useRouter()

  return (
    <View style={styles.container}>
      <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
        <Ionicons name="arrow-back" size={18} color="#F03E2F" />
        <Text style={styles.backText}>Back</Text>
      </TouchableOpacity>

      <View style={styles.body}>
        <View style={styles.iconWrap}>
          <Ionicons name="laptop-outline" size={64} color="#F03E2F" />
        </View>
        <Text style={styles.title}>Better on Desktop</Text>
        <Text style={styles.description}>
          Report card design and layout customization is only available on the web app. Visit the web dashboard on your computer for a better experience with templates, columns, logos, and print settings.
        </Text>
        <View style={styles.hint}>
          <Ionicons name="information-circle-outline" size={16} color="#6b7280" />
          <Text style={styles.hintText}>Access the web app at your school's subdomain</Text>
        </View>
      </View>
    </View>
  )
}
