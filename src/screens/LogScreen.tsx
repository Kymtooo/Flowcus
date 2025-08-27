import React, { useEffect, useMemo, useState } from 'react';
import { SafeAreaView, StyleSheet, Text, View, FlatList, TouchableOpacity, Alert } from 'react-native';
import { useTasks } from '../context/TasksContext';
import { getRuns, getDayTasks, saveRuns, getDayAgg } from '../storage';
import dayjs from 'dayjs';
import { useI18n } from '../i18n';
import { useThemeTokens } from '../ThemeContext';

export default function LogScreen() {
  const { t } = useI18n();
  const { theme } = useThemeTokens();
  const { runs, dayTasks, refresh, projects } = useTasks();
  const [filterProject, setFilterProject] = useState<string | null>(null);
  const [mode, setMode] = useState<'day'|'week'|'month'>('day');
  const [agg, setAgg] = useState<{ project: string; planned: number; actual: number }[]>([]);
  // 日付切替（Today/Log）: Logの日モードに導入
  const [selectedDate, setSelectedDate] = useState<string>(dayjs().format('YYYY-MM-DD'));
  const [dayRuns, setDayRuns] = useState(runs);
  const [dayTasksSel, setDayTasksSel] = useState(dayTasks);

  useEffect(() => {
    refresh();
  }, []);

  // 指定日のデータ読み込み
  useEffect(() => {
    (async () => {
      const [dt, rs] = await Promise.all([getDayTasks(selectedDate), getRuns(selectedDate)]);
      setDayTasksSel(dt);
      setDayRuns(rs);
    })();
  }, [selectedDate]);

  const taskMap = useMemo(() => Object.fromEntries(dayTasksSel.map((t) => [t.id, t])), [dayTasksSel]);
  const filteredRuns = useMemo(() => dayRuns.filter((r) => (filterProject ? taskMap[r.taskId]?.project === filterProject : true)), [dayRuns, taskMap, filterProject]);
  // 深夜跨ぎは表示は分割しないが集計は按分（選択日内の重なりのみ集計）
  const totalActual = useMemo(() => {
    const dayStart = dayjs(selectedDate).startOf('day').valueOf();
    const dayEnd = dayjs(selectedDate).endOf('day').valueOf();
    const overlap = (a: number, b: number) => Math.max(0, Math.min(b, dayEnd) - Math.max(a, dayStart));
    return filteredRuns.reduce((acc, r) => acc + Math.round(overlap(r.startAt, r.endAt) / 60000), 0);
  }, [filteredRuns, selectedDate]);
  const totalPlanned = useMemo(() => dayTasksSel.filter((t) => (filterProject ? t.project === filterProject : true)).reduce((a, t) => a + (t.plannedMinutes || 0), 0), [dayTasksSel, filterProject]);

  useEffect(() => {
    if (mode === 'day') return;
    (async () => {
      const days = mode === 'week' ? 7 : 30;
      const dateStrs = Array.from({ length: days }, (_, i) => dayjs().subtract(i, 'day').format('YYYY-MM-DD'));
      const maps = await Promise.all(dateStrs.map((d) => getDayAgg(d)));
      const projMap: Record<string, { planned: number; actual: number } > = {};
      for (const m of maps) {
        for (const [project, v] of Object.entries(m)) {
          if (!projMap[project]) projMap[project] = { planned: 0, actual: 0 };
          projMap[project].planned += v.planned;
          projMap[project].actual += v.actual;
        }
      }
      const rows = Object.entries(projMap).map(([project, v]) => ({ project, planned: v.planned, actual: v.actual }));
      rows.sort((a, b) => b.actual - a.actual);
      setAgg(rows);
    })();
  }, [mode]);

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.bg }]}>
      <Text style={[styles.header, { color: theme.text }]}>{t('Log')}</Text>
      <View style={styles.modeRow}>
        {(['day','week','month'] as const).map(m => (
          <TouchableOpacity key={m} onPress={() => setMode(m)} style={[styles.modeBtn, { backgroundColor: theme.chipBg }, mode===m && { backgroundColor: theme.chipOnBg }]}>
            <Text style={[styles.modeText, { color: theme.text }]}>{m==='day'?t('Day'):m==='week'?t('Week'):t('Month')}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {!!projects.length && mode==='day' && (
        <View style={styles.chipsRow}>
          <TouchableOpacity onPress={() => setFilterProject(null)} style={[styles.chip, { backgroundColor: theme.chipBg }, !filterProject && { backgroundColor: theme.chipOnBg }]}>
            <Text style={[styles.chipText, { color: theme.text }]}>{t('All')}</Text>
          </TouchableOpacity>
          {projects.map((p) => (
            <TouchableOpacity key={p} onPress={() => setFilterProject(p)} style={[styles.chip, { backgroundColor: theme.chipBg }, filterProject === p && { backgroundColor: theme.chipOnBg }]}>
              <Text style={[styles.chipText, { color: theme.text }]}>{p}</Text>
            </TouchableOpacity>
          ))}
        </View>
      )}
      {mode==='day' ? (
        <>
          <View style={[styles.modeRow, { marginTop: 0 }]}>
            <TouchableOpacity onPress={() => setSelectedDate(dayjs(selectedDate).subtract(1,'day').format('YYYY-MM-DD'))} style={styles.modeBtn}><Text style={styles.modeText}>←</Text></TouchableOpacity>
            <Text style={[styles.sub, { marginTop: 0, color: theme.subtext }]}>{dayjs(selectedDate).format('YYYY/MM/DD')}</Text>
            <TouchableOpacity disabled={dayjs(selectedDate).isSame(dayjs(), 'day')} onPress={() => setSelectedDate(dayjs(selectedDate).add(1,'day').format('YYYY-MM-DD'))} style={[styles.modeBtn, dayjs(selectedDate).isSame(dayjs(), 'day') && { opacity: 0.4 }]}><Text style={styles.modeText}>→</Text></TouchableOpacity>
            {!dayjs(selectedDate).isSame(dayjs(), 'day') && (
              <TouchableOpacity onPress={() => setSelectedDate(dayjs().format('YYYY-MM-DD'))} style={[styles.modeBtn, { backgroundColor: theme.chipBg }]}><Text style={[styles.modeText, { color: theme.text }]}>{t('TodayShort')}</Text></TouchableOpacity>
            )}
          </View>
          <Text style={[styles.sub, { color: theme.subtext }]}>{t('Total')} {t('Actual')} {totalActual}m ・ {t('Planned')} {totalPlanned}m{filterProject ? ` ・ [${filterProject}]` : ''}</Text>
          <FlatList
            data={[...filteredRuns].reverse()}
            keyExtractor={(r) => r.id}
            renderItem={({ item }) => {
              const mins = Math.max(0, Math.round((item.endAt - item.startAt) / 60000));
              return (
                <View style={[styles.row, { backgroundColor: theme.card }]}>
                  <Text style={[styles.title, { color: theme.text }]}>{taskMap[item.taskId]?.title ?? 'Unknown'}</Text>
                  <Text style={[styles.meta, { color: theme.subtext }]}>
                    {dayjs(item.startAt).format('HH:mm')} - {dayjs(item.endAt).format('HH:mm')}（{mins}m）
                  </Text>
                  {taskMap[item.taskId]?.project ? (
                    <Text style={[styles.meta, { color: theme.subtext }]}>[{taskMap[item.taskId]?.project}]</Text>
                  ) : null}
                  <View style={{ flexDirection: 'row', justifyContent: 'flex-end' }}>
                    <TouchableOpacity onPress={async () => {
                      Alert.alert('削除の確認', 'このRunを削除しますか？', [
                        { text: 'キャンセル', style: 'cancel' },
                        { text: '削除', style: 'destructive', onPress: async () => { const rs = await getRuns(selectedDate); await saveRuns(rs.filter(r => r.id !== item.id), selectedDate); const next = await getRuns(selectedDate); setDayRuns(next); await refresh(); } },
                      ]);
                    }} style={[styles.btn, { backgroundColor: theme.danger, paddingVertical: 4, paddingHorizontal: 8, borderRadius: 6, alignSelf: 'flex-end', marginTop: 6 }]}>
                      <Text style={styles.btnText}>{t('Delete')}</Text>
                    </TouchableOpacity>
                  </View>
                  {item.notes ? <Text style={[styles.notes, { color: theme.subtext }]}>{item.notes}</Text> : null}
                </View>
              );
            }}
            ListEmptyComponent={<Text style={[styles.empty, { color: theme.subtext }]}>{t('NoLogs')}</Text>}
          />
        </>
      ) : (
        <>
          <Text style={[styles.sub, { color: theme.subtext }]}>{mode==='week' ? t('Last7Days') : t('Last30Days')} ・ {t('ByProjectAggregation')}</Text>
          <FlatList
            data={agg}
            keyExtractor={(r) => r.project}
            renderItem={({ item }) => {
              const diff = item.actual - item.planned;
              const diffText = diff === 0 ? '±0m' : `${diff>0?'+':''}${diff}m`;
              return (
                <View style={[styles.row, { backgroundColor: theme.card }]}>
                  <Text style={[styles.title, { color: theme.text }]}>{item.project}</Text>
                  <Text style={[styles.meta, { color: theme.subtext }]}>{t('Actual')} {item.actual}m ・ {t('Planned')} {item.planned}m ・ 差分 {diffText}</Text>
                </View>
              );
            }}
            ListEmptyComponent={<Text style={[styles.empty, { color: theme.subtext }]}>{t('NoLogs')}</Text>}
          />
        </>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { fontSize: 24, fontWeight: '600', padding: 16 },
  sub: { paddingHorizontal: 16, marginTop: -8 },
  modeRow: { flexDirection: 'row', paddingHorizontal: 16, marginTop: -6, marginBottom: 6 },
  modeBtn: { paddingVertical: 6, paddingHorizontal: 10, borderRadius: 16, marginRight: 8 },
  modeOn: { },
  modeText: { },
  chipsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginHorizontal: 16, marginTop: -6, marginBottom: 6 },
  chip: { paddingVertical: 6, paddingHorizontal: 10, borderRadius: 16, marginRight: 6, marginTop: 6 },
  chipOn: { },
  chipText: { },
  row: { padding: 12, marginHorizontal: 12, marginVertical: 6, borderRadius: 12 },
  title: { fontSize: 16, fontWeight: '600' },
  meta: { marginTop: 4 },
  notes: { marginTop: 4 },
  empty: { textAlign: 'center', marginTop: 32 },
  btn: { },
  danger: { },
});
