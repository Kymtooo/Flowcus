import React, { useEffect, useMemo, useState } from 'react';
import { SafeAreaView, ScrollView, StyleSheet, Text, View, TouchableOpacity, Modal } from 'react-native';
import dayjs from 'dayjs';
import { getDayTasks, getRuns, getProjectColors, saveProjectColors, getSections } from '../storage';
import { useThemeTokens } from '../ThemeContext';
import { useI18n } from '../i18n';
import { useTasks } from '../context/TasksContext';

export default function LifeLogScreen() {
  const { theme } = useThemeTokens();
  const { t } = useI18n();
  const [days, setDays] = useState<{ date: string; items: { title: string; start: number; end: number; project?: string; color?: string; flagged?: boolean }[]; planned: number; actual: number }[]>([]);
  const [rowWidth, setRowWidth] = useState(0);
  const rowH = 26;
  const [anchor, setAnchor] = useState(() => startOfWeek(dayjs()));
  const [projColors, setProjColors] = useState<Record<string, string>>({});
  const [popup, setPopup] = useState<{ date: string; title: string; start: number; end: number; project?: string }|null>(null);
  const [sections, setSectionsState] = useState<{ startMin: number }[]>([]);
  const { projects } = useTasks();
  const [highlightProject, setHighlightProject] = useState<string | null>(null);
  const [flagOnly, setFlagOnly] = useState(false);

  useEffect(() => {
    (async () => {
      const pc = await getProjectColors();
      setProjColors(pc);
      const arr: { date: string; items: { title: string; start: number; end: number; project?: string; color?: string; flagged?: boolean }[]; planned: number; actual: number }[] = [];
      const nextMap: Record<string,string> = { ...pc };
      const palette = ['#4f46e5','#10b981','#f59e0b','#ef4444','#8b5cf6','#06b6d4','#84cc16','#f97316'];
      const pickColor = (p: string) => {
        if (nextMap[p]) return nextMap[p];
        const idx = Object.keys(nextMap).length % palette.length;
        nextMap[p] = palette[idx];
        return nextMap[p];
      };
      for (let i = 0; i < 7; i++) {
        const d = dayjs(anchor).add(i, 'day');
        const dStr = d.format('YYYY-MM-DD');
        const [tasks, runs] = await Promise.all([getDayTasks(dStr), getRuns(dStr)]);
        const map: Record<string, { title: string; project?: string; color?: string; flagged?: boolean }> = {};
        for (const tsk of tasks) {
          const pj = tsk.project;
          const c = pj ? pickColor(pj) : (tsk.color || palette[0]);
          map[tsk.id] = { title: tsk.title, project: pj, color: c, flagged: tsk.flagged };
        }
        const items = runs.map(r => ({ title: map[r.taskId]?.title ?? 'Unknown', start: r.startAt, end: r.endAt, project: map[r.taskId]?.project, color: map[r.taskId]?.color, flagged: map[r.taskId]?.flagged }));
        items.sort((a,b)=>a.start-b.start);
        const planned = tasks.reduce((a, t)=>a+(t.plannedMinutes||0),0);
        const actual = runs.reduce((a, r)=>a+Math.max(0, Math.round((r.endAt-r.startAt)/60000)), 0);
        arr.push({ date: dStr, items, planned, actual });
      }
      setDays(arr);
      if (JSON.stringify(pc) !== JSON.stringify(nextMap)) {
        setProjColors(nextMap);
        await saveProjectColors(nextMap);
      }
    })();
  }, [anchor]);

  // セクション読み込み（縦グリッド用）
  useEffect(() => {
    (async () => {
      const ss = await getSections();
      const xs = ss.map(s => ({ startMin: toMinHHMM(s.startAt) })).filter(x => x.startMin != null) as { startMin: number }[];
      setSectionsState(xs);
    })();
  }, []);

  const fmt = (n: number) => dayjs(n).format('HH:mm');
  const pxPerMin = useMemo(() => (rowWidth > 0 ? rowWidth / 1440 : 0), [rowWidth]);
  const toMin = (n: number) => dayjs(n).hour() * 60 + dayjs(n).minute();
  const toMinHHMM = (hhmm?: string) => {
    if (!hhmm) return 0; const [h,m] = hhmm.split(':').map(v=>parseInt(v,10)); return h*60+m;
  };
  const tickMins = [0, 360, 720, 1080, 1440];
  const colorFor = (c?: string, pj?: string) => pj ? (projColors[pj] || c || '#4f46e5') : (c || '#4f46e5');
  function startOfWeek(d: dayjs.Dayjs) { const wd = (d.day()+6)%7; return d.startOf('day').subtract(wd,'day'); }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.bg }]}>
      <ScrollView contentContainerStyle={{ paddingBottom: 24 }}>
        {/* 週切替 */}
        <View style={{ flexDirection:'row', alignItems:'center', justifyContent:'space-between', paddingHorizontal: 16, paddingTop: 10 }}>
          <TouchableOpacity onPress={() => setAnchor(startOfWeek(dayjs(anchor).subtract(7,'day')))}>
            <Text style={{ color: theme.text }}>←</Text>
          </TouchableOpacity>
          <Text style={{ color: theme.subtext }}>
            {dayjs(anchor).format('YYYY/MM/DD')} - {dayjs(anchor).add(6,'day').format('MM/DD')}
          </Text>
          <TouchableOpacity disabled={startOfWeek(dayjs()).isSame(anchor,'day')} onPress={() => setAnchor(startOfWeek(dayjs(anchor).add(7,'day')))}>
            <Text style={{ color: startOfWeek(dayjs()).isSame(anchor,'day') ? theme.border : theme.text }}>→</Text>
          </TouchableOpacity>
        </View>
        {days.map(({ date, items, planned, actual }) => (
          <View key={date} style={{ paddingHorizontal: 16, paddingTop: 14 }}>
            <Text style={[styles.date, { color: theme.text }]}>{dayjs(date).format('YYYY/MM/DD (ddd)')}</Text>
            <Text style={[styles.sub, { color: theme.subtext }]}>{t('Actual')} {actual}m ・ {t('Planned')} {planned}m</Text>
            <View style={{ marginTop: 8 }} onLayout={(e)=>setRowWidth(e.nativeEvent.layout.width)}>
              {/* タイムライン（0-24h） */}
              <View style={{ height: rowH, borderRadius: 8, backgroundColor: theme.card, position: 'relative', overflow: 'hidden' }}>
                {/* 時刻目盛 */}
                {pxPerMin>0 && tickMins.map((m,i)=> (
                  <View key={i} style={{ position:'absolute', left: m*pxPerMin-0.5, top: 0, bottom: 0, width: 1, backgroundColor: theme.border }} />
                ))}
                {/* セクション縦線 */}
                {pxPerMin>0 && sections.map((s, i) => (
                  <View key={`sec-${i}`} style={{ position:'absolute', left: s.startMin*pxPerMin-0.5, top: 0, bottom: 0, width: 1, backgroundColor: theme.border, opacity: 0.5 }} />
                ))}
                {/* 現在時刻ライン（当日） */}
                {pxPerMin>0 && dayjs(date).isSame(dayjs(), 'day') ? (
                  <View style={{ position:'absolute', left: (dayjs().hour()*60+dayjs().minute())*pxPerMin-0.5, top: 0, bottom: 0, width: 2, backgroundColor: theme.primary, opacity: 0.9 }} />
                ) : null}
                {/* ブロック */}
                {pxPerMin>0 && items.map((it, idx) => {
                  const s = toMin(it.start); const e = toMin(it.end); const w = Math.max(1, (e - s) * pxPerMin);
                  const l = s * pxPerMin;
                  const bg = colorFor(it.color, it.project);
                  const dim = (highlightProject && it.project !== highlightProject) || (flagOnly && !it.flagged);
                  return (
                    <TouchableOpacity key={idx} activeOpacity={0.75} onPress={() => setPopup({ date, title: it.title, start: it.start, end: it.end, project: it.project })} style={{ position:'absolute', left: l, top: 2, height: rowH-4, width: w, backgroundColor: bg, borderRadius: 6, justifyContent:'center', paddingHorizontal: 4, opacity: dim ? 0.35 : 1 }}>
                      {w > 56 ? <Text style={{ color: 'white', fontSize: 11, fontWeight: '700' }} numberOfLines={1}>{it.title}{w>120 && it.project ? ` [${it.project}]` : ''}</Text> : null}
                    </TouchableOpacity>
                  );
                })}
              </View>
              {/* ラベル行（オプション） */}
              <View style={{ flexDirection:'row', justifyContent:'space-between' }}>
                <Text style={{ color: theme.subtext, fontSize: 10 }}>00:00</Text>
                <Text style={{ color: theme.subtext, fontSize: 10 }}>06:00</Text>
                <Text style={{ color: theme.subtext, fontSize: 10 }}>12:00</Text>
                <Text style={{ color: theme.subtext, fontSize: 10 }}>18:00</Text>
                <Text style={{ color: theme.subtext, fontSize: 10 }}>24:00</Text>
              </View>
            </View>
          </View>
        ))}
        {/* ハイライト・フィルタ */}
        <View style={{ paddingHorizontal: 16, paddingTop: 8, flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          <TouchableOpacity onPress={() => setHighlightProject(null)} style={{ paddingVertical: 6, paddingHorizontal: 10, borderRadius: 16, backgroundColor: !highlightProject ? theme.chipOnBg : theme.chipBg }}>
            <Text style={{ color: theme.text }}>{t('All')}</Text>
          </TouchableOpacity>
          {projects.map(p => (
            <TouchableOpacity key={p} onPress={() => setHighlightProject(p)} style={{ paddingVertical: 6, paddingHorizontal: 10, borderRadius: 16, backgroundColor: highlightProject===p ? theme.chipOnBg : theme.chipBg }}>
              <Text style={{ color: theme.text }}>{p}</Text>
            </TouchableOpacity>
          ))}
          <TouchableOpacity onPress={() => setFlagOnly(!flagOnly)} style={{ paddingVertical: 6, paddingHorizontal: 10, borderRadius: 16, backgroundColor: flagOnly ? theme.chipOnBg : theme.chipBg }}>
            <Text style={{ color: theme.text }}>⚑</Text>
          </TouchableOpacity>
        </View>
        <Modal visible={!!popup} animationType="fade" transparent>
          <View style={{ flex:1, backgroundColor:'rgba(0,0,0,0.3)', justifyContent:'center', padding: 16 }}>
            <View style={{ backgroundColor: theme.bg, borderRadius: 12, padding: 16 }}>
              <Text style={{ color: theme.text, fontSize: 16, fontWeight: '700' }}>{popup?.title}</Text>
              {popup ? (
                <>
                  <Text style={{ color: theme.subtext, marginTop: 4 }}>{dayjs(popup.start).format('YYYY/MM/DD HH:mm')} - {dayjs(popup.end).format('HH:mm')}（{Math.max(0, Math.round((popup.end - popup.start)/60000))}m）</Text>
                  {popup.project ? <Text style={{ color: theme.subtext, marginTop: 2 }}>[{popup.project}]</Text> : null}
                </>
              ) : null}
              <View style={{ flexDirection:'row', justifyContent:'flex-end', marginTop: 10 }}>
                <TouchableOpacity onPress={() => setPopup(null)} style={{ backgroundColor: theme.gray, paddingVertical: 8, paddingHorizontal: 12, borderRadius: 8 }}>
                  <Text style={{ color: 'white', fontWeight:'700' }}>閉じる</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  date: { fontSize: 18, fontWeight: '700' },
  sub: { marginTop: 2 },
  row: { padding: 8, borderRadius: 8, marginTop: 6 },
  time: { fontSize: 12 },
  title: { fontSize: 16, fontWeight: '600' },
  project: { fontSize: 12, marginTop: 2 },
});
