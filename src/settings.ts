import AsyncStorage from '@react-native-async-storage/async-storage';

const langKey = 'settings:lang'; // 'ja' | 'en'
const themeKey = 'settings:theme'; // 'system' | 'light' | 'dark'

export type Lang = 'ja' | 'en';
export type ThemePref = 'system' | 'light' | 'dark';

export async function getLanguage(): Promise<Lang> {
  const v = await AsyncStorage.getItem(langKey);
  return (v as Lang) || 'ja';
}

export async function setLanguage(lang: Lang): Promise<void> {
  await AsyncStorage.setItem(langKey, lang);
}

export async function getThemePref(): Promise<ThemePref> {
  const v = await AsyncStorage.getItem(themeKey);
  return (v as ThemePref) || 'system';
}

export async function setThemePref(pref: ThemePref): Promise<void> {
  await AsyncStorage.setItem(themeKey, pref);
}

