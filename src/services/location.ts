import * as Location from 'expo-location';
import type { LatLng } from '@/db/types';

export class LocationPermissionError extends Error {
  constructor() {
    super('Permissão de localização negada');
    this.name = 'LocationPermissionError';
  }
}

export class LocationUnavailableError extends Error {
  constructor(message = 'Não foi possível obter a posição atual') {
    super(message);
    this.name = 'LocationUnavailableError';
  }
}

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => reject(new LocationUnavailableError('Tempo esgotado ao obter o GPS')), ms);
    p.then(
      (v) => {
        clearTimeout(t);
        resolve(v);
      },
      (e) => {
        clearTimeout(t);
        reject(e);
      },
    );
  });
}

export async function getCurrentLatLng(): Promise<LatLng> {
  const { status } = await Location.requestForegroundPermissionsAsync();
  if (status !== 'granted') throw new LocationPermissionError();

  const enabled = await Location.hasServicesEnabledAsync();
  if (!enabled) throw new LocationUnavailableError('O GPS do aparelho está desligado');

  const last = await Location.getLastKnownPositionAsync({ maxAge: 120_000 });
  const pos =
    last ??
    (await withTimeout(Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }), 20_000));
  return { lat: pos.coords.latitude, lng: pos.coords.longitude };
}
