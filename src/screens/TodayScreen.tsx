import React, { useEffect, useMemo, useState } from 'react';
import { SectionList, Modal, SafeAreaView, StyleSheet, Text, TextInput, TouchableOpacity, View, Linking, Alert } from 'react-native';
import { Swipeable } from 'react-native-gesture-handler';
import DraggableFlatList, { RenderItemParams } from 'react-native-draggable-flatlist';
import dayjs from 'dayjs';
import { nanoid } from 'nanoid/non-secure';
import { useTasks } from '../context/TasksContext';
import { DayTask } from '../types';
import { useThemeTokens } from '../ThemeContext';
import { useI18n } from '../i18n';

const toHM = (mins: number) => `${Math.floor(mins)}m`;

const hm = (ms: number) => {
  const totalSec = Math.max(0, Math.floor(ms / 1000));
  const mm = Math.floor(totalSec / 60)
    .toString()
    .padStart(2, '0');
  const ss = (totalSec % 60).toString().padStart(2, '0');
  return `${mm}:${ss}`;
};

export default function TodayScreen() {
  const { theme } = useThemeTokens();
  const { t: tr } = useI18n();
  const { dayTasks, pipeline, setPipeline, startTask, stopTask, currentTaskId, currentStartAt, actualMinutesByTask, refresh, doneIds, toggleDone, skipCurrent, addAdhocTask, sections, setSections, projects, runs, pausedStack, resumeLastPaused, startBreak, deleteAction, updateAction } = useTasks();
  const [now, setNow] = useState(Date.now());
  const [stopModal, setStopModal] = useState(false);
  const [notes, setNotes] = useState('');
  const [addModal, setAddModal] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newPlanned, setNewPlanned] = useState('25');
  const colors = ['#4f46e5', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6'];
  const [newColor, setNewColor] = useState(colors[0]);
  const [newProject, setNewProject] = useState('');
  const [newTime, setNewTime] = useState(''); // HH:mm
  const [newSectionId, setNewSectionId] = useState<string | undefined>(undefined);
  const [sectionModal, setSectionModal] = useState(false);
  const [secName, setSecName] = useState('');
  const [secStart, setSecStart] = useState('06:00');
  const [secEnd, setSecEnd] = useState('23:59');
  const [detailTaskId, setDetailTaskId] = useState<string | null>(null);
  const [detailNotes, setDetailNotes] = useState('');
  const [resumeModal, setResumeModal] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [editTitle, setEditTitle] = useState('');
  const [editExpected, setEditExpected] = useState('');
  const [editProject, setEditProject] = useState('');
  const [editScheduled, setEditScheduled] = useState('');
  const [editSectionId, setEditSectionId] = useState<string | undefined>(undefined);
  const [editUrl, setEditUrl] = useState('');
  const [editFlagged, setEditFlagged] = useState(false);
  // 手動の開始/終了は仕様から除外
  const [filterProject, setFilterProject] = useState<string | null>(null);
  const [filterFlagged, setFilterFlagged] = useState(false);
  const [reorderOpen, setReorderOpen] = useState(false);
  const [quick, setQuick] = useState('');
  const [dense, setDense] = useState(false);

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    refresh();
  }, []);

  const taskMap = useMemo(() => Object.fromEntries(dayTasks.map((t) => [t.id, t])), [dayTasks]);
  const indexMap = useMemo(() => Object.fromEntries(pipeline.map((id, i) => [id, i])), [pipeline]);
  const pipelineTasks: DayTask[] = pipeline.map((id) => taskMap[id]).filter(Boolean);
  const pipelineTasksFiltered = useMemo(() => {
    let arr = pipelineTasks;
    if (filterProject) arr = arr.filter(t => t.project === filterProject);
    if (filterFlagged) arr = arr.filter(t => !!t.flagged);
    return arr;
  }, [pipelineTasks, filterProject, filterFlagged]);
  const currentTask = currentTaskId ? taskMap[currentTaskId] : null;
  const nextTasks = currentTask ? pipelineTasksFiltered.filter((t) => t.id !== currentTask.id) : pipelineTasksFiltered;

  const sectionsSorted = useMemo(() => {
    const copy = [...sections].sort((a, b) => a.order - b.order || a.startAt.localeCompare(b.startAt));
    return copy;
  }, [sections]);

  const toMin = (hhmm?: string | null) => (hhmm ? parseInt(hhmm.slice(0,2))*60 + parseInt(hhmm.slice(3,5)) : null);
  const nowMin = useMemo(() => parseInt(dayjs(now).format('HH'))*60 + parseInt(dayjs(now).format('mm')), [now]);

  const findSectionFor = (min: number): string | undefined => {
    for (const s of sections) {
      const sm = toMin(s.startAt)!;
      const em = toMin(s.endAt ?? '23:59')!;
      const contains = sm <= em ? (min >= sm && min < em) : (min >= sm || min < em);
      if (contains) return s.id;
    }
    return undefined;
  };

  // 期待スケジュール（押し出し統一）＋実績上書き
  const expectedMap = useMemo(() => {
    const map: Record<string, { startExp: number; endExp: number; startShow: number; endShow: number }> = {};
    let prevEnd = 0; // 分
    const items = nextTasks;
    for (const t of items) {
      const startExp = Math.max(prevEnd, toMin(t.scheduledAt) ?? prevEnd);
      const endExp = startExp + (t.plannedMinutes || 0);
      // 実績（最初/最後）
      const taskRuns = runs.filter(r => r.taskId === t.id).sort((a,b)=>a.startAt-b.startAt);
      const first = taskRuns[0];
      const last = taskRuns[taskRuns.length-1];
      const startAct = first ? (dayjs(first.startAt).hour()*60 + dayjs(first.startAt).minute()) : null;
      const endAct = last && last.endAt ? (dayjs(last.endAt).hour()*60 + dayjs(last.endAt).minute()) : (currentTaskId === t.id ? nowMin : null);
      const startShow = startAct ?? startExp;
      const endShow = endAct ?? endExp;
      map[t.id] = { startExp, endExp, startShow, endShow };
      prevEnd = Math.max(endExp, endShow);
    }
    return map;
  }, [nextTasks, runs, currentTaskId, nowMin]);

  // タイムライン行（Run + 期待ブロック）
  type Row = { kind: 'run' | 'expected'; key: string; task: DayTask; startMin: number; endMin: number; duration: number; sectionId?: string; isCurrent?: boolean };
  const timelineRows: Row[] = useMemo(() => {
    const rows: Row[] = [];
    // Run rows (時系列)
    const rs = [...runs].sort((a,b)=>a.startAt-b.startAt);
    for (const r of rs) {
      const t = taskMap[r.taskId];
      if (!t) continue;
      const sMin = dayjs(r.startAt).hour()*60 + dayjs(r.startAt).minute();
      const eMin = r.endAt ? (dayjs(r.endAt).hour()*60 + dayjs(r.endAt).minute()) : nowMin;
      const dur = Math.max(0, Math.round(((r.endAt ?? now) - r.startAt)/60000));
      rows.push({ kind: 'run', key: `run:${r.id}`, task: t, startMin: sMin, endMin: eMin, duration: dur, sectionId: findSectionFor(sMin), isCurrent: !r.endAt && currentTaskId === r.taskId });
    }
    // Expected rows (未開始タスクのみ)
    let chain = 0;
    if (rows.length) chain = rows[rows.length-1].endMin;
    const hasRun = new Set(rs.map(r=>r.taskId));
    const remain = pipeline.filter(id => {
      const t = taskMap[id];
      if (!t) return false;
      if (doneIds.includes(id)) return false;
      if (currentTaskId === id) return false;
      if (hasRun.has(id)) return false; // 既に実行済み（部分含む）は今回は期待行を出さない
      return true;
    });
    for (const id of remain) {
      const t = taskMap[id]!;
      const startExp = Math.max(chain, toMin(t.scheduledAt) ?? chain);
      const endExp = startExp + (t.plannedMinutes || 0);
      rows.push({ kind: 'expected', key: `exp:${id}:${startExp}`, task: t, startMin: startExp, endMin: endExp, duration: t.plannedMinutes || 0, sectionId: findSectionFor(startExp) });
      chain = endExp;
    }
    // セクション→時刻で並び直し
    rows.sort((a,b)=>{
      const ai = sectionsSorted.findIndex(s=>s.id===a.sectionId);
      const bi = sectionsSorted.findIndex(s=>s.id===b.sectionId);
      const ao = ai === -1 ? 1e9 : ai; const bo = bi === -1 ? 1e9 : bi;
      if (ao !== bo) return ao - bo;
      return a.startMin - b.startMin;
    });
    return rows;
  }, [runs, pipeline, taskMap, sectionsSorted, nowMin, currentTaskId, doneIds]);

  const moveById = (id: string, delta: number) => {
    const idx = pipeline.indexOf(id);
    if (idx === -1) return;
    const ni = idx + delta;
    if (ni < 0 || ni >= pipeline.length) return;
    const next = [...pipeline];
    const [x] = next.splice(idx, 1);
    next.splice(ni, 0, x);
    setPipeline(next);
  };

  const moveToIndex = (id: string, newIndex: number) => {
    const from = pipeline.indexOf(id);
    if (from === -1) return;
    const to = Math.max(0, Math.min(pipeline.length - 1, newIndex));
    if (from === to) return;
    const next = [...pipeline];
    const [x] = next.splice(from, 1);
    next.splice(to, 0, x);
    setPipeline(next);
  };

  const openDetail = (id: string) => {
    setDetailTaskId(id);
  };
  const detailTask = useMemo(() => (detailTaskId ? dayTasks.find(d => d.id === detailTaskId) || null : null), [detailTaskId, dayTasks]);

  const ListHeader = () => (
    <View>
      <Text style={[styles.header, { color: theme.text }]}>{tr('Today')}</Text>
      {/* クイック追加 */}
      <View style={{ paddingHorizontal: 16, paddingBottom: 8 }}>
        <TextInput
          placeholder="タスク名 25m @Project 09:30 #flag url:https://..."
          placeholderTextColor={theme.subtext}
          value={quick}
          onChangeText={setQuick}
          onSubmitEditing={async () => {
            const parsed = (function(input: string){
              let title = input.trim();
              let minutes = 25; let project: string|undefined; let time: string|undefined; let flagged=false; let url: string|undefined;
              const mMin = title.match(/\b(\d{1,3})m\b/i); if (mMin) { minutes = Math.max(1, parseInt(mMin[1],10)); title = title.replace(mMin[0],'').trim(); }
              const mTime = title.match(/\b([01]?\d|2[0-3]):[0-5]\d\b/); if (mTime) { time = mTime[1].padStart(5,'0'); title = title.replace(mTime[0],'').trim(); }
              const mProj = title.match(/@([\w\-]+)/); if (mProj) { project = mProj[1]; title = title.replace(mProj[0],'').trim(); }
              const mUrl = title.match(/\burl:(\S+)/i); if (mUrl) { url = mUrl[1]; title = title.replace(mUrl[0],'').trim(); }
              if (/\b#flag\b/i.test(title)) { flagged = true; title = title.replace(/#flag/ig,'').trim(); }
              return { title: title || 'Untitled', minutes, project, time, flagged, url };
            })(quick);
            await addAdhocTask(parsed.title, parsed.minutes, undefined, parsed.project, parsed.time, undefined, parsed.url, parsed.flagged);
            setQuick('');
          }}
          style={[styles.input, { borderColor: theme.border, color: theme.text }]}
        />
      </View>
      {!!projects.length && (
        <View style={styles.chipsRow}>
          <TouchableOpacity onPress={() => setFilterProject(null)} style={[styles.chip, { backgroundColor: theme.chipBg }, !filterProject && { backgroundColor: theme.chipOnBg }]}>
            <Text style={[styles.chipText, { color: theme.text }]}>{tr('All')}</Text>
          </TouchableOpacity>
          {projects.map((p) => (
            <TouchableOpacity key={p} onPress={() => setFilterProject(p)} style={[styles.chip, { backgroundColor: theme.chipBg }, filterProject === p && { backgroundColor: theme.chipOnBg }]}>
              <Text style={[styles.chipText, { color: theme.text }]}>{p}</Text>
            </TouchableOpacity>
          ))}
          <TouchableOpacity onPress={() => setFilterFlagged(!filterFlagged)} style={[styles.chip, { backgroundColor: theme.chipBg }, filterFlagged && { backgroundColor: theme.chipOnBg }]}>
            <Text style={[styles.chipText, { color: theme.text }]}>{tr('FlagOnly')}</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => setDense(!dense)} style={[styles.chip, { backgroundColor: theme.chipBg }, dense && { backgroundColor: theme.chipOnBg }]}>
            <Text style={[styles.chipText, { color: theme.text }]}>{dense ? 'Dense' : 'Comfort'}</Text>
          </TouchableOpacity>
        </View>
      )}
      <View style={styles.summary}>
        {(() => {
          const pool = filterProject ? nextTasks.filter((t) => t.project === filterProject) : nextTasks;
          const planned = pool.reduce((a, t) => a + (t.plannedMinutes || 0), 0) + (currentTask && (!filterProject || currentTask.project === filterProject) ? (currentTask.plannedMinutes || 0) : 0);
          const baseActual = Object.values(actualMinutesByTask).reduce((a, n) => a + n, 0);
          const runningMs = currentStartAt ? now - currentStartAt : 0;
          const runningMin = Math.floor(runningMs / 60000);
          const actual = baseActual + runningMin;
          const all = filterProject ? dayTasks.filter(t => t.project === filterProject) : dayTasks;
          const doneCount = all.filter(t => doneIds.includes(t.id)).length;
          const totalCount = all.length || 1;
          const rate = Math.min(100, Math.floor((doneCount / totalCount) * 100));
          const remaining = all.filter(t => !doneIds.includes(t.id)).reduce((sum, t) => {
            const elapsed = (actualMinutesByTask[t.id] ?? 0) + (currentTaskId === t.id && currentStartAt ? Math.floor((now - currentStartAt)/60000) : 0);
            const rem = Math.max(0, (t.plannedMinutes || 0) - elapsed);
            return sum + rem;
          }, 0);
          const eta = dayjs(now).add(remaining, 'minute').format('HH:mm');
          return (
            <>
              <Text style={[styles.summaryText, { color: theme.text }]}>
                {tr('Total')} {tr('Planned')} {planned}m / {tr('Actual')} {actual}m / {tr('Remaining')} {remaining}m{filterProject ? ` ・ [${filterProject}]` : ''}
              </Text>
              <Text style={[styles.summaryText, { color: theme.text }]}>
                {tr('Achievement')} {rate}% ・ {tr('ETA')} {eta}
              </Text>
            </>
          );
        })()}
      </View>
      {currentTask ? (
        <View style={[styles.currentCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
          <Text style={[styles.currentTitle, { color: theme.text }]}>{currentTask.title}</Text>
          <Text style={[styles.currentTimer, { color: theme.text }]}>{hm(currentStartAt ? now - currentStartAt : 0)}</Text>
          <View style={styles.currentActions}>
            <TouchableOpacity accessibilityRole="button" accessibilityLabel={tr('Stop')} onPress={() => setStopModal(true)} style={[styles.btn, { backgroundColor: theme.danger }]}>
              <Text style={styles.btnText}>{tr('Stop')}</Text>
            </TouchableOpacity>
            <TouchableOpacity accessibilityRole="button" accessibilityLabel={tr('Skip')} onPress={skipCurrent} style={[styles.btn, { backgroundColor: theme.gray }]}>
              <Text style={styles.btnText}>{tr('Skip')}</Text>
            </TouchableOpacity>
            <TouchableOpacity accessibilityRole="button" accessibilityLabel={tr('Break')} onPress={() => startBreak()} style={[styles.btn, { backgroundColor: theme.primary }]}>
              <Text style={styles.btnText}>{tr('Break')}</Text>
            </TouchableOpacity>
          </View>
        </View>
      ) : nextTasks[0] ? (
        <View style={[styles.currentCardIdle, { backgroundColor: theme.card, borderColor: theme.border }]}>
          <Text style={[styles.currentIdleText, { color: theme.subtext }]}>{tr('NextTask')}</Text>
          <Text style={styles.currentTitle}>{nextTasks[0].title}</Text>
          <TouchableOpacity accessibilityRole="button" accessibilityLabel={`${tr('Start')} ${nextTasks[0].title}`} onPress={() => startTask(nextTasks[0].id)} style={[styles.btn, { backgroundColor: theme.success, marginTop: 8 }]}>
            <Text style={styles.btnText}>{tr('Start')}</Text>
          </TouchableOpacity>
        </View>
      ) : null}
    </View>
  );

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.bg }]}>
      <SectionList
        ListHeaderComponent={ListHeader}
        sections={(function(){
          const base = filterProject ? timelineRows.filter(r => (r.task.project === filterProject)) : timelineRows;
          const groups: { title: string; startAt?: string; endAt?: string; data: Row[] }[] = sectionsSorted.map(s => ({ title: s.name, startAt: s.startAt, endAt: s.endAt, data: [] }));
          const unassigned: { title: string; startAt?: string; endAt?: string; data: Row[] } = { title: tr('Unassigned'), data: [] };
          for (const row of base) {
            const idx = sectionsSorted.findIndex(s => s.id === row.sectionId);
            const tgt = idx >= 0 ? groups[idx] : unassigned;
            tgt.data.push(row);
          }
          const out = groups.filter(g=>g.data.length>0);
          if (unassigned.data.length>0) out.push(unassigned);
          return out as any;
        })()}
        keyExtractor={(row) => row.key}
        renderItem={({ item: row, section }) => {
          const t = row.task;
          const isCurrent = row.kind==='run' && row.isCurrent;
          const shownActual = row.kind==='run' ? row.duration : (actualMinutesByTask[t.id] ?? 0);
          const ratio = t.plannedMinutes > 0 ? Math.min(1, shownActual / t.plannedMinutes) : 0;
          // 遅延表示はしない
          const diff = shownActual - (t.plannedMinutes || 0);
          const overdue = !doneIds.includes(t.id) && !isCurrent && ((expectedMap[t.id]?.endShow ?? 0) < nowMin);
          return (
            <Swipeable
              renderRightActions={() => (
                <View style={{ justifyContent: 'center', alignItems: 'flex-end' }}>
                  <View style={{ backgroundColor: '#10b981', paddingVertical: 8, paddingHorizontal: 12, borderRadius: 8, marginRight: 8 }}>
                    <Text style={{ color: 'white', fontWeight: '700' }}>完了</Text>
                  </View>
                </View>
              )}
              onSwipeableRightOpen={async () => { if (!doneIds.includes(t.id)) await toggleDone(t.id); }}
            >
            <View style={[styles.row, { backgroundColor: theme.card, borderRadius: 12 }, overdue && { backgroundColor: theme.isDark ? '#3b0d0d' : '#fff1f2' }, dense && { paddingVertical: 4 }]}>
              <View style={styles.leadingIcon}>
                {doneIds.includes(t.id) ? (
                  <View style={[styles.stateBtn, { borderColor: theme.success, backgroundColor: theme.success }]}>
                    <Text style={styles.stateSymbol}>✔</Text>
                  </View>
                ) : isCurrent ? (
                  <TouchableOpacity onPress={() => setStopModal(true)}>
                    <View style={[styles.stateBtn, styles.stateBtnIdle, { borderColor: theme.primary }]}>
                      {/* 空円 */}
                    </View>
                  </TouchableOpacity>
                ) : (
                  <TouchableOpacity accessibilityRole="button" accessibilityLabel={`${tr('Start')} ${t.title}`} onPress={() => startTask(t.id)}>
                    <View style={[styles.stateBtn, styles.stateBtnIdle]} />
                  </TouchableOpacity>
                )}
                {/* 進行中の縦バー（右端細線） */}
                {isCurrent ? <View style={{ width: 2, height: 12, backgroundColor: theme.primary, marginTop: 2 }} /> : null}
              </View>
              <View style={styles.info}>
                <TouchableOpacity onPress={() => openDetail(t.id)} activeOpacity={0.8}>
                  <Text style={[styles.title, { color: theme.text }, dense && { fontSize: 14 }]}>{t.flagged ? '⚑ ' : ''}{t.title}</Text>
                </TouchableOpacity>
                <View style={[styles.progressBar, { backgroundColor: theme.border }]}>
                  <View style={[styles.progressFill, { width: `${ratio * 100}%`, backgroundColor: t.color ?? '#4f46e5' }]} />
                </View>
                {!dense && (() => {
                  const planned = t.plannedMinutes || 0;
                  const elapsed = shownActual;
                  const remain = Math.max(0, planned - elapsed);
                  if (doneIds.includes(t.id)) {
                    const d = elapsed - planned;
                    return (
                      <Text style={[styles.meta, { color: theme.subtext }]}>{tr('Actual')} {toHM(elapsed)} {d !== 0 ? <Text style={{ color: d > 0 ? '#ef4444' : undefined }}>({d > 0 ? `+${d}m` : `${d}m`})</Text> : null}{t.project ? ` ・ ${t.project}` : ''}</Text>
                    );
                  } else if (isCurrent) {
                    return (
                      <Text style={[styles.meta, { color: theme.subtext }]}>{tr('Planned')} {toHM(planned)} ・ {tr('Actual')} {toHM(elapsed)} ・ {tr('Remaining')} {toHM(remain)}{t.project ? ` ・ ${t.project}` : ''}</Text>
                    );
                  } else {
                    return (
                      <Text style={[styles.meta, { color: theme.subtext }]}>{tr('Planned')} {toHM(planned)} ・ {tr('Remaining')} {toHM(remain)}{t.project ? ` ・ ${t.project}` : ''}{overdue ? ' ・ 遅延' : ''}</Text>
                    );
                  }
                })()}
              </View>
              <View style={styles.actions}>
                <TouchableOpacity onPress={() => moveById(t.id, -1)} style={styles.smallBtn}><Text>↑</Text></TouchableOpacity>
                <TouchableOpacity onPress={() => moveById(t.id, +1)} style={styles.smallBtn}><Text>↓</Text></TouchableOpacity>
                <TouchableOpacity onPress={() => moveToIndex(t.id, 0)} style={styles.smallBtn}><Text>⤒</Text></TouchableOpacity>
                <TouchableOpacity onPress={() => moveToIndex(t.id, pipeline.length - 1)} style={styles.smallBtn}><Text>⤓</Text></TouchableOpacity>
                {/* 完了/開始ボタンは非表示。左の状態アイコンで開始/終了を操作 */}
                {/* 右端：上下の細線＋時刻ラベル（期待ベース） */}
                {(() => {
                  const m = expectedMap[t.id];
                  const startShow = m?.startShow ?? 0;
                  const endShow = m?.endShow ?? startShow + (t.plannedMinutes || 0);
                  const startLabel = `${String(Math.floor(startShow/60)).padStart(2,'0')}:${String(startShow%60).padStart(2,'0')}`;
                  const endLabel = `${String(Math.floor(endShow/60)).padStart(2,'0')}:${String(endShow%60).padStart(2,'0')}`;
                  return (
                    <View style={styles.timelineCol}>
                      <Text style={[styles.timeLabel, { color: theme.subtext }]}>{startLabel}</Text>
                      <View style={styles.timeVFlex} />
                      <Text style={[styles.timeLabel, { color: theme.subtext }]}>{endLabel}</Text>
                    </View>
                  );
                })()}
                {/* Flag toggle */}
                <TouchableOpacity onPress={async () => { await updateAction(t.id, { flagged: !t.flagged }); }} style={[styles.smallBtn, { marginLeft: 6, backgroundColor: t.flagged ? '#f59e0b' : '#e5e7eb' }]}>
                  <Text>{t.flagged ? '⚑' : '⚐'}</Text>
                </TouchableOpacity>
              </View>
            </View>
            </Swipeable>
          );
        }}
        renderSectionHeader={({ section }) => (
          <View style={{ paddingTop: 8 }}>
            <View style={{ height: 1, backgroundColor: theme.border, marginHorizontal: 12 }} />
            <Text style={{ color: theme.subtext, fontSize: 12, paddingHorizontal: 12, paddingTop: 2 }}>
              {section.title}{section.startAt ? `  ${section.startAt}${(section as any).endAt ? ` - ${(section as any).endAt}` : ''}` : ''}
            </Text>
          </View>
        )}
        renderSectionFooter={({ section }) => (
          <View style={{ paddingBottom: 8 }}>
            <View style={{ height: 1, backgroundColor: theme.border, marginHorizontal: 12 }} />
          </View>
        )}
        ListEmptyComponent={<Text style={styles.empty}>右下の＋から今日のタスクを追加してください（ルーティンのテンプレはRoutinesで展開）。</Text>}
      />

      {/* 並べ替えモーダル（DnD） */}
      <Modal visible={reorderOpen} animationType="slide" transparent>
        <View style={styles.modalBackdrop}>
          <View style={[styles.modalCard, { maxHeight: '85%', width: '95%', backgroundColor: theme.bg }]}>
            <Text style={[styles.modalTitle, { color: theme.text }]}>{tr('StartReorder')}</Text>
            <DraggableFlatList
              containerStyle={{ maxHeight: '70%' }}
              data={pipelineTasks}
              keyExtractor={(item) => item.id}
              renderItem={({ item, drag, isActive }: RenderItemParams<DayTask>) => (
                <TouchableOpacity onLongPress={drag} disabled={isActive} style={[styles.row, { borderLeftColor: item.color ?? '#4f46e5', backgroundColor: theme.card, borderRadius: 12 }]}>
                  <View style={styles.info}>
                    <Text style={[styles.title, { color: theme.text }]}>{item.flagged ? '⚑ ' : ''}{item.title}</Text>
                    <Text style={[styles.meta, { color: theme.subtext }]}>{tr('Planned')} {item.plannedMinutes}m{item.project ? ` ・ ${item.project}` : ''}</Text>
                  </View>
                  <Text style={{ color: theme.subtext, fontSize: 18 }}>≡</Text>
                </TouchableOpacity>
              )}
              onDragEnd={({ data }) => {
                const newOrder = data.map((t) => t.id);
                setPipeline(newOrder);
              }}
            />
            <View style={styles.modalActions}>
              <TouchableOpacity onPress={() => setReorderOpen(false)} style={[styles.btn, { backgroundColor: theme.gray }]}>
                <Text style={styles.btnText}>{tr('Close')}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <Modal visible={stopModal} animationType="slide" transparent>
        <View style={styles.modalBackdrop}>
          <View style={[styles.modalCard, { backgroundColor: theme.bg }]}>
            <Text style={[styles.modalTitle, { color: theme.text }]}>{tr('NoteOptional')}</Text>
            <TextInput
              value={notes}
              onChangeText={setNotes}
              placeholder=""
              placeholderTextColor={theme.subtext}
              style={[styles.input, { color: theme.text, borderColor: theme.border }]}
              multiline
            />
            <View style={styles.modalActions}>
              <TouchableOpacity accessibilityRole="button" accessibilityLabel={tr('Cancel')} onPress={() => { setNotes(''); setStopModal(false); }} style={[styles.btn, { backgroundColor: theme.gray }]}>
                <Text style={styles.btnText}>{tr('Cancel')}</Text>
              </TouchableOpacity>
              <TouchableOpacity accessibilityRole="button" accessibilityLabel={tr('StopAndSave')} onPress={async () => { await stopTask(notes.trim() || undefined); setNotes(''); setStopModal(false); if (pausedStack.length) { setResumeModal(true); } }} style={[styles.btn, { backgroundColor: theme.danger }]}>
                <Text style={styles.btnText}>{tr('StopAndSave')}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* 再開確認モーダル */}
      <Modal visible={resumeModal} animationType="fade" transparent>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>前のタスクを再開しますか？</Text>
            <View style={styles.modalActions}>
              <TouchableOpacity onPress={() => setResumeModal(false)} style={[styles.btn, styles.gray]}>
                <Text style={styles.btnText}>しない</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={async () => { setResumeModal(false); await resumeLastPaused(); }} style={[styles.btn, styles.start]}>
                <Text style={styles.btnText}>再開する</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* アクション詳細シート */}
      <Modal visible={!!detailTaskId} animationType="slide" transparent>
        <View style={styles.modalBackdrop}>
          <View style={[styles.modalCard, { maxHeight: '85%' }]}>
            {!detailTask && (
              <View>
                <Text style={styles.modalTitle}>{tr('Action')}</Text>
                <Text style={[styles.meta, { color: theme.subtext }]}>{tr('DataLoadFailed')}</Text>
              </View>
            )}
            {!!detailTask && (() => {
              const t = detailTask;
              const isCurrent = currentTaskId === t.id;
              const taskRuns = runs.filter(r => r.taskId === t.id).sort((a,b)=>a.startAt-b.startAt);
              const firstStart = taskRuns.length ? dayjs(taskRuns[0].startAt).format('HH:mm') : undefined;
              const lastEnd = taskRuns.length && taskRuns[taskRuns.length-1].endAt ? dayjs(taskRuns[taskRuns.length-1].endAt).format('HH:mm') : undefined;
              const baseActual = actualMinutesByTask[t.id] ?? 0;
              const runningAdd = isCurrent && currentStartAt ? Math.max(0, Math.floor((now - currentStartAt)/60000)) : 0;
              const actual = baseActual + runningAdd;
              const secName = sections.find(s => s.id === t.sectionId)?.name;
              return (
                <>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                    <Text style={[styles.currentTitle, { flex: 1 }]}>{t.title}</Text>
                    <TouchableOpacity onPress={() => { 
                      setEditTitle(t.title);
                      setEditExpected(String(t.plannedMinutes || 0));
                      setEditProject(t.project || '');
                      setEditScheduled(t.scheduledAt || '');
                      setEditSectionId(t.sectionId);
                      setEditUrl(t.url || '');
                      setEditFlagged(!!t.flagged);
                      setEditOpen(true);
                    }}>
                      <Text style={{ color: '#2563eb', fontWeight: '600' }}>編集</Text>
                    </TouchableOpacity>
                  </View>
                  <View style={{ flexDirection: 'row', marginTop: 8 }}>
                    {isCurrent ? (
                      <TouchableOpacity onPress={async () => { await stopTask(detailNotes.trim() || undefined); setDetailNotes(''); setDetailTaskId(null); }} style={[styles.btn, { backgroundColor: theme.danger }]}>
                        <Text style={styles.btnText}>{tr('FinishAction')}</Text>
                      </TouchableOpacity>
                    ) : (
                      <TouchableOpacity onPress={async () => { await startTask(t.id); setDetailTaskId(null); }} style={[styles.btn, { backgroundColor: theme.success }]}>
                        <Text style={styles.btnText}>{tr('StartAction')}</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                  <View style={{ marginTop: 12 }}>
                    <Text style={[styles.meta, { color: theme.subtext }]}>{tr('StartTime')}: {firstStart ?? '-'}</Text>
                    <Text style={[styles.meta, { color: theme.subtext }]}>{tr('EndTime')}: {lastEnd ?? '-'}</Text>
                    <Text style={[styles.meta, { color: theme.subtext }]}>{tr('PlannedTime')}: {t.plannedMinutes}m / {tr('Actual')}: {actual}m {t.plannedMinutes>0 ? `(${actual - t.plannedMinutes >=0 ? '+' : ''}${actual - t.plannedMinutes}m)` : ''}</Text>
                    <Text style={[styles.meta, { color: theme.subtext }]}>{tr('ScheduledDate')}: {dayjs(t.date).format('YYYY/MM/DD')}</Text>
                    <Text style={[styles.meta, { color: theme.subtext }]}>{tr('Project')}: {t.project ?? tr('NotSet')}</Text>
                    <Text style={[styles.meta, { color: theme.subtext }]}>{tr('SectionLabel')}: {secName ?? tr('Unassigned')}</Text>
                  {t.url ? (
                      <TouchableOpacity onPress={() => Linking.openURL(t.url!)}>
                        <Text style={[styles.meta, { color: theme.primary }]}>{tr('OpenURL')}</Text>
                      </TouchableOpacity>
                    ) : null}
                    <View style={{ marginTop: 12 }}>
                      <Text style={[styles.meta, { color: theme.subtext }]}>{tr('NotesOnFinish')}</Text>
                      <TextInput value={detailNotes} onChangeText={setDetailNotes} placeholder="" placeholderTextColor={theme.subtext} style={[styles.input, { borderColor: theme.border, color: theme.text }]} multiline />
                    </View>
                  </View>
                  <View style={{ alignItems: 'flex-end' }}>
                    <TouchableOpacity onPress={() => setDetailTaskId(null)} style={[styles.btn, { backgroundColor: theme.gray }]}>
                      <Text style={styles.btnText}>{tr('Close')}</Text>
                    </TouchableOpacity>
                  </View>
                </>
              );
            })()}
          </View>
        </View>
      </Modal>

      {/* アクション編集モーダル */}
      <Modal visible={editOpen} animationType="slide" transparent>
        <View style={styles.modalBackdrop}>
          <View style={[styles.modalCard, { maxHeight: '85%', backgroundColor: theme.bg }]}>
            <Text style={[styles.modalTitle, { color: theme.text }]}>{tr('EditAction')}</Text>
            <TextInput placeholder={tr('ActionName')} placeholderTextColor={theme.subtext} value={editTitle} onChangeText={setEditTitle} style={[styles.input, { borderColor: theme.border, color: theme.text }]} />
            <TextInput placeholder={tr('PlannedMinutes')} placeholderTextColor={theme.subtext} value={editExpected} onChangeText={setEditExpected} keyboardType="numeric" style={[styles.input, { borderColor: theme.border, color: theme.text }]} />
            <TextInput placeholder={tr('PlannedStartOptional')} placeholderTextColor={theme.subtext} value={editScheduled} onChangeText={setEditScheduled} style={[styles.input, { borderColor: theme.border, color: theme.text }]} />
            <TextInput placeholder={tr('Project')} placeholderTextColor={theme.subtext} value={editProject} onChangeText={setEditProject} style={[styles.input, { borderColor: theme.border, color: theme.text }]} />
            {!!projects.length && (
              <View style={styles.chipsRow}>
                {projects.map((p) => (
                  <TouchableOpacity key={p} onPress={() => setEditProject(p)} style={[styles.chip, editProject === p && styles.chipOn]}>
                    <Text style={styles.chipText}>{p}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            )}
            {/* セクション選択UIは非表示（時間で自動割当） */}
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
              <Text style={{ color: theme.subtext }}>{tr('SectionAuto')}</Text>
              <TouchableOpacity onPress={() => setSectionModal(true)}>
                <Text style={{ color: theme.primary }}>{tr('ManageSections')}</Text>
              </TouchableOpacity>
            </View>
            <TextInput placeholder="URL" placeholderTextColor={theme.subtext} value={editUrl} onChangeText={setEditUrl} style={[styles.input, { borderColor: theme.border, color: theme.text }]} />
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <TouchableOpacity onPress={() => setEditFlagged(!editFlagged)} style={[styles.chip, editFlagged && styles.chipOn]}>
                <Text style={styles.chipText}>{editFlagged ? 'フラグ ON' : 'フラグ OFF'}</Text>
              </TouchableOpacity>
            </View>
            {/* 手動の開始/終了入力は不要のため削除 */}
            <View style={styles.modalActions}>
              <TouchableOpacity onPress={() => setEditOpen(false)} style={[styles.btn, styles.gray]}>
                <Text style={styles.btnText}>キャンセル</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={async () => { if (!detailTaskId) return; Alert.alert('削除の確認', 'このアクションを削除しますか？', [ { text: 'キャンセル', style: 'cancel' }, { text: '削除', style: 'destructive', onPress: async () => { await deleteAction(detailTaskId); setEditOpen(false); setDetailTaskId(null); } }, ]); }} style={[styles.btn, styles.danger]}>
                <Text style={styles.btnText}>削除</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={async () => {
                if (!detailTaskId) return;
                const name = editTitle.trim();
                if (!name) { Alert.alert('エラー', 'アクション名は必須です'); return; }
                if (editScheduled && !/^([01]\d|2[0-3]):[0-5]\d$/.test(editScheduled)) { Alert.alert('エラー', '開始予定はHH:mm'); return; }
                const pm = Number(editExpected) || 0;
                await updateAction(detailTaskId, {
                  title: name,
                  plannedMinutes: pm,
                  project: editProject.trim() || undefined,
                  scheduledAt: editScheduled || undefined,
                  sectionId: editSectionId,
                  url: editUrl.trim() || undefined,
                  flagged: editFlagged,
                });
                setEditOpen(false);
                setDetailTaskId(null);
              }} style={[styles.btn, styles.start]}>
                <Text style={styles.btnText}>保存</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* セクション管理モーダル */}
      <Modal visible={sectionModal} animationType="slide" transparent>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>セクション管理</Text>
            <View style={{ flexDirection: 'row' }}>
              <TextInput placeholder="名前" value={secName} onChangeText={setSecName} style={[styles.input, { flex: 1 }]} />
              <TextInput placeholder="開始 HH:mm" value={secStart} onChangeText={setSecStart} style={[styles.input, { width: 120, marginLeft: 8 }]} />
              <TextInput placeholder="終了 HH:mm" value={secEnd} onChangeText={setSecEnd} style={[styles.input, { width: 120, marginLeft: 8 }]} />
            </View>
            <View style={styles.modalActions}>
              <TouchableOpacity onPress={() => setSectionModal(false)} style={[styles.btn, styles.gray]}>
                <Text style={styles.btnText}>閉じる</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={async () => {
                const name = secName.trim();
                const st = secStart.trim();
                const ed = secEnd.trim();
                const ok = name && /^([01]\d|2[0-3]):[0-5]\d$/.test(st) && /^([01]\d|2[0-3]):[0-5]\d$/.test(ed);
                if (!ok) return;
                const id = nanoid(10);
                const next = [...sections, { id, name, startAt: st, endAt: ed, order: sections.length }];
                await setSections(next);
                setSecName('');
              }} style={[styles.btn, styles.primary]}>
                <Text style={styles.btnText}>追加</Text>
              </TouchableOpacity>
            </View>
            {sectionsSorted.map((s, i) => (
              <View key={s.id} style={[styles.row, { borderLeftColor: '#e5e7eb' }]}>
                <View style={styles.info}>
                  <Text style={styles.title}>{s.name}</Text>
                  <Text style={styles.meta}>{s.startAt} - {s.endAt}</Text>
                </View>
                <View style={styles.actions}>
                  <TouchableOpacity disabled={i===0} onPress={async () => {
                    if (i===0) return;
                    const arr = [...sectionsSorted];
                    [arr[i-1].order, arr[i].order] = [arr[i].order, arr[i-1].order];
                    const normalized = arr.map((x, idx) => ({ ...x, order: idx }));
                    await setSections(normalized);
                  }} style={styles.smallBtn}><Text>↑</Text></TouchableOpacity>
                  <TouchableOpacity disabled={i===sectionsSorted.length-1} onPress={async () => {
                    if (i===sectionsSorted.length-1) return;
                    const arr = [...sectionsSorted];
                    [arr[i+1].order, arr[i].order] = [arr[i].order, arr[i+1].order];
                    const normalized = arr.map((x, idx) => ({ ...x, order: idx }));
                    await setSections(normalized);
                  }} style={styles.smallBtn}><Text>↓</Text></TouchableOpacity>
                  <TouchableOpacity onPress={async () => {
                    const next = sections.filter((x) => x.id !== s.id).map((x, idx) => ({ ...x, order: idx }));
                    await setSections(next);
                  }} style={[styles.btn, styles.danger]}>
                    <Text style={styles.btnText}>削除</Text>
                  </TouchableOpacity>
                </View>
              </View>
            ))}
          </View>
        </View>
      </Modal>

      {/* 右下の＋（単発タスク追加） */}
      <TouchableOpacity style={styles.fab} onPress={() => setAddModal(true)}>
        <Text style={styles.fabText}>＋</Text>
      </TouchableOpacity>
      {/* 並べ替え起動ボタン */}
      <TouchableOpacity style={[styles.fab, { right: 90, backgroundColor: '#10b981' }]} onPress={() => setReorderOpen(true)}>
        <Text style={styles.fabText}>↕</Text>
      </TouchableOpacity>

      {/* 単発タスク追加モーダル */}
      <Modal visible={addModal} animationType="slide" transparent>
        <View style={styles.modalBackdrop}>
          <View style={[styles.modalCard]}>
            <Text style={styles.modalTitle}>単発タスクを追加</Text>
            <TextInput placeholder="タイトル" value={newTitle} onChangeText={setNewTitle} style={styles.input} />
            <TextInput placeholder="予定(分)" value={newPlanned} onChangeText={setNewPlanned} keyboardType="numeric" style={styles.input} />
            <TextInput placeholder="プロジェクト（任意）" value={newProject} onChangeText={setNewProject} style={styles.input} />
            {!!projects.length && (
              <View style={styles.chipsRow}>
                {projects.map((p) => (
                  <TouchableOpacity key={p} onPress={() => setNewProject(p)} style={[styles.chip, newProject === p && styles.chipOn]}>
                    <Text style={styles.chipText}>{p}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            )}
            <TextInput placeholder="開始予定 (HH:mm 任意)" value={newTime} onChangeText={setNewTime} style={styles.input} />
            {/* セクション選択UIは非表示（時間で自動割当） */}
            <View style={{ flexDirection: 'row', marginVertical: 8 }}>
              {colors.map((c) => (
                <TouchableOpacity key={c} onPress={() => setNewColor(c)} style={{ width: 28, height: 28, borderRadius: 14, marginRight: 8, backgroundColor: c, borderWidth: newColor === c ? 3 : 1, borderColor: '#111827' }} />
              ))}
            </View>
            <View style={styles.modalActions}>
              <TouchableOpacity onPress={() => { setAddModal(false); }} style={[styles.btn, styles.gray]}>
                <Text style={styles.btnText}>閉じる</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={async () => {
                  const title = newTitle.trim();
                  if (!title) return;
                  // validate HH:mm or empty
                  const time = newTime.trim();
                  const ok = time === '' || /^([01]\d|2[0-3]):[0-5]\d$/.test(time);
                  if (!ok) return;
                  await addAdhocTask(title, Number(newPlanned) || 0, newColor, newProject.trim() || undefined, time || undefined, newSectionId);
                  setNewTitle('');
                  setNewPlanned('25');
                  setNewProject('');
                  setNewTime('');
                  setNewColor(colors[0]);
                  setNewSectionId(undefined);
                  setAddModal(false);
                }}
                style={[styles.btn, styles.start]}
              >
                <Text style={styles.btnText}>追加</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  header: { fontSize: 24, fontWeight: '600', padding: 16 },
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 12,
    marginHorizontal: 12,
    marginVertical: 2,
  },
  info: { flex: 1 },
  title: { fontSize: 16, fontWeight: '600' },
  meta: { color: '#6b7280', marginTop: 4 },
  actions: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  leadingIcon: { width: 56, alignItems: 'center', paddingRight: 8 },
  stateBtn: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center', borderWidth: 2 },
  stateBtnIdle: { borderColor: '#9ca3af', backgroundColor: 'transparent' },
  stateBtnRun: { borderColor: '#2563eb', backgroundColor: '#2563eb' },
  stateBtnDone: { borderColor: '#10b981', backgroundColor: '#10b981' },
  stateSymbol: { color: '#ffffff', fontWeight: '700' },
  stateSymbolIdle: { color: '#6b7280' },
  delayBadge: { color: '#ef4444', fontSize: 10, lineHeight: 12, marginTop: 2, textAlign: 'center', width: 40 },
  btn: { paddingVertical: 8, paddingHorizontal: 12, borderRadius: 8, marginLeft: 8 },
  start: { backgroundColor: '#10b981' },
  stop: { backgroundColor: '#ef4444' },
  primary: { backgroundColor: '#2563eb' },
  danger: { backgroundColor: '#ef4444' },
  btnText: { color: 'white', fontWeight: '600' },
  smallBtn: { padding: 6, backgroundColor: '#e5e7eb', borderRadius: 6, marginHorizontal: 4 },
  empty: { textAlign: 'center', color: '#6b7280', marginTop: 32 },
  progressBar: { height: 6, backgroundColor: '#e5e7eb', borderRadius: 6, overflow: 'hidden', marginTop: 8 },
  progressFill: { height: '100%' },
  timelineCol: { marginLeft: 8, width: 48, alignItems: 'center' },
  timeVFlex: { width: 2, flex: 1, backgroundColor: '#9ca3af' },
  timeLabel: { color: '#6b7280', fontSize: 12 },
  sectionBandLight: { backgroundColor: '#f8fafc' },
  summary: { paddingHorizontal: 16, marginBottom: 4 },
  summaryText: { color: '#374151' },
  currentCard: { marginHorizontal: 12, marginBottom: 8, padding: 16, backgroundColor: '#fff7ed', borderRadius: 12, borderWidth: 1, borderColor: '#fed7aa' },
  currentCardIdle: { marginHorizontal: 12, marginBottom: 8, padding: 16, backgroundColor: '#f0f9ff', borderRadius: 12, borderWidth: 1, borderColor: '#bae6fd' },
  currentTitle: { fontSize: 18, fontWeight: '700', marginTop: 4 },
  currentTimer: { fontSize: 32, fontWeight: '800', marginTop: 4 },
  currentActions: { flexDirection: 'row', marginTop: 8 },
  currentIdleText: { color: '#6b7280' },
  gray: { backgroundColor: '#6b7280' },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16, paddingTop: 12 },
  sectionTitle: { fontSize: 14, fontWeight: '700', color: '#111827' },
  sectionTime: { color: '#6b7280' },
  modalBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.3)', justifyContent: 'center', padding: 16 },
  modalCard: { backgroundColor: 'white', borderRadius: 12, padding: 16 },
  modalTitle: { fontSize: 18, fontWeight: '600', marginBottom: 12 },
  input: { borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 8, padding: 10, marginVertical: 6 },
  modalActions: { flexDirection: 'row', justifyContent: 'flex-end', marginTop: 12 },
  fab: { position: 'absolute', right: 20, bottom: 30, backgroundColor: '#2563eb', width: 56, height: 56, borderRadius: 28, alignItems: 'center', justifyContent: 'center', elevation: 4 },
  fabText: { color: 'white', fontSize: 28, lineHeight: 28 },
  chipsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginVertical: 6 },
  chip: { paddingVertical: 6, paddingHorizontal: 10, backgroundColor: '#e5e7eb', borderRadius: 16, marginRight: 6, marginTop: 6 },
  chipOn: { backgroundColor: '#93c5fd' },
  chipText: { color: '#111827' },
});
