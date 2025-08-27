import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { useColorScheme } from 'react-native';
import { getThemePref, setThemePref, ThemePref } from './settings';

export type ThemeTokens = {
  isDark: boolean;
  bg: string;
  card: string;
  text: string;
  subtext: string;
  border: string;
  chipBg: string;
  chipOnBg: string;
  primary: string;
  danger: string;
  success: string;
  gray: string;
};

function tokens(isDark: boolean): ThemeTokens {
  return {
    isDark,
    bg: isDark ? '#0b0f14' : '#fff',
    card: isDark ? '#13202e' : '#f9fafb',
    text: isDark ? '#e6edf3' : '#111827',
    subtext: isDark ? '#9fb2c1' : '#6b7280',
    border: isDark ? '#253041' : '#e5e7eb',
    chipBg: isDark ? '#1f2a37' : '#e5e7eb',
    chipOnBg: isDark ? '#334155' : '#93c5fd',
    primary: '#2563eb',
    danger: '#ef4444',
    success: '#10b981',
    gray: '#6b7280',
  };
}

type Ctx = { pref: ThemePref; setPref: (p: ThemePref) => Promise<void>; theme: ThemeTokens };
const ThemeContext = createContext<Ctx | undefined>(undefined);

export const ThemeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const system = useColorScheme();
  const [pref, setPrefState] = useState<ThemePref>('system');
  useEffect(() => { (async () => setPrefState(await getThemePref()))(); }, []);
  const isDark = (pref === 'system' ? system === 'dark' : pref === 'dark');
  const theme = useMemo(() => tokens(!!isDark), [isDark]);
  const setPref = async (p: ThemePref) => { setPrefState(p); await setThemePref(p); };
  return <ThemeContext.Provider value={{ pref, setPref, theme }}>{children}</ThemeContext.Provider>;
};

export function useThemeTokens() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useThemeTokens must be used within ThemeProvider');
  return ctx;
}

