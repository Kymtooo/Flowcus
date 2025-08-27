import AsyncStorage from '@react-native-async-storage/async-storage';
import dayjs from 'dayjs';
import { Platform } from 'react-native';
import { DayTask } from './types';

const keyStart = (dateISO: string, id: string) => `ns:start:${dateISO}:${id}`;
const keyOver = (dateISO: string, id: string) => `ns:over:${dateISO}:${id}`;
const keyBreak = (dateISO: string, id: string) => `ns:break:${dateISO}:${id}`;

async function getNotifications() {
  if (Platform.OS === 'web') return null as any;
  try {
    const mod = await import('expo-notifications');
    return mod as typeof import('expo-notifications');
  } catch {
    return null as any;
  }
}

export async function ensurePermission() {
  const Notifications = await getNotifications();
  if (!Notifications) return;
  try {
    // Foregroundで表示
    Notifications.setNotificationHandler({
      handleNotification: async () => ({ shouldShowAlert: true, shouldPlaySound: false, shouldSetBadge: false }),
    });
    const settings = await Notifications.getPermissionsAsync();
    if (!settings.granted) {
      await Notifications.requestPermissionsAsync();
    }
    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('default', {
        name: 'default', importance: Notifications.AndroidImportance.DEFAULT,
      });
    }
  } catch (e) {
    // no-op（Web等で非対応でも落ちないように）
  }
}

export async function cancelByKey(storageKey: string) {
  const Notifications = await getNotifications();
  if (!Notifications) return;
  try {
    const id = await AsyncStorage.getItem(storageKey);
    if (id) await Notifications.cancelScheduledNotificationAsync(id);
    await AsyncStorage.removeItem(storageKey);
  } catch {}
}

export async function scheduleStartReminder(task: DayTask) {
  const Notifications = await getNotifications();
  if (!Notifications) return;
  try {
    if (!task.scheduledAt) return;
    const dateStr = task.date;
    const [hh, mm] = task.scheduledAt.split(':').map((v) => parseInt(v, 10));
    const when = dayjs(task.date).hour(hh).minute(mm).second(0).millisecond(0);
    if (when.isBefore(dayjs())) return; // 未来のみ
    const skey = keyStart(dateStr, task.id);
    await cancelByKey(skey);
    const id = await Notifications.scheduleNotificationAsync({
      content: { title: '開始予定', body: task.title },
      trigger: when.toDate(),
    });
    await AsyncStorage.setItem(skey, id);
  } catch {}
}

export async function cancelStartReminder(taskId: string, dateISO: string) {
  await cancelByKey(keyStart(dateISO, taskId));
}

export async function scheduleOverdueReminder(task: DayTask, startAtMs: number) {
  const Notifications = await getNotifications();
  if (!Notifications) return;
  try {
    const planned = task.plannedMinutes || 0;
    if (planned <= 0) return;
    const fireAt = startAtMs + planned * 60000;
    if (fireAt <= Date.now()) return;
    const okey = keyOver(task.date, task.id);
    await cancelByKey(okey);
    const id = await Notifications.scheduleNotificationAsync({
      content: { title: '予定超過', body: `${task.title} が予定を超過しました` },
      trigger: new Date(fireAt),
    });
    await AsyncStorage.setItem(okey, id);
  } catch {}
}

export async function cancelOverdueReminder(taskId: string, dateISO: string) {
  await cancelByKey(keyOver(dateISO, taskId));
}

export async function scheduleBreakEnd(minutes: number) {
  const Notifications = await getNotifications();
  if (!Notifications) return;
  try {
    const fireAt = Date.now() + Math.max(1, minutes) * 60000;
    const id = await Notifications.scheduleNotificationAsync({
      content: { title: '休憩終了', body: 'そろそろ再開しませんか？' },
      trigger: new Date(fireAt),
    });
    // キー保存は用途に応じて。現状は保存不要
    return id;
  } catch {}
}
