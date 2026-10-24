import React, { useCallback, useMemo, useState } from 'react';
import { Alert, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { router, Stack, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { needsGeocodeRetry, useRoutesStore } from '@/store/useRoutesStore';
import type { LatLng, Stop } from '@/db/types';
import { getCurrentLatLng, LocationPermissionError } from '@/services/location';
import { chunkForGoogle, openNavigation, openWaze } from '@/services/navigation';
import { formatDistance } from '@/utils/haversine';
import { StopCard } from '@/components/StopCard';
import { RouteMap } from '@/components/RouteMap';
import { Banner, Button, Empty } from '@/components/ui';
import { colors, spacing } from '@/theme';

type Located = Stop & { lat: number; lng: number };

const EMPTY_STOPS: Stop[] = [];

export default function RouteDetailScreen() {
  const { id: routeId } = useLocalSearchParams<{ id: string }>();
  const route = useRoutesStore((s) => s.routes.find((r) => r.id === routeId));
  const stops = useRoutesStore((s) => (routeId ? s.stops[routeId] : undefined) ?? EMPTY_STOPS);
  const geocoding = useRoutesStore((s) => s.geocoding);
  const loadStops = useRoutesStore((s) => s.loadStops);
  const toggleDone = useRoutesStore((s) => s.toggleDone);
  const deleteStop = useRoutesStore((s) => s.deleteStop);
  const geocodeStop = useRoutesStore((s) => s.geocodeStop);
  const retryPendingGeocodes = useRoutesStore((s) => s.retryPendingGeocodes);
  const optimize = useRoutesStore((s) => s.optimize);
  const setRouteStart = useRoutesStore((s) => s.setRouteStart);

  const [view, setView] = useState<'list' | 'map'>('list');
  const [optimizing, setOptimizing] = useState(false);
  const [start, setStart] = useState<LatLng | null>(
    route?.startLat != null && route?.startLng != null ? { lat: route.startLat, lng: route.startLng } : null,
  );

  useFocusEffect(
    useCallback(() => {
      if (routeId) void loadStops(routeId);
    }, [routeId, loadStops]),
  );

  const missingCount = useMemo(() => stops.filter((s) => s.geocodeStatus !== 'ok').length, [stops]);
  const approxCount = useMemo(() => stops.filter((s) => s.geocodeStatus === 'ok' && needsGeocodeRetry(s)).length, [stops]);
  const pendingCount = missingCount + approxCount;
  const orderedOpen = useMemo(
    () =>
      stops
        .filter((s): s is Located => !s.done && s.lat !== null && s.lng !== null && s.sequence !== null)
        .sort((a, b) => (a.sequence ?? 0) - (b.sequence ?? 0)),
    [stops],
  );

  const resolveStart = async (): Promise<LatLng | null> => {
    if (start) return start;
    try {
      const pos = await getCurrentLatLng();
      setStart(pos);
      return pos;
    } catch (e) {
      if (e instanceof LocationPermissionError) {
        Alert.alert(
          'Sem localização',
          'Permita o acesso à localização ou defina um ponto inicial fixo (toque longo em um ponto da lista).',
        );
      } else {
        const detail = e instanceof Error ? e.message : 'Não foi possível obter sua posição.';
        Alert.alert('Erro de GPS', `${detail}\n\nVocê também pode definir um ponto inicial fixo com toque longo em um ponto da lista.`);
      }
      return null;
    }
  };

  const handleOptimize = async () => {
    if (!routeId) return;
    setOptimizing(true);
    try {
      const origin = await resolveStart();
      if (!origin) return;
      const result = await optimize(routeId, origin);
      const msg =
        `Percurso estimado: ${formatDistance(result.totalDistance)} (linha reta).` +
        (result.skipped > 0 ? `\n${result.skipped} ponto(s) sem localização ou concluído(s) ficaram de fora.` : '');
      Alert.alert('Rota otimizada', msg);
    } finally {
      setOptimizing(false);
    }
  };

  const navigateTo = (stop: Located) => {
    Alert.alert('Navegar', `${stop.label ?? stop.street}${stop.number ? ', ' + stop.number : ''}`, [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Waze',
        onPress: async () => {
          const ok = await openWaze(stop);
          if (!ok) Alert.alert('Waze não instalado');
        },
      },
      { text: 'Google Maps', onPress: () => void openNavigation(stop) },
    ]);
  };

  const navigateAll = () => {
    if (orderedOpen.length === 0) return;
    const chunks = chunkForGoogle(orderedOpen.map((s) => ({ lat: s.lat, lng: s.lng })));
    const first = chunks[0];
    const dest = first[first.length - 1];
    const waypoints = first.slice(0, -1);
    const extra = chunks.length > 1 ? `\n\nO Google Maps aceita até 10 paradas por vez; esta é a parte 1 de ${chunks.length}.` : '';
    Alert.alert('Abrir rota completa', `${first.length} paradas no Google Maps.${extra}`, [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Abrir', onPress: () => void openNavigation(dest, waypoints) },
    ]);
  };

  const confirmDelete = (stop: Stop) => {
    if (!routeId) return;
    Alert.alert('Remover ponto', `Remover ${stop.label ?? stop.street}?`, [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Remover', style: 'destructive', onPress: () => void deleteStop(routeId, stop.id) },
    ]);
  };

  const setAsStart = (stop: Stop) => {
    if (!routeId || stop.lat === null || stop.lng === null) return;
    Alert.alert('Ponto inicial', `Usar "${stop.label ?? stop.street}" como início da rota?`, [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Usar GPS atual',
        onPress: () => {
          setStart(null);
          void setRouteStart(routeId, null);
        },
      },
      {
        text: 'Definir',
        onPress: () => {
          const p = { lat: stop.lat as number, lng: stop.lng as number };
          setStart(p);
          void setRouteStart(routeId, p);
        },
      },
    ]);
  };

  if (!routeId) return null;

  return (
    <View style={styles.container}>
      <Stack.Screen
        options={{
          title: route?.name ?? 'Rota',
          headerRight: () => (
            <Pressable onPress={() => setView((v) => (v === 'list' ? 'map' : 'list'))} hitSlop={8}>
              <Text style={styles.headerAction}>{view === 'list' ? 'Mapa' : 'Lista'}</Text>
            </Pressable>
          ),
        }}
      />

      {pendingCount > 0 ? (
        <View style={styles.bannerWrap}>
          <Banner
            text={
              missingCount > 0 && approxCount > 0
                ? `${missingCount} ponto(s) sem localização e ${approxCount} com local aproximado.`
                : missingCount > 0
                  ? `${missingCount} ponto(s) sem localização no mapa.`
                  : `${approxCount} ponto(s) com local aproximado.`
            }
            action={{ title: 'Tentar novamente', onPress: () => void retryPendingGeocodes(routeId) }}
          />
        </View>
      ) : null}

      {view === 'map' ? (
        <RouteMap stops={stops} start={start} />
      ) : (
        <FlatList
          data={stops}
          keyExtractor={(s) => s.id}
          contentContainerStyle={styles.list}
          ListEmptyComponent={
            <Empty title="Nenhum ponto nesta rota" subtitle='Toque em "Adicionar CEP" para começar.' />
          }
          renderItem={({ item }) => (
            <Pressable onLongPress={() => setAsStart(item)}>
              <StopCard
                stop={item}
                geocoding={geocoding[item.id]}
                onToggleDone={() => void toggleDone(routeId, item.id)}
                onNavigate={() => navigateTo(item as Located)}
                onDelete={() => confirmDelete(item)}
                onRetryGeocode={() => void geocodeStop(routeId, item)}
              />
            </Pressable>
          )}
        />
      )}

      <View style={styles.footer}>
        {start ? <Text style={styles.startHint}>Início fixo definido · toque longo em um ponto para alterar</Text> : null}
        <View style={styles.footerRow}>
          <Button
            title="Adicionar CEP"
            variant="secondary"
            style={{ flex: 1 }}
            onPress={() => router.push({ pathname: '/routes/[id]/add', params: { id: routeId } })}
          />
          <Button
            title="Otimizar"
            style={{ flex: 1 }}
            onPress={() => void handleOptimize()}
            loading={optimizing}
            disabled={stops.filter((s) => !s.done && s.lat !== null).length < 2}
          />
        </View>
        {orderedOpen.length > 0 ? (
          <Button title={`Navegar rota (${orderedOpen.length} paradas)`} variant="ghost" onPress={navigateAll} />
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  list: { padding: spacing.lg, gap: spacing.md, flexGrow: 1 },
  bannerWrap: { paddingHorizontal: spacing.lg, paddingTop: spacing.md },
  footer: {
    padding: spacing.lg,
    gap: spacing.sm,
    borderTopWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
  },
  footerRow: { flexDirection: 'row', gap: spacing.md },
  startHint: { fontSize: 12, color: colors.muted, textAlign: 'center' },
  headerAction: { color: '#fff', fontWeight: '600' },
});
