// app/admin/classes/index.tsx
import { useEffect, useState, useCallback } from 'react'
import { useFocusEffect } from 'expo-router'
import {
  View, Text, FlatList, TouchableOpacity, StyleSheet,
  ActivityIndicator, RefreshControl, Alert, Modal,
  TextInput, Switch,
} from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { getClasses, createClass, deleteClass, ClassLevel } from '@/lib/api/classes'
import { useTheme, Colors } from '@/lib/useTheme'
import { useT } from '@/lib/i18n'
import { formatXAF } from '@/lib/api/fees'

const makeStylesStyles = (colors: Colors) => StyleSheet.create(({
  container: { flex: 1, backgroundColor: colors.bgSecondary },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  list: { padding: 16, paddingBottom: 100 },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.card,
    borderRadius: 16,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: colors.border,
    gap: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 3,
    elevation: 1,
  },
  iconBox: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: '#FEE2E0',
    justifyContent: 'center',
    alignItems: 'center',
  },
  iconText: { fontSize: 20, fontWeight: '800', color: '#F03E2F' },
  info: { flex: 1 },
  className: { fontSize: 15, fontWeight: '700', color: colors.text },
  badgeRow: { flexDirection: 'row', gap: 6, marginTop: 4 },
  streamBadge: { backgroundColor: '#FEE2E0', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 20 },
  streamBadgeText: { fontSize: 11, fontWeight: '600', color: '#F03E2F' },
  orderBadge: { backgroundColor: colors.bgSecondary, paddingHorizontal: 8, paddingVertical: 2, borderRadius: 20 },
  orderBadgeText: { fontSize: 11, fontWeight: '500', color: colors.textSecondary },
  feeBadge: { backgroundColor: '#dcfce7', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 20 },
  feeBadgeText: { fontSize: 11, fontWeight: '600', color: '#16a34a' },
  deleteBtn: { padding: 8, backgroundColor: '#fee2e2', borderRadius: 10 },
  empty: { flex: 1, alignItems: 'center', paddingTop: 80, gap: 8 },
  emptyText: { fontSize: 16, fontWeight: '600', color: colors.textSecondary },
  emptySubText: { fontSize: 13, color: colors.textMuted },
  fab: {
    position: 'absolute',
    bottom: 28,
    right: 24,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#F03E2F',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#F03E2F',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.35,
    shadowRadius: 10,
    elevation: 8,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'flex-end',
  },
  modalSheet: {
    backgroundColor: colors.card,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 24,
    paddingBottom: 40,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  modalTitle: { fontSize: 17, fontWeight: '700', color: colors.text },
  label: { fontSize: 13, fontWeight: '600', color: colors.text, marginBottom: 6 },
  input: {
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 10,
    padding: 12,
    fontSize: 14,
    color: colors.text,
    marginBottom: 16,
  },
  switchRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  switchHint: { fontSize: 12, color: colors.textMuted, marginTop: 2 },
  createBtn: {
    backgroundColor: '#F03E2F',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
  },
  createBtnText: { color: '#fff', fontWeight: '700', fontSize: 15 },
  disabled: { opacity: 0.5 },
}))

