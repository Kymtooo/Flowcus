import React, { useEffect, useState } from 'react';
import { Alert, Modal, SafeAreaView, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useI18n } from '../i18n';
import { useThemeTokens } from '../ThemeContext';
import { getLanguage, setLanguage, getThemePref, setThemePref, Lang, ThemePref } from '../settings';
import { exportAll, importAll } from '../storage';
import { usePwaInstall } from '../pwaInstall';
import { useTasks } from '../context/TasksContext';

export default function SettingsScreen() {
  const { t } = useI18n();
  const { theme, setPref } = useThemeTokens();
  const { refresh } = useTasks();
  const [lang, setLang] = useState<Lang>('ja');
  const [pref, setPrefLocal] = useState<ThemePref>('system');
  const [exportModal, setExportModal] = useState(false);
  const [importModal, setImportModal] = useState(false);
  const [exportText, setExportText] = useState('');
  const [importText, setImportText] = useState('');
  const { canInstall, installed, promptInstall } = usePwaInstall();

  useEffect(() => { (async () => { setLang(await getLanguage()); setPrefLocal(await getThemePref()); })(); }, []);

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.bg }] }>
      <ScrollView contentContainerStyle={{ padding: 16 }}>
        <Text style={[styles.header, { color: theme.text }]}>{t('Settings')}</Text>

        <Text style={[styles.section, { color: theme.subtext }]}>{t('Language')}</Text>
        <View style={styles.row}>
          {(['ja','en'] as const).map(l => (
            <TouchableOpacity key={l} onPress={async () => { setLang(l); await setLanguage(l); }} style={[styles.chip, lang===l && { backgroundColor: theme.chipOnBg }]}>
              <Text style={{ color: theme.text }}>{l.toUpperCase()}</Text>
            </TouchableOpacity>
          ))}
        </View>

        <Text style={[styles.section, { color: theme.subtext }]}>{t('Theme')}</Text>
        <View style={styles.row}>
          {(['system','light','dark'] as const).map(p => (
            <TouchableOpacity key={p} onPress={async () => { setPrefLocal(p); await setThemePref(p); await setPref(p); }} style={[styles.chip, pref===p && { backgroundColor: theme.chipOnBg }]}>
              <Text style={{ color: theme.text }}>{t(p === 'system' ? 'System' : p === 'light' ? 'Light' : 'Dark')}</Text>
            </TouchableOpacity>
          ))}
        </View>

        <Text style={[styles.section, { color: theme.subtext }]}>Backup</Text>
        <View style={styles.row}>
          <TouchableOpacity onPress={async () => { const data = await exportAll(); setExportText(JSON.stringify(data, null, 2)); setExportModal(true); }} style={[styles.btn, { backgroundColor: theme.primary }]}>
            <Text style={styles.btnText}>{t('Export')}</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => setImportModal(true)} style={[styles.btn, { backgroundColor: theme.success }]}>
            <Text style={styles.btnText}>{t('Import')}</Text>
          </TouchableOpacity>
        </View>

        {/* PWA インストール（Webのみ有効） */}
        {canInstall ? (
          <View style={styles.row}>
            <TouchableOpacity onPress={promptInstall} style={[styles.btn, { backgroundColor: theme.primary }]}>
              <Text style={styles.btnText}>PWA をインストール</Text>
            </TouchableOpacity>
          </View>
        ) : installed ? (
          <Text style={{ color: theme.subtext }}>PWA はインストール済みです</Text>
        ) : null}

        <Modal visible={exportModal} animationType="slide" transparent>
          <View style={styles.modalBackdrop}>
            <View style={[styles.modalCard, { backgroundColor: theme.bg }] }>
              <Text style={[styles.title, { color: theme.text }]}>{t('Export')}</Text>
              <Text style={{ color: theme.subtext }}>{t('DataExportDesc')}</Text>
              <TextInput multiline value={exportText} onChangeText={setExportText} style={[styles.input, { color: theme.text, borderColor: theme.border }]} />
              <View style={{ flexDirection: 'row', justifyContent: 'flex-end' }}>
                <TouchableOpacity onPress={() => setExportModal(false)} style={[styles.btn, { backgroundColor: theme.gray }]}><Text style={styles.btnText}>{t('Close')}</Text></TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>

        <Modal visible={importModal} animationType="slide" transparent>
          <View style={styles.modalBackdrop}>
            <View style={[styles.modalCard, { backgroundColor: theme.bg }] }>
              <Text style={[styles.title, { color: theme.text }]}>{t('Import')}</Text>
              <Text style={{ color: theme.subtext }}>{t('DataImportDesc')}</Text>
              <TextInput multiline value={importText} onChangeText={setImportText} placeholder="{...}" placeholderTextColor={theme.subtext} style={[styles.input, { color: theme.text, borderColor: theme.border }]} />
              <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                <TouchableOpacity onPress={() => setImportModal(false)} style={[styles.btn, { backgroundColor: theme.gray }]}><Text style={styles.btnText}>{t('Close')}</Text></TouchableOpacity>
                <TouchableOpacity onPress={async () => { try { const obj = JSON.parse(importText); Alert.alert('確認', t('ConfirmImport'), [ { text: 'キャンセル', style: 'cancel' }, { text: 'OK', style: 'destructive', onPress: async () => { await importAll(obj); setImportModal(false); await refresh(); } } ]); } catch { Alert.alert('エラー', 'JSONの形式が不正です'); } }} style={[styles.btn, { backgroundColor: theme.danger }] }>
                  <Text style={styles.btnText}>{t('Import')}</Text>
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
  header: { fontSize: 24, fontWeight: '700', marginBottom: 12 },
  section: { fontSize: 14, marginTop: 8, marginBottom: 4 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 8 },
  chip: { paddingVertical: 8, paddingHorizontal: 12, backgroundColor: '#e5e7eb', borderRadius: 16 },
  btn: { paddingVertical: 10, paddingHorizontal: 14, borderRadius: 8 },
  btnText: { color: '#fff', fontWeight: '700' },
  modalBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.3)', justifyContent: 'center', padding: 16 },
  modalCard: { borderRadius: 12, padding: 16 },
  title: { fontSize: 18, fontWeight: '700', marginBottom: 8 },
  input: { minHeight: 180, borderWidth: 1, borderRadius: 8, padding: 10, marginTop: 8 },
});
