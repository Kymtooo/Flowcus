import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import TodayScreen from './src/screens/TodayScreen';
import TasksScreen from './src/screens/TasksScreen';
import LogScreen from './src/screens/LogScreen';
import LifeLogScreen from './src/screens/LifeLogScreen';
import { TasksProvider } from './src/context/TasksContext';
import { I18nProvider, useI18n } from './src/i18n';
import { ThemeProvider, useThemeTokens } from './src/ThemeContext';
import SettingsScreen from './src/screens/SettingsScreen';

const Tab = createBottomTabNavigator();

function Tabs() {
  const { t } = useI18n();
  const { theme } = useThemeTokens();
  return (
    <NavigationContainer>
      <Tab.Navigator screenOptions={{ headerShown: false, tabBarStyle: { backgroundColor: theme.card }, tabBarActiveTintColor: theme.primary }}>
        <Tab.Screen name="Today" component={TodayScreen} options={{ title: t('Today') }} />
        <Tab.Screen name="Routines" component={TasksScreen} options={{ title: t('Routines') }} />
        <Tab.Screen name="Log" component={LogScreen} options={{ title: t('Log') }} />
        <Tab.Screen name="LifeLog" component={LifeLogScreen} options={{ title: t('LifeLog') }} />
        <Tab.Screen name="Settings" component={SettingsScreen} options={{ title: t('Settings') }} />
      </Tab.Navigator>
    </NavigationContainer>
  );
}

export default function App() {
  return (
    <I18nProvider>
      <ThemeProvider>
        <TasksProvider>
          <Tabs />
        </TasksProvider>
      </ThemeProvider>
    </I18nProvider>
  );
}