export default function ClassesScreen() {
  const { colors, isDark } = useTheme()
  const styles = makeStylesStyles(colors)
  const t = useT()
  const [classes, setClasses] = useState<ClassLevel[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [modalVisible, setModalVisible] = useState(false)
  const [newName, setNewName] = useState('')
  const [hasStream, setHasStream] = useState(false)
  const [maxScore, setMaxScore] = useState('20')
  const [feeAmount, setFeeAmount] = useState('150000')
  const [creating, setCreating] = useState(false)

  const fetchClasses = useCallback(async () => {
    try {
      const data = await getClasses()
      setClasses(data.classLevels.sort((a, b) => a.order - b.order))
    } catch {
      Alert.alert(t('Error'), t('Failed to load classes.'))
    }
  }, [])

  useFocusEffect(useCallback(() => {
    fetchClasses().finally(() => setLoading(false))
  }, [fetchClasses]))

  const onRefresh = async () => {
    setRefreshing(true)
    await fetchClasses()
    setRefreshing(false)
  }

  const handleCreate = async () => {
    if (!newName.trim()) return
    if (feeAmount.trim() === '' || isNaN(Number(feeAmount)) || Number(feeAmount) < 0) {
      Alert.alert(t('Validation'), t('Enter the class fee (use 0 if there is none).'))
      return
    }
    setCreating(true)
    try {
      await createClass({ name: newName.trim(), hasStream, maxScore: Number(maxScore) || 20, feeAmount: Number(feeAmount) || 0 })
      setModalVisible(false)
      setNewName('')
      setHasStream(false)
      setMaxScore('20')
      setFeeAmount('150000')
      await fetchClasses()
    } catch (err: any) {
      Alert.alert(t('Error'), err?.response?.data?.message ?? t('Failed to create class.'))
    } finally {
      setCreating(false)
    }
  }

  const handleDelete = (cls: ClassLevel) => {
    Alert.alert(
      t('Delete Class'),
      `${t('Delete')} "${cls.name}"? ${t('This may affect students and report cards.')}`,
      [
        { text: t('Cancel'), style: 'cancel' },
        {
          text: t('Delete'),
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteClass(cls.id)
              setClasses((prev) => prev.filter((c) => c.id !== cls.id))
            } catch {
              Alert.alert(t('Error'), t('Failed to delete class.'))
            }
          },
        },
      ]
    )
  }

  return (
    <View style={styles.container}>
      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color="#F03E2F" />
        </View>
      ) : (
      <FlatList
        data={classes}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Ionicons name="school-outline" size={48} color="#d1d5db" />
            <Text style={styles.emptyText}>{t('No class levels yet')}</Text>
            <Text style={styles.emptySubText}>{t('Tap + to add a class')}</Text>
          </View>
        }
        renderItem={({ item }) => (
          <View style={styles.card}>
            <View style={styles.iconBox}>
              <Text style={styles.iconText}>{item.name.charAt(0).toUpperCase()}</Text>
            </View>
            <View style={styles.info}>
              <Text style={styles.className}>{item.name}</Text>
              <View style={styles.badgeRow}>
                {item.hasStream && (
                  <View style={styles.streamBadge}>
                    <Text style={styles.streamBadgeText}>{t('Has Stream')}</Text>
                  </View>
                )}
                <View style={styles.orderBadge}>
                  <Text style={styles.orderBadgeText}>{t('Order:')} {item.order}</Text>
                </View>
                {!!item.feeAmount && item.feeAmount > 0 && (
                  <View style={styles.feeBadge}>
                    <Text style={styles.feeBadgeText}>{formatXAF(item.feeAmount)}</Text>
                  </View>
                )}
              </View>
            </View>
            <TouchableOpacity style={styles.deleteBtn} onPress={() => handleDelete(item)}>
              <Ionicons name="trash-outline" size={18} color="#ef4444" />
            </TouchableOpacity>
          </View>
        )}
      />
      )}

      <TouchableOpacity
        style={styles.fab}
        onPress={() => setModalVisible(true)}
        activeOpacity={0.85}
      >
        <Ionicons name="add" size={28} color="#fff" />
      </TouchableOpacity>

      <Modal visible={modalVisible} transparent animationType="slide" onRequestClose={() => setModalVisible(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalSheet}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>{t('Add Class Level')}</Text>
              <TouchableOpacity onPress={() => setModalVisible(false)}>
                <Ionicons name="close" size={22} color="#6b7280" />
              </TouchableOpacity>
            </View>

            <Text style={styles.label}>{t('Class Name')}</Text>
            <TextInput
              style={styles.input}
              value={newName}
              onChangeText={setNewName}
              placeholder={t('e.g. Form 1, Grade 7')}
              placeholderTextColor="#9ca3af"
              autoFocus
            />

            <Text style={styles.label}>{t('Max Score per Subject')}</Text>
            <TextInput
              style={styles.input}
              value={maxScore}
              onChangeText={setMaxScore}
              placeholder="20"
              placeholderTextColor="#9ca3af"
              keyboardType="numeric"
            />

            <Text style={styles.label}>{t('School Fee (XAF)')} *</Text>
            <TextInput
              style={styles.input}
              value={feeAmount}
              onChangeText={setFeeAmount}
              placeholder="150000"
              placeholderTextColor="#9ca3af"
              keyboardType="numeric"
            />

            <View style={styles.switchRow}>
              <View>
                <Text style={styles.label}>{t('Has Stream')}</Text>
                <Text style={styles.switchHint}>{t('e.g. Form 3A, 3B, 3C')}</Text>
              </View>
              <Switch
                value={hasStream}
                onValueChange={setHasStream}
                trackColor={{ false: '#e5e7eb', true: '#93c5fd' }}
                thumbColor={hasStream ? '#F03E2F' : '#9ca3af'}
              />
            </View>

            <TouchableOpacity
              style={[styles.createBtn, (!newName.trim() || creating) && styles.disabled]}
              onPress={handleCreate}
              disabled={!newName.trim() || creating}
            >
              {creating
                ? <ActivityIndicator color="#fff" size="small" />
                : <Text style={styles.createBtnText}>{t('Create Class')}</Text>}
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  )
}
