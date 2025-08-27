export type Routine = {
  id: string;
  title: string;
  plannedMinutes: number;
  color?: string;
  order: number;
  isTemplate?: boolean;
  project?: string;
  plannedStartAt?: string; // 'HH:mm' optional
  url?: string;
  flagged?: boolean;
  days?: number[]; // 0(Sun)..6(Sat) 自動展開の対象曜日（任意）
};

export type DayTask = {
  id: string; // per-day instance id
  routineId?: string; // source routine id (optional for ad-hoc)
  title: string;
  plannedMinutes: number;
  color?: string;
  order: number;
  project?: string;
  scheduledAt?: string; // 'HH:mm'
  date: string; // 'YYYY-MM-DD'
  url?: string;
  flagged?: boolean;
  sectionId?: string;
};

export type Section = {
  id: string;
  name: string;
  startAt: string; // 'HH:mm'
  endAt: string;   // 'HH:mm'
  order: number;
};

export type RunEntry = {
  id: string;
  taskId: string; // refers to DayTask.id
  startAt: number; // epoch ms
  endAt: number; // epoch ms
  notes?: string;
};
