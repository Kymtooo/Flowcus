import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { nanoid } from 'nanoid/non-secure';
import { Routine, DayTask, RunEntry, Section } from '../types';
import { appendRun, getCurrentRun, getPipeline, getRuns, getRoutines, savePipeline, saveRoutines, setCurrentRun, getDone, setDone, getDayTasks, saveDayTasks, getSections, saveSections, getProjects, saveProjects, saveRuns, getAppliedFlag, setAppliedFlag } from '../storage';
import dayjs from 'dayjs';
import { cancelOverdueReminder, cancelStartReminder, ensurePermission, scheduleBreakEnd, scheduleOverdueReminder, scheduleStartReminder } from '../notify';

type Ctx = {
  routines: Routine[];
  setRoutines: (list: Routine[]) => void;
  dayTasks: DayTask[];
  setDayTasks: (list: DayTask[]) => void;
  pipeline: string[]; // holds DayTask.id
  setPipeline: (ids: string[]) => void;
  runs: RunEntry[];
  refresh: () => Promise<void>;
  startTask: (taskId: string) => Promise<void>; // taskId is DayTask.id
  stopTask: (notes?: string) => Promise<void>;
  currentTaskId: string | null;
  currentStartAt: number | null;
  actualMinutesByTask: Record<string, number>;
  doneIds: string[];
  toggleDone: (taskId: string) => Promise<void>;
  skipCurrent: () => Promise<void>;
  addFromRoutine: (routineId: string) => Promise<void>;
  addAdhocTask: (title: string, plannedMinutes: number, color?: string, project?: string, scheduledAt?: string, sectionId?: string, url?: string, flagged?: boolean) => Promise<void>;
  setRoutineTemplate: (routineId: string, on: boolean) => Promise<void>;
  applyTemplate: () => Promise<void>;
  sections: Section[];
  setSections: (list: Section[]) => Promise<void>;
  projects: string[];
  addProjectIfMissing: (name: string) => Promise<void>;
  updateAction: (id: string, patch: Partial<DayTask> & { scheduledAt?: string; project?: string; sectionId?: string; url?: string; flagged?: boolean }, manualTimes?: { startHHmm?: string; endHHmm?: string }) => Promise<void>;
  pausedStack: string[];
  resumeLastPaused: () => Promise<void>;
  startBreak: (minutes?: number) => Promise<void>;
  deleteAction: (id: string) => Promise<void>;
};

const TasksContext = createContext<Ctx | undefined>(undefined);

