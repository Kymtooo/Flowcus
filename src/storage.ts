import AsyncStorage from '@react-native-async-storage/async-storage';
import { RunEntry, Routine, DayTask, Section } from './types';
import dayjs from 'dayjs';

const routinesKey = 'tasks:v1'; // 互換のため key 名は据え置き
const dayTasksKey = (dateISO: string) => `dayTasks:${dateISO}`;
const pipelineKey = (dateISO: string) => `pipeline:${dateISO}`;
const runsKey = (dateISO: string) => `runs:${dateISO}`;
const doneKey = (dateISO: string) => `done:${dateISO}`;
const currentRunKey = 'currentRun:v1';
const sectionsKey = 'sections:v1';
const projectsKey = 'projects:v1';
const dayAggKey = (dateISO: string) => `agg:${dateISO}`;
const appliedKey = (dateISO: string) => `applied:${dateISO}`;
const projectColorsKey = 'projectColors:v1';

// Routines (master)
export async function getRoutines(): Promise<Routine[]> {
  const json = await AsyncStorage.getItem(routinesKey);
  return json ? (JSON.parse(json) as Routine[]) : [];
}

export async function saveRoutines(list: Routine[]): Promise<void> {
  await AsyncStorage.setItem(routinesKey, JSON.stringify(list));
}

// Day tasks (per day instances)
export async function getDayTasks(date = dayjs().format('YYYY-MM-DD')): Promise<DayTask[]> {
  const json = await AsyncStorage.getItem(dayTasksKey(date));
  return json ? (JSON.parse(json) as DayTask[]) : [];
}

export async function saveDayTasks(list: DayTask[], date = dayjs().format('YYYY-MM-DD')): Promise<void> {
  await AsyncStorage.setItem(dayTasksKey(date), JSON.stringify(list));
  await recomputeDayAgg(date);
}

// Sections (global)
export async function getSections(): Promise<Section[]> {
  const json = await AsyncStorage.getItem(sectionsKey);
  const list = json ? (JSON.parse(json) as any[]) : [];
  // 後方互換: endAt がない既存データに既定値を補完
  return list.map((s) => ({
    ...s,
    endAt: s.endAt ?? '23:59',
  })) as Section[];
}

export async function saveSections(list: Section[]): Promise<void> {
  await AsyncStorage.setItem(sectionsKey, JSON.stringify(list));
}

// Projects (global list of names)
export async function getProjects(): Promise<string[]> {
  const json = await AsyncStorage.getItem(projectsKey);
  return json ? (JSON.parse(json) as string[]) : [];
}

export async function saveProjects(list: string[]): Promise<void> {
  await AsyncStorage.setItem(projectsKey, JSON.stringify(list));
}

// Project color mapping (for stable colors in LifeLog etc.)
export async function getProjectColors(): Promise<Record<string, string>> {
  const json = await AsyncStorage.getItem(projectColorsKey);
  return json ? (JSON.parse(json) as Record<string, string>) : {};
}

export async function saveProjectColors(map: Record<string, string>): Promise<void> {
  await AsyncStorage.setItem(projectColorsKey, JSON.stringify(map));
}

export async function getPipeline(date = dayjs().format('YYYY-MM-DD')): Promise<string[]> {
  const json = await AsyncStorage.getItem(pipelineKey(date));
  return json ? (JSON.parse(json) as string[]) : [];
}

export async function savePipeline(order: string[], date = dayjs().format('YYYY-MM-DD')): Promise<void> {
  await AsyncStorage.setItem(pipelineKey(date), JSON.stringify(order));
}

export async function getRuns(date = dayjs().format('YYYY-MM-DD')): Promise<RunEntry[]> {
  const json = await AsyncStorage.getItem(runsKey(date));
  return json ? (JSON.parse(json) as RunEntry[]) : [];
}

export async function appendRun(newRun: RunEntry, date = dayjs().format('YYYY-MM-DD')): Promise<void> {
  // 日跨ぎ対応: startAt..endAt を日単位に分割してそれぞれのキーへ保存
  const segments: { startAt: number; endAt: number; dateStr: string; notes?: string }[] = [];
  let segStart = newRun.startAt;
  const finalEnd = newRun.endAt;
  while (segStart < finalEnd) {
    const dateStr = dayjs(segStart).format('YYYY-MM-DD');
    const nextMidnight = dayjs(segStart).startOf('day').add(1, 'day').valueOf();
    const segEnd = Math.min(finalEnd, nextMidnight);
    segments.push({ startAt: segStart, endAt: segEnd, dateStr });
    segStart = segEnd;
  }
  // 最終セグメントにのみ notes を付与（重複表示を避ける）
  if (segments.length) {
    segments[segments.length - 1].notes = newRun.notes;
  }
  for (const seg of segments) {
    const list = await getRuns(seg.dateStr);
    list.push({ id: `${newRun.taskId}:${seg.startAt}`, taskId: newRun.taskId, startAt: seg.startAt, endAt: seg.endAt, notes: seg.notes });
    await AsyncStorage.setItem(runsKey(seg.dateStr), JSON.stringify(list));
    await recomputeDayAgg(seg.dateStr);
  }
}

