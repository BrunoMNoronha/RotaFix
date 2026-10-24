import * as Location from 'expo-location';
import type { LatLng } from '@/db/types';

export class LocationPermissionError extends Error {
  constructor() {
    super('Permissão de localização negada');
    this.name = 'LocationPermissionError';
  }
}

export async function getCurrentLatLng(): Promise<LatLng> {
  const { status } = await Location.requestForegroundPermissionsAsync();
  if (status !== 'granted') throw new LocationPermissionError();
  const last = await Location.getLastKnownPositionAsync({ maxAge: 60_000 });
  const pos = last ?? (await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }));
  return { lat: pos.coords.latitude, lng: pos.coords.longitude };
}
