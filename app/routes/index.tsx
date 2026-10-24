import React, { useCallback, useState } from 'react';
import { Alert, FlatList, Modal, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { router, Stack, useFocusEffect } from 'expo-router';
import { useRoutesStore, type RouteSummary } from '@/store/useRoutesStore';
import { Button, Card, Empty } from '@/components/ui';
import { colors, spacing } from '@/theme';

function defaultRouteName(): string {
  const d = new Date();
  const dias = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  return `${dias[d.getDay()]} ${dd}/${mm}`;
}

export default function RoutesScreen() {
  const routes = useRoutesStore((s) => s.routes);
  const loadRoutes = useRoutesStore((s) => s.loadRoutes);
  const createRoute = useRoutesStore((s) => s.createRoute);
  const deleteRoute = useRoutesStore((s) => s.deleteRoute);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState('');

  useFocusEffect(
    useCallback(() => {
      void loadRoutes();
    }, [loadRoutes]),
  );

  const openCreate = () => {
    setName(defaultRouteName());
    setCreating(true);
  };

  const confirmCreate = async () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    const route = await createRoute(trimmed);
    setCreating(false);
    router.push({ pathname: '/routes/[id]', params: { id: route.id } });
  };

  const confirmDelete = (r: RouteSummary) => {
    Alert.alert('Excluir rota', `Excluir "${r.name}" e seus ${r.total} pontos?`, [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Excluir', style: 'destructive', onPress: () => void deleteRoute(r.id) },
    ]);
  };

  return (
    <View style={styles.container}>
      <Stack.Screen
        options={{
          headerRight: () => (
            <Pressable onPress={() => router.push('/settings')} hitSlop={8}>
              <Text style={styles.headerAction}>Ajustes</Text>
            </Pressable>
          ),
        }}
      />
      <FlatList
        data={routes}
        keyExtractor={(r) => r.id}
        contentContainerStyle={styles.list}
        ListEmptyComponent={
          <Empty title="Nenhuma rota ainda" subtitle="Crie uma rota e adicione os CEPs que você precisa visitar." />
        }
        renderItem={({ item }) => (
          <Pressable
            onPress={() => router.push({ pathname: '/routes/[id]', params: { id: item.id } })}
            onLongPress={() => confirmDelete(item)}
          >
            <Card style={styles.routeCard}>
              <View style={{ flex: 1 }}>
                <Text style={styles.routeName}>{item.name}</Text>
                <Text style={styles.routeMeta}>
                  {item.total === 0
                    ? 'Sem pontos'
                    : `${item.done}/${item.total} concluídos${item.optimizedAt ? ' · otimizada' : ''}`}
                </Text>
              </View>
              <Text style={styles.chevron}>›</Text>
            </Card>
          </Pressable>
        )}
      />
      <View style={styles.footer}>
        <Button title="Nova rota" onPress={openCreate} />
      </View>

      <Modal visible={creating} transparent animationType="fade" onRequestClose={() => setCreating(false)}>
        <View style={styles.modalBackdrop}>
          <Card style={styles.modalCard}>
            <Text style={styles.modalTitle}>Nome da rota</Text>
            <TextInput
              value={name}
              onChangeText={setName}
              autoFocus
              style={styles.input}
              placeholder="Ex.: Entregas de terça"
              onSubmitEditing={() => void confirmCreate()}
            />
            <View style={styles.modalActions}>
              <Button title="Cancelar" variant="ghost" onPress={() => setCreating(false)} />
              <Button title="Criar" onPress={() => void confirmCreate()} />
            </View>
          </Card>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  list: { padding: spacing.lg, gap: spacing.md, flexGrow: 1 },
  routeCard: { flexDirection: 'row', alignItems: 'center' },
  routeName: { fontSize: 16, fontWeight: '600', color: colors.text },
  routeMeta: { fontSize: 13, color: colors.muted, marginTop: 2 },
  chevron: { fontSize: 24, color: colors.muted },
  footer: { padding: spacing.lg, borderTopWidth: 1, borderColor: colors.border, backgroundColor: colors.card },
  headerAction: { color: '#fff', fontWeight: '600' },
  modalBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'center', padding: spacing.xl },
  modalCard: { gap: spacing.md },
  modalTitle: { fontSize: 17, fontWeight: '700', color: colors.text },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    padding: 12,
    fontSize: 16,
    color: colors.text,
  },
  modalActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: spacing.sm },
});
