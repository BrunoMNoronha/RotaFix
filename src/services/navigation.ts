import { Linking } from 'react-native';
import type { LatLng } from '@/db/types';

/** Google Maps aceita no máximo 9 waypoints intermediários + destino. */
export const GOOGLE_MAX_WAYPOINTS = 9;

const fmt = (p: LatLng) => `${p.lat.toFixed(6)},${p.lng.toFixed(6)}`;

export function buildGoogleMapsUrl(destination: LatLng, waypoints: LatLng[] = [], origin?: LatLng): string {
  const params = new URLSearchParams({ api: '1', destination: fmt(destination), travelmode: 'driving' });
  if (origin) params.set('origin', fmt(origin));
  if (waypoints.length) params.set('waypoints', waypoints.map(fmt).join('|'));
  return `https://www.google.com/maps/dir/?${params.toString()}`;
}

export function buildWazeUrl(destination: LatLng): string {
  return `waze://?ll=${fmt(destination)}&navigate=yes`;
}

/**
 * Divide a sequência em trechos navegáveis pelo Google Maps:
 * cada trecho tem até 9 waypoints + 1 destino (10 pontos).
 */
export function chunkForGoogle(points: LatLng[]): LatLng[][] {
  const size = GOOGLE_MAX_WAYPOINTS + 1;
  const chunks: LatLng[][] = [];
  for (let i = 0; i < points.length; i += size) chunks.push(points.slice(i, i + size));
  return chunks;
}

export async function openNavigation(destination: LatLng, waypoints: LatLng[] = []): Promise<void> {
  await Linking.openURL(buildGoogleMapsUrl(destination, waypoints));
}

export async function openWaze(destination: LatLng): Promise<boolean> {
  const url = buildWazeUrl(destination);
  const can = await Linking.canOpenURL(url);
  if (!can) return false;
  await Linking.openURL(url);
  return true;
}
