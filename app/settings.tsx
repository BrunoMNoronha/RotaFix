import React, { useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text } from 'react-native';
import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import * as DocumentPicker from 'expo-document-picker';
import { useRoutesStore } from '@/store/useRoutesStore';
import type { Route, Stop } from '@/db/types';
import { Button, Card } from '@/components/ui';
import { colors, spacing } from '@/theme';

interface Backup {
  version: 1;
  exportedAt: number;
  routes: Route[];
  stops: Stop[];
}

export default function SettingsScreen() {
  const repo = useRoutesStore((s) => s.repo);
  const loadRoutes = useRoutesStore((s) => s.loadRoutes);
  const [busy, setBusy] = useState(false);

  const exportBackup = async () => {
    if (!repo) return;
    setBusy(true);
    try {
      const data = await repo.exportAll();
      const backup: Backup = { version: 1, exportedAt: Date.now(), ...data };
      const stamp = new Date().toISOString().slice(0, 10);
      const file = new File(Paths.cache, `rotafix-backup-${stamp}.json`);
      if (file.exists) file.delete();
      file.create();
      await file.write(JSON.stringify(backup, null, 2));
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(file.uri, { mimeType: 'application/json', dialogTitle: 'Exportar backup' });
      } else {
        Alert.alert('Backup salvo', file.uri);
      }
    } catch (e) {
      Alert.alert('Erro ao exportar', e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const importBackup = async () => {
    if (!repo) return;
    const picked = await DocumentPicker.getDocumentAsync({ type: 'application/json', copyToCacheDirectory: true });
    if (picked.canceled || !picked.assets?.length) return;
    setBusy(true);
    try {
      const file = new File(picked.assets[0].uri);
      const parsed = JSON.parse(await file.text()) as Partial<Backup>;
      if (!Array.isArray(parsed.routes) || !Array.isArray(parsed.stops)) {
        throw new Error('Arquivo não parece um backup do RotaFix');
      }
      await repo.importAll({ routes: parsed.routes, stops: parsed.stops });
      await loadRoutes();
      Alert.alert('Importado', `${parsed.routes.length} rotas e ${parsed.stops.length} pontos.`);
    } catch (e) {
      Alert.alert('Erro ao importar', e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Card style={styles.card}>
        <Text style={styles.title}>Backup</Text>
        <Text style={styles.text}>
          Exporte suas rotas e pontos em um arquivo JSON para guardar ou transferir para outro aparelho.
        </Text>
        <Button title="Exportar backup" onPress={() => void exportBackup()} loading={busy} />
        <Button title="Importar backup" variant="secondary" onPress={() => void importBackup()} disabled={busy} />
      </Card>

      <Card style={styles.card}>
        <Text style={styles.title}>Sobre</Text>
        <Text style={styles.text}>
          RotaFix organiza a ordem de visita dos seus CEPs. Endereços via ViaCEP/BrasilAPI, coordenadas via
          OpenStreetMap (Nominatim), traçado via OSRM. A navegação abre no Google Maps ou Waze.
        </Text>
      </Card>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: spacing.lg, gap: spacing.lg },
  card: { gap: spacing.md },
  title: { fontSize: 17, fontWeight: '700', color: colors.text },
  text: { fontSize: 14, color: colors.muted, lineHeight: 20 },
});
