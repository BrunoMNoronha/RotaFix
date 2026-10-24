import React from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import type { Stop } from '@/db/types';
import { formatCep } from '@/utils/cep';
import { colors, radius, spacing } from '@/theme';

interface Props {
  stop: Stop;
  geocoding?: boolean;
  onToggleDone: () => void;
  onNavigate: () => void;
  onDelete: () => void;
  onRetryGeocode: () => void;
}

export function StopCard({ stop, geocoding, onToggleDone, onNavigate, onDelete, onRetryGeocode }: Props) {
  const title = stop.label?.trim() || stop.street || formatCep(stop.cep);
  const addressLine = [stop.street, stop.number].filter(Boolean).join(', ');
  const cityLine = [stop.neighborhood, stop.city && `${stop.city}/${stop.state}`].filter(Boolean).join(' · ');
  const hasCoords = stop.lat !== null && stop.lng !== null;

  return (
    <View style={[styles.card, stop.done && styles.cardDone]}>
      <Pressable onPress={onToggleDone} style={styles.badgeWrap} hitSlop={8}>
        <View style={[styles.badge, stop.done ? styles.badgeDone : hasCoords ? styles.badgeOk : styles.badgePending]}>
          <Text style={styles.badgeText}>{stop.done ? '✓' : stop.sequence ?? '•'}</Text>
        </View>
      </Pressable>

      <View style={styles.body}>
        <Text style={[styles.title, stop.done && styles.strike]} numberOfLines={1}>
          {title}
        </Text>
        {addressLine && addressLine !== title ? (
          <Text style={styles.line} numberOfLines={1}>
            {addressLine}
          </Text>
        ) : null}
        <Text style={styles.line} numberOfLines={1}>
          {cityLine || formatCep(stop.cep)}
          {stop.complement ? ` · ${stop.complement}` : ''}
        </Text>

        {geocoding ? (
          <View style={styles.status}>
            <ActivityIndicator size="small" color={colors.muted} />
            <Text style={styles.statusText}>Localizando…</Text>
          </View>
        ) : !hasCoords ? (
          <Pressable onPress={onRetryGeocode} style={styles.status}>
            <Text style={[styles.statusText, { color: colors.warning }]}>
              Sem localização · tocar para tentar novamente
            </Text>
          </Pressable>
        ) : null}
      </View>

      <View style={styles.actions}>
        {hasCoords && !stop.done ? (
          <Pressable onPress={onNavigate} hitSlop={8} style={styles.actionBtn}>
            <Text style={styles.actionText}>Ir</Text>
          </Pressable>
        ) : null}
        <Pressable onPress={onDelete} hitSlop={8} style={styles.actionBtn}>
          <Text style={[styles.actionText, { color: colors.danger }]}>✕</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    backgroundColor: colors.card,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    gap: spacing.md,
    alignItems: 'center',
  },
  cardDone: { opacity: 0.6 },
  badgeWrap: { justifyContent: 'center' },
  badge: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  badgeOk: { backgroundColor: colors.primary },
  badgePending: { backgroundColor: colors.muted },
  badgeDone: { backgroundColor: colors.success },
  badgeText: { color: '#fff', fontWeight: '700', fontSize: 15 },
  body: { flex: 1, gap: 2 },
  title: { fontSize: 15, fontWeight: '600', color: colors.text },
  strike: { textDecorationLine: 'line-through' },
  line: { fontSize: 13, color: colors.muted },
  status: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4 },
  statusText: { fontSize: 12, color: colors.muted },
  actions: { flexDirection: 'row', gap: spacing.xs },
  actionBtn: { paddingHorizontal: 10, paddingVertical: 8 },
  actionText: { color: colors.primary, fontWeight: '700', fontSize: 15 },
});
