import React, { useEffect, useMemo, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import MapView, { Marker, Polyline, PROVIDER_GOOGLE } from 'react-native-maps';
import type { LatLng, Stop } from '@/db/types';
import { fetchDirections } from '@/services/directions';
import { colors } from '@/theme';

interface Props {
  stops: Stop[];
  start: LatLng | null;
}

type Located = Stop & { lat: number; lng: number };

export function RouteMap({ stops, start }: Props) {
  const mapRef = useRef<MapView>(null);
  const located = useMemo(
    () => stops.filter((s): s is Located => s.lat !== null && s.lng !== null && !s.done),
    [stops],
  );
  const ordered = useMemo(
    () => [...located].sort((a, b) => (a.sequence ?? 9999) - (b.sequence ?? 9999)),
    [located],
  );
  const path = useMemo<LatLng[]>(() => {
    const pts = ordered.map((s) => ({ lat: s.lat, lng: s.lng }));
    return start ? [start, ...pts] : pts;
  }, [ordered, start]);

  const hasSequence = ordered.some((s) => s.sequence !== null);
  // Chave do caminho atual: geometria antiga só é usada se pertencer a este caminho.
  const pathKey = useMemo(() => path.map((p) => `${p.lat},${p.lng}`).join('|'), [path]);
  const [road, setRoad] = useState<{ key: string; geometry: LatLng[] } | null>(null);
  const roadGeometry = road?.key === pathKey ? road.geometry : null;

  useEffect(() => {
    if (!hasSequence || path.length < 2) return;
    let cancelled = false;
    void fetchDirections(path).then((d) => {
      if (!cancelled && d) setRoad({ key: pathKey, geometry: d.geometry });
    });
    return () => {
      cancelled = true;
    };
  }, [path, pathKey, hasSequence]);

  useEffect(() => {
    if (!mapRef.current || path.length === 0) return;
    const coords = path.map((p) => ({ latitude: p.lat, longitude: p.lng }));
    const t = setTimeout(
      () => mapRef.current?.fitToCoordinates(coords, { edgePadding: { top: 60, right: 40, bottom: 60, left: 40 }, animated: true }),
      300,
    );
    return () => clearTimeout(t);
  }, [path]);

  if (path.length === 0) {
    return (
      <View style={styles.placeholder}>
        <Text style={styles.placeholderText}>Nenhum ponto com localização para exibir no mapa.</Text>
      </View>
    );
  }

  const line = roadGeometry ?? (hasSequence ? path : null);

  return (
    <MapView
      ref={mapRef}
      style={styles.map}
      provider={PROVIDER_GOOGLE}
      initialRegion={{
        latitude: path[0].lat,
        longitude: path[0].lng,
        latitudeDelta: 0.05,
        longitudeDelta: 0.05,
      }}
      showsUserLocation
    >
      {start ? (
        <Marker coordinate={{ latitude: start.lat, longitude: start.lng }} title="Início" pinColor={colors.success} />
      ) : null}
      {ordered.map((s, i) => (
        <Marker
          key={s.id}
          coordinate={{ latitude: s.lat, longitude: s.lng }}
          title={s.label ?? s.street}
          description={`${s.street}${s.number ? ', ' + s.number : ''}`}
        >
          <View style={styles.pin}>
            <Text style={styles.pinText}>{s.sequence ?? i + 1}</Text>
          </View>
        </Marker>
      ))}
      {line ? (
        <Polyline
          coordinates={line.map((p) => ({ latitude: p.lat, longitude: p.lng }))}
          strokeColor={colors.primary}
          strokeWidth={4}
          lineDashPattern={roadGeometry ? undefined : [8, 8]}
        />
      ) : null}
    </MapView>
  );
}

const styles = StyleSheet.create({
  map: { flex: 1 },
  placeholder: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  placeholderText: { color: colors.muted, textAlign: 'center' },
  pin: {
    backgroundColor: colors.primary,
    borderRadius: 14,
    minWidth: 28,
    height: 28,
    paddingHorizontal: 6,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#fff',
  },
  pinText: { color: '#fff', fontWeight: '700', fontSize: 13 },
});
