import { fetchJson } from './http';
import type { LatLng } from '@/db/types';
import { decodePolyline } from '@/utils/polyline';

export interface Directions {
  geometry: LatLng[];
  distanceMeters: number;
  durationSeconds: number;
}

interface OsrmResponse {
  code: string;
  routes: { geometry: string; distance: number; duration: number }[];
}

/**
 * Geometria da rota seguindo ruas via OSRM público (até ~100 coordenadas na URL).
 * Retorna null se falhar; o chamador usa linha reta como fallback.
 */
export async function fetchDirections(points: LatLng[]): Promise<Directions | null> {
  if (points.length < 2) return null;
  const coords = points.map((p) => `${p.lng.toFixed(6)},${p.lat.toFixed(6)}`).join(';');
  const url = `https://router.project-osrm.org/route/v1/driving/${coords}?overview=full&geometries=polyline`;
  try {
    const r = await fetchJson<OsrmResponse>(url, { retries: 1, timeoutMs: 10000 });
    if (r.code !== 'Ok' || !r.routes.length) return null;
    const route = r.routes[0];
    return {
      geometry: decodePolyline(route.geometry),
      distanceMeters: route.distance,
      durationSeconds: route.duration,
    };
  } catch {
    return null;
  }
}
