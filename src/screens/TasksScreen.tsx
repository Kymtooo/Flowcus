import React, { useMemo, useState } from 'react';
import { nanoid } from 'nanoid/non-secure';
import { Alert, FlatList, Modal, Pressable, SafeAreaView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useTasks } from '../context/TasksContext';
import { useI18n } from '../i18n';
import { useThemeTokens } from '../ThemeContext';
import { Routine } from '../types';
import dayjs from 'dayjs';

function uid() { return nanoid(10); }

const colors = ['#4f46e5', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6'];

export default function TasksScreen() {
  const { t } = useI18n();
  const { theme } = useThemeTokens();
  const { routines, setRoutines, addFromRoutine, projects, addProjectIfMissing } = useTasks();
  const [modal, setModal] = useState(false);
  const [title, setTitle] = useState('');
  const [planned, setPlanned] = useState('25');
  const [color, setColor] = useState(colors[0]);
  const [project, setProject] = useState('');
  const [plannedStartAt, setPlannedStartAt] = useState('');
  const [days, setDays] = useState<number[]>([]); // 0..6 (Sun..Sat)

  const addTask = async () => {
    if (!title.trim()) return;
    const time = plannedStartAt.trim();
    if (time && !/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) {
      Alert.alert('無効な時刻', '予定開始は HH:mm 形式で入力してください');
      return;
    }
    const t: Routine = { id: uid(), title: title.trim(), plannedMinutes: Number(planned) || 0, color, order: routines.length, project: project.trim() || undefined, plannedStartAt: time || undefined, days: days.length ? days : undefined };
    await setRoutines([...routines, t]);
    if (t.project) await addProjectIfMissing(t.project);
    setModal(false);
    setTitle('');
    setPlanned('25');
    setColor(colors[0]);
    setProject('');
    setPlannedStartAt('');
    setDays([]);
  };

  const remove = async (id: string) => {
    const next = routines.filter((t) => t.id !== id);
    await setRoutines(next);
  };

  const addToToday = async (id: string) => {
    await addFromRoutine(id);
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.bg }]}>
      <View style={styles.headerRow}>
        <Text style={[styles.header, { color: theme.text }]}>{t('Routines')}</Text>
      </View>
      <FlatList
        data={routines}
        keyExtractor={(t) => t.id}
        renderItem={({ item }) => (
          <View style={[styles.row, { borderLeftColor: item.color ?? '#4f46e5', backgroundColor: theme.card }] }>
            <View style={styles.info}>
              <Text style={[styles.title, { color: theme.text }]}>{item.title}</Text>
              <Text style={[styles.meta, { color: theme.subtext }]}>{t('Planned')} {item.plannedMinutes}m{item.plannedStartAt ? ` ・ ${item.plannedStartAt}` : ''}{item.project ? ` ・ [${item.project}]` : ''}{item.days ? ` ・ ${item.days.map(d => '日月火水木金土'[d]).join('')}` : ''}</Text>
            </View>
            <View style={styles.actions}>
              <TouchableOpacity onPress={() => addToToday(item.id)} style={[styles.btn, { backgroundColor: theme.primary }]}>
                <Text style={styles.btnText}>{t('Add')}</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => remove(item.id)} style={[styles.btn, { backgroundColor: theme.danger }]}>
                <Text style={styles.btnText}>{t('Delete')}</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}
        ListEmptyComponent={<Text style={[styles.empty, { color: theme.subtext }]}>{t('NoRoutines')}</Text>}
      />

      <TouchableOpacity style={[styles.fab, { backgroundColor: theme.primary }]} onPress={() => setModal(true)}>
        <Text style={styles.fabText}>＋</Text>
      </TouchableOpacity>

      <Modal visible={modal} animationType="slide" transparent>
        <View style={styles.modalBackdrop}>
          <View style={[styles.modalCard, { backgroundColor: theme.bg }]}>
            <Text style={[styles.modalTitle, { color: theme.text }]}>{t('NewRoutine')}</Text>
            <TextInput placeholder={t('Title')} placeholderTextColor={theme.subtext} value={title} onChangeText={setTitle} style={[styles.input, { borderColor: theme.border, color: theme.text }]} />
            <TextInput placeholder={t('PlannedMinutes')} placeholderTextColor={theme.subtext} value={planned} onChangeText={setPlanned} keyboardType="numeric" style={[styles.input, { borderColor: theme.border, color: theme.text }]} />
            <TextInput placeholder={t('PlannedStartOptional')} placeholderTextColor={theme.subtext} value={plannedStartAt} onChangeText={setPlannedStartAt} style={[styles.input, { borderColor: theme.border, color: theme.text }]} />
            <Text style={{ color: theme.subtext, marginTop: 4 }}>自動展開する曜日（任意）</Text>
            <View style={styles.chipsRow}>
              {(['日','月','火','水','木','金','土'] as const).map((label, idx) => (
                <TouchableOpacity key={idx} onPress={() => setDays(prev => prev.includes(idx) ? prev.filter(x=>x!==idx) : [...prev, idx])} style={[styles.chip, { backgroundColor: theme.chipBg }, days.includes(idx) && { backgroundColor: theme.chipOnBg }]}>
                  <Text style={{ color: theme.text }}>{label}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <TextInput placeholder={t('ProjectOptional')} placeholderTextColor={theme.subtext} value={project} onChangeText={setProject} style={[styles.input, { borderColor: theme.border, color: theme.text }]} />
            {!!projects.length && (
              <View style={styles.chipsRow}>
                {projects.map((p) => (
                  <TouchableOpacity key={p} onPress={() => setProject(p)} style={[styles.chip, { backgroundColor: theme.chipBg }, project === p && { backgroundColor: theme.chipOnBg }]}>
                    <Text style={{ color: theme.text }}>{p}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            )}
            <View style={styles.colorRow}>
              {colors.map((c) => (
                <Pressable key={c} onPress={() => setColor(c)} style={[styles.colorDot, { backgroundColor: c, borderWidth: color === c ? 3 : 1 }]} />
              ))}
            </View>
            <View style={styles.modalActions}>
              <TouchableOpacity onPress={() => setModal(false)} style={[styles.btn, { backgroundColor: theme.gray }]}>
                <Text style={styles.btnText}>{t('Cancel')}</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={addTask} style={[styles.btn, { backgroundColor: theme.primary }]}>
                <Text style={styles.btnText}>{t('Add')}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { fontSize: 24, fontWeight: '600', padding: 16 },
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    marginHorizontal: 12,
    marginVertical: 6,
    borderRadius: 12,
    borderLeftWidth: 6,
  },
  info: { flex: 1 },
  title: { fontSize: 16, fontWeight: '600' },
  meta: { marginTop: 4 },
  actions: { flexDirection: 'row' },
  btn: { paddingVertical: 8, paddingHorizontal: 12, borderRadius: 8, marginLeft: 8 },
  primary: { },
  danger: { },
  gray: { },
  templateOn: { backgroundColor: '#f59e0b' },
  btnText: { color: 'white', fontWeight: '600' },
  empty: { textAlign: 'center', marginTop: 32 },
  fab: { position: 'absolute', right: 20, bottom: 30, width: 56, height: 56, borderRadius: 28, alignItems: 'center', justifyContent: 'center', elevation: 4 },
  fabText: { color: 'white', fontSize: 28, lineHeight: 28 },
  modalBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.3)', justifyContent: 'center', padding: 16 },
  modalCard: { borderRadius: 12, padding: 16 },
  modalTitle: { fontSize: 18, fontWeight: '600', marginBottom: 12 },
  input: { borderWidth: 1, borderRadius: 8, padding: 10, marginVertical: 6 },
  colorRow: { flexDirection: 'row', marginVertical: 8 },
  colorDot: { width: 28, height: 28, borderRadius: 14, marginRight: 8, borderColor: '#111827' },
  modalActions: { flexDirection: 'row', justifyContent: 'flex-end', marginTop: 8 },
  chipsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginVertical: 6 },
  chip: { paddingVertical: 6, paddingHorizontal: 10, borderRadius: 16, marginRight: 6, marginTop: 6 },
  chipOn: { },
  chipText: { },
});