export async function saveRuns(list: RunEntry[], date = dayjs().format('YYYY-MM-DD')): Promise<void> {
  await AsyncStorage.setItem(runsKey(date), JSON.stringify(list));
  await recomputeDayAgg(date);
}

export type CurrentRun = { taskId: string; startAt: number } | null;

export async function getCurrentRun(): Promise<CurrentRun> {
  const json = await AsyncStorage.getItem(currentRunKey);
  return json ? (JSON.parse(json) as CurrentRun) : null;
}

export async function setCurrentRun(run: CurrentRun): Promise<void> {
  if (run) await AsyncStorage.setItem(currentRunKey, JSON.stringify(run));
  else await AsyncStorage.removeItem(currentRunKey);
}

// 今日の完了扱いID
export async function getDone(date = dayjs().format('YYYY-MM-DD')): Promise<string[]> {
  const json = await AsyncStorage.getItem(doneKey(date));
  return json ? (JSON.parse(json) as string[]) : [];
}

export async function setDone(ids: string[], date = dayjs().format('YYYY-MM-DD')): Promise<void> {
  await AsyncStorage.setItem(doneKey(date), JSON.stringify(ids));
}

// Export / Import
const EXPORT_PREFIXES = [
  'tasks:v1', 'sections:v1', 'projects:v1', 'currentRun:v1',
  'dayTasks:', 'pipeline:', 'runs:', 'done:', 'agg:', 'applied:'
];

export type ExportBundle = { version: string; data: Record<string, any> };

export async function exportAll(): Promise<ExportBundle> {
  const keys = await AsyncStorage.getAllKeys();
  const pick = keys.filter(k => EXPORT_PREFIXES.some(p => k.startsWith(p)));
  const out: Record<string, any> = {};
  const pairs = await AsyncStorage.multiGet(pick);
  for (const [k, v] of pairs) {
    if (k && v) {
      try { out[k] = JSON.parse(v); } catch { out[k] = v; }
    }
  }
  return { version: 'flowcus:1', data: out };
}

export async function importAll(bundle: ExportBundle): Promise<void> {
  if (!bundle || bundle.version !== 'flowcus:1' || !bundle.data) throw new Error('Invalid bundle');
  const keys = await AsyncStorage.getAllKeys();
  const toRemove = keys.filter(k => EXPORT_PREFIXES.some(p => k.startsWith(p)));
  if (toRemove.length) await AsyncStorage.multiRemove(toRemove);
  const sets: [string, string][] = [];
  for (const [k, v] of Object.entries(bundle.data)) {
    sets.push([k, JSON.stringify(v)]);
  }
  if (sets.length) await AsyncStorage.multiSet(sets);
}

// 日次集計
export type DayAggMap = Record<string, { planned: number; actual: number }>;

export async function getDayAgg(date = dayjs().format('YYYY-MM-DD')): Promise<DayAggMap> {
  const json = await AsyncStorage.getItem(dayAggKey(date));
  return json ? (JSON.parse(json) as DayAggMap) : {};
}

export async function saveDayAgg(map: DayAggMap, date = dayjs().format('YYYY-MM-DD')): Promise<void> {
  await AsyncStorage.setItem(dayAggKey(date), JSON.stringify(map));
}

export async function recomputeDayAgg(date = dayjs().format('YYYY-MM-DD')): Promise<void> {
  const [tasks, runs] = await Promise.all([getDayTasks(date), getRuns(date)]);
  const projOfTask: Record<string, string> = {};
  for (const t of tasks) projOfTask[t.id] = t.project || '（未設定）';
  const map: DayAggMap = {};
  for (const t of tasks) {
    const key = t.project || '（未設定）';
    if (!map[key]) map[key] = { planned: 0, actual: 0 };
    map[key].planned += t.plannedMinutes || 0;
  }
  for (const r of runs) {
    const key = projOfTask[r.taskId] || '（未設定）';
    if (!map[key]) map[key] = { planned: 0, actual: 0 };
    const mins = Math.max(0, Math.round((r.endAt - r.startAt) / 60000));
    map[key].actual += mins;
  }
  await saveDayAgg(map, date);
}

// 自動展開フラグ（重複展開防止）
export async function getAppliedFlag(date = dayjs().format('YYYY-MM-DD')): Promise<boolean> {
  const v = await AsyncStorage.getItem(appliedKey(date));
  return v === '1';
}

export async function setAppliedFlag(date = dayjs().format('YYYY-MM-DD')): Promise<void> {
  await AsyncStorage.setItem(appliedKey(date), '1');
}