export const TasksProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [routines, _setRoutines] = useState<Routine[]>([]);
  const [dayTasks, _setDayTasks] = useState<DayTask[]>([]);
  const [pipeline, _setPipeline] = useState<string[]>([]);
  const [runs, setRuns] = useState<RunEntry[]>([]);
  const [currentTaskId, setCurrentTaskId] = useState<string | null>(null);
  const [currentStartAt, setCurrentStartAt] = useState<number | null>(null);
  const [doneIds, setDoneIds] = useState<string[]>([]);
  const [sections, _setSections] = useState<Section[]>([]);
  const [projects, _setProjects] = useState<string[]>([]);
  const [pausedStack, setPausedStack] = useState<string[]>([]);

  useEffect(() => {
    refresh();
  }, []);

  const refresh = async () => {
    const today = dayjs().format('YYYY-MM-DD');
    const [rt, dt, p, r, cur, d, ss, pj] = await Promise.all([
      getRoutines(),
      getDayTasks(today),
      getPipeline(today),
      getRuns(today),
      getCurrentRun(),
      getDone(today),
      getSections(),
      getProjects(),
    ]);
    _setRoutines(rt);
    _setDayTasks(dt);
    _setPipeline(p);
    setRuns(r);
    setCurrentTaskId(cur?.taskId ?? null);
    setCurrentStartAt(cur?.startAt ?? null);
    setDoneIds(d);
    _setSections(ss);
    _setProjects(pj);

    // 通知権限の確認（失敗しても無視）
    await ensurePermission();

    // ルーティンの自動展開（当日初回のみ、曜日/時間条件）
    try {
      const already = await getAppliedFlag(today);
      if (!already) {
        const dow = dayjs().day(); // 0..6 (Sun..Sat)
        const picks = rt.filter((r) => (r.isTemplate || !!r.plannedStartAt) && (!r.days || r.days.includes(dow)) && !dt.some(x => x.routineId === r.id));
        if (picks.length) {
          const created = picks.map((r, i) => ({
            id: uid(), routineId: r.id, title: r.title, plannedMinutes: r.plannedMinutes, color: r.color, order: dt.length + i,
            project: r.project, scheduledAt: r.plannedStartAt, sectionId: autoSectionForTime(r.plannedStartAt), date: today,
          } as DayTask));
          await setDayTasks([...dt, ...created]);
          await setPipeline([...p, ...created.map((t) => t.id)]);
        }
        await setAppliedFlag(today);
      }
    } catch {}

    // 予定開始の通知を再スケジュール（未来分のみ）
    try {
      const tasksToday = await getDayTasks(today);
      for (const t of tasksToday) {
        await scheduleStartReminder(t);
      }
      // 実行中タスクがあれば超過通知をセット
      if (cur?.taskId) {
        const t = tasksToday.find((x) => x.id === cur.taskId);
        if (t && cur.startAt) await scheduleOverdueReminder(t, cur.startAt);
      }
    } catch {}
  };

  const setRoutines = async (next: Routine[]) => {
    _setRoutines(next);
    await saveRoutines(next);
  };

  const setDayTasks = async (next: DayTask[]) => {
    _setDayTasks(next);
    await saveDayTasks(next);
  };

  const setPipeline = async (ids: string[]) => {
    _setPipeline(ids);
    await savePipeline(ids);
  };

  const startTask = async (taskId: string) => {
    const now = Date.now();
    const cur = await getCurrentRun();
    if (cur && cur.taskId !== taskId) {
      // 中断: 現在のタスクを終了してスタックに積む
      const entry: RunEntry = { id: `${cur.taskId}:${cur.startAt}`, taskId: cur.taskId, startAt: cur.startAt, endAt: now };
      await appendRun(entry, dayjs().format('YYYY-MM-DD'));
      setPausedStack((s) => [...s, cur.taskId!]);
    }
    await setCurrentRun({ taskId, startAt: now });
    setCurrentTaskId(taskId);
    setCurrentStartAt(now);
    // 実行中の最新ログへ反映
    setRuns(await getRuns());

    // 通知: 開始予定は不要になるのでキャンセル、超過を予約
    try {
      const today = dayjs().format('YYYY-MM-DD');
      await cancelStartReminder(taskId, today);
      const t = (await getDayTasks(today)).find((x) => x.id === taskId);
      if (t) await scheduleOverdueReminder(t, now);
    } catch {}
  };

  const stopTask = async (notes?: string) => {
    const cur = await getCurrentRun();
    if (!cur) return;
    const entry: RunEntry = {
      id: `${cur.taskId}:${cur.startAt}`,
      taskId: cur.taskId,
      startAt: cur.startAt,
      endAt: Date.now(),
      notes,
    };
    await appendRun(entry, dayjs().format('YYYY-MM-DD'));
    // 停止=完了として扱う（中断は startTask 側で終了保存済みかつ完了扱いしない）
    const doneList = await getDone(dayjs().format('YYYY-MM-DD'));
    if (!doneList.includes(cur.taskId)) {
      const nextDone = [...doneList, cur.taskId];
      await setDone(nextDone, dayjs().format('YYYY-MM-DD'));
      setDoneIds(nextDone);
    }
    await setCurrentRun(null);
    setCurrentTaskId(null);
    setCurrentStartAt(null);
    setRuns(await getRuns());

    // 通知: 超過通知をキャンセル
    try {
      await cancelOverdueReminder(cur.taskId, dayjs().format('YYYY-MM-DD'));
    } catch {}
  };

  const resumeLastPaused = async () => {
    if (!pausedStack.length) return;
    const last = pausedStack[pausedStack.length - 1];
    setPausedStack((s) => s.slice(0, -1));
    await startTask(last);
  };

  const toggleDone = async (taskId: string) => {
    const next = doneIds.includes(taskId) ? doneIds.filter((x) => x !== taskId) : [...doneIds, taskId];
    setDoneIds(next);
    await setDone(next);
  };

  const skipCurrent = async () => {
    if (!currentTaskId) return;
    const idx = pipeline.indexOf(currentTaskId);
    if (idx === -1) return;
    const next = [...pipeline];
    const [id] = next.splice(idx, 1);
    next.push(id);
    _setPipeline(next);
    await savePipeline(next);
  };

  const actualMinutesByTask = useMemo(() => {
    const acc: Record<string, number> = {};
    for (const r of runs) {
      const mins = Math.max(0, Math.round((r.endAt - r.startAt) / 60000));
      acc[r.taskId] = (acc[r.taskId] ?? 0) + mins;
    }
    return acc;
  }, [runs]);

  const uid = () => nanoid(10);

  // HH:mm -> minutes
  const toMinutes = (hhmm?: string) => {
    if (!hhmm) return null;
    const [h, m] = hhmm.split(':').map((x) => parseInt(x, 10));
    if (Number.isNaN(h) || Number.isNaN(m)) return null;
    return h * 60 + m;
  };

  // 含有判定（跨ぎ対応）: start<=end なら start<=t<end / start>end なら t>=start or t<end
  const intervalContains = (startMin: number, endMin: number, tMin: number) => {
    if (startMin <= endMin) return tMin >= startMin && tMin < endMin;
    return tMin >= startMin || tMin < endMin;
  };

  const autoSectionForTime = (hhmm?: string) => {
    const t = toMinutes(hhmm);
    if (t == null) return undefined;
    let bestId: string | undefined;
    let bestDist = Infinity; // t からの逆向き距離（0..1439）
    for (const s of sections) {
      const sm = toMinutes(s.startAt);
      const em = toMinutes(s.endAt ?? '23:59');
      if (sm == null || em == null) continue;
      if (!intervalContains(sm, em, t)) continue;
      const dist = (t - sm + 1440) % 1440;
      if (dist < bestDist) {
        bestDist = dist;
        bestId = s.id;
      }
    }
    return bestId;
  };

  const addFromRoutine = async (routineId: string) => {
    const r = routines.find((x) => x.id === routineId);
    if (!r) return;
    const t: DayTask = {
      id: uid(),
      routineId: r.id,
      title: r.title,
      plannedMinutes: r.plannedMinutes,
      color: r.color,
      order: dayTasks.length,
      project: r.project,
      scheduledAt: r.plannedStartAt,
      sectionId: autoSectionForTime(r.plannedStartAt),
      date: dayjs().format('YYYY-MM-DD'),
    };
    const nextTasks = [...dayTasks, t];
    await setDayTasks(nextTasks);
    await setPipeline([...pipeline, t.id]);
    if (t.scheduledAt) await scheduleStartReminder(t);
    if (r.project) await addProjectIfMissing(r.project);
  };

  const addAdhocTask = async (title: string, plannedMinutes: number, color?: string, project?: string, scheduledAt?: string, sectionId?: string, url?: string, flagged?: boolean) => {
    const autoSection = sectionId ?? autoSectionForTime(scheduledAt);
    const t: DayTask = { id: uid(), title: title.trim(), plannedMinutes, color, order: dayTasks.length, project, scheduledAt, sectionId: autoSection, date: dayjs().format('YYYY-MM-DD'), url, flagged };
    const nextTasks = [...dayTasks, t];
    await setDayTasks(nextTasks);
    await setPipeline([...pipeline, t.id]);
    if (scheduledAt) await scheduleStartReminder(t);
    if (project) await addProjectIfMissing(project);
  };

  const startBreak = async (minutes = 5) => {
    const title = '休憩';
    const color = '#9ca3af';
    await addAdhocTask(title, minutes, color);
    const last = dayTasks[dayTasks.length - 1];
    const newTask = last ? last : (await getDayTasks()).slice(-1)[0];
    const id = newTask?.id;
    if (id) {
      await startTask(id);
      await scheduleBreakEnd(minutes);
    }
  };

  const deleteAction = async (id: string) => {
    // 停止中であれば解除
    const cur = await getCurrentRun();
    if (cur?.taskId === id) {
      await setCurrentRun(null);
      setCurrentTaskId(null);
      setCurrentStartAt(null);
    }
    const today = dayjs().format('YYYY-MM-DD');
    // runsから削除
    const rs = await getRuns(today);
    await saveRuns(rs.filter(r => r.taskId !== id), today);
    setRuns(await getRuns());
    // dayTasksから削除
    const nextTasks = dayTasks.filter(t => t.id !== id);
    await setDayTasks(nextTasks);
    // pipelineから削除
    await setPipeline(pipeline.filter(pid => pid !== id));
    // doneから削除
    const d = await getDone(today);
    const nd = d.filter(x => x !== id);
    await setDone(nd, today);
    setDoneIds(nd);

    // 通知キャンセル
    try {
      await cancelStartReminder(id, today);
      await cancelOverdueReminder(id, today);
    } catch {}
  };

  const setRoutineTemplate = async (routineId: string, on: boolean) => {
    const next = routines.map((r) => (r.id === routineId ? { ...r, isTemplate: on } : r));
    await setRoutines(next);
  };

  const applyTemplate = async () => {
    const picks = routines.filter((r) => r.isTemplate);
    if (picks.length === 0) return;
    const created: DayTask[] = picks.map((r, i) => {
      const scheduledAt = r.plannedStartAt;
      const sectionId = autoSectionForTime(scheduledAt);
      return {
        id: uid(),
        routineId: r.id,
        title: r.title,
        plannedMinutes: r.plannedMinutes,
        color: r.color,
        order: dayTasks.length + i,
        project: r.project,
        scheduledAt,
        sectionId,
        date: dayjs().format('YYYY-MM-DD'),
      } as DayTask;
    });
    await setDayTasks([...dayTasks, ...created]);
    await setPipeline([...pipeline, ...created.map((t) => t.id)]);
    const pjSet = new Set(projects);
    for (const r of picks) if (r.project) pjSet.add(r.project);
    await saveProjects(Array.from(pjSet));
    _setProjects(Array.from(pjSet));
  };

  const setSections = async (list: Section[]) => {
    _setSections(list);
    await saveSections(list);
  };

  const addProjectIfMissing = async (name: string) => {
    if (!name.trim()) return;
    if (projects.includes(name)) return;
    const next = [...projects, name];
    _setProjects(next);
    await saveProjects(next);
  };

  const updateAction = async (id: string, patch: Partial<DayTask>, manualTimes?: { startHHmm?: string; endHHmm?: string }) => {
    let changedList = dayTasks.map((t) => (t.id === id ? { ...t, ...patch } : t));
    await setDayTasks(changedList);
    if (patch.project) await addProjectIfMissing(patch.project);
    // 予定時刻が変わったら通知を再設定
    if (Object.prototype.hasOwnProperty.call(patch, 'scheduledAt')) {
      try {
        const today = dayjs().format('YYYY-MM-DD');
        await cancelStartReminder(id, today);
        const t = changedList.find((x) => x.id === id);
        if (t && t.scheduledAt) await scheduleStartReminder(t);
      } catch {}
    }
    // manual start/end -> replace runs for this action on its date
    if (manualTimes && (manualTimes.startHHmm || manualTimes.endHHmm)) {
      const t = changedList.find((x) => x.id === id);
      if (!t) return;
      const dateStr = t.date ?? dayjs().format('YYYY-MM-DD');
      const list = await getRuns(dateStr);
      const filtered = list.filter((r) => r.taskId !== id);
      const startMin = toMinutes(manualTimes.startHHmm || '') ?? null;
      const endMin = toMinutes(manualTimes.endHHmm || '') ?? null;
      if (startMin != null && endMin != null && endMin >= startMin) {
        const [y, M, d] = dateStr.split('-').map((x) => parseInt(x, 10));
        const startAt = dayjs().year(y).month(M - 1).date(d).hour(Math.floor(startMin / 60)).minute(startMin % 60).second(0).millisecond(0).valueOf();
        const endAt = dayjs().year(y).month(M - 1).date(d).hour(Math.floor(endMin / 60)).minute(endMin % 60).second(0).millisecond(0).valueOf();
        filtered.push({ id: `${id}:${startAt}`, taskId: id, startAt, endAt });
      }
      await saveRuns(filtered, dateStr);
      setRuns(await getRuns(dateStr));
    }
  };

  const value: Ctx = {
    routines,
    setRoutines,
    dayTasks,
    setDayTasks,
    pipeline,
    setPipeline,
    runs,
    refresh,
    startTask,
    stopTask,
    currentTaskId,
    currentStartAt,
    actualMinutesByTask,
    doneIds,
    toggleDone,
    skipCurrent,
    addFromRoutine,
    addAdhocTask,
    setRoutineTemplate,
    applyTemplate,
    sections,
    setSections,
    projects,
    addProjectIfMissing,
    updateAction,
    pausedStack,
    resumeLastPaused,
    startBreak,
    deleteAction,
  };

  return <TasksContext.Provider value={value}>{children}</TasksContext.Provider>;
};

export const useTasks = () => {
  const ctx = useContext(TasksContext);
  if (!ctx) throw new Error('useTasks must be used within TasksProvider');
  return ctx;
};
