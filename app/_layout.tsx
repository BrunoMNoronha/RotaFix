import React, { useEffect } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SQLiteProvider, useSQLiteContext } from 'expo-sqlite';
import { DB_NAME, migrate } from '@/db/client';
import { Repo } from '@/db/repo';
import { useRoutesStore } from '@/store/useRoutesStore';
import { colors } from '@/theme';

function StoreBinder({ children }: { children: React.ReactNode }) {
  const db = useSQLiteContext();
  const ready = useRoutesStore((s) => s.repo !== null);
  const init = useRoutesStore((s) => s.init);

  useEffect(() => {
    void init(new Repo(db));
  }, [db, init]);

  if (!ready) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.background }}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }
  return <>{children}</>;
}

export default function RootLayout() {
  return (
    <SQLiteProvider databaseName={DB_NAME} onInit={migrate}>
      <StoreBinder>
        <StatusBar style="light" />
        <Stack
          screenOptions={{
            headerStyle: { backgroundColor: colors.primary },
            headerTintColor: '#fff',
            headerTitleStyle: { fontWeight: '700' },
            contentStyle: { backgroundColor: colors.background },
          }}
        >
          <Stack.Screen name="index" options={{ headerShown: false }} />
          <Stack.Screen name="routes/index" options={{ title: 'Minhas rotas' }} />
          <Stack.Screen name="routes/[id]/index" options={{ title: 'Rota' }} />
          <Stack.Screen name="routes/[id]/add" options={{ title: 'Adicionar CEP', presentation: 'modal' }} />
          <Stack.Screen name="routes/[id]/scan" options={{ title: 'Ler etiqueta', presentation: 'fullScreenModal' }} />
          <Stack.Screen name="settings" options={{ title: 'Ajustes' }} />
        </Stack>
      </StoreBinder>
    </SQLiteProvider>
  );
}
