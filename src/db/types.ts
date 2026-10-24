export type GeocodeStatus = 'ok' | 'pending' | 'failed';

export interface Route {
  id: string;
  name: string;
  startLat: number | null;
  startLng: number | null;
  createdAt: number;
  optimizedAt: number | null;
}

export interface Stop {
  id: string;
  routeId: string;
  cep: string;
  street: string;
  neighborhood: string;
  city: string;
  state: string;
  number: string | null;
  complement: string | null;
  label: string | null;
  lat: number | null;
  lng: number | null;
  geocodeStatus: GeocodeStatus;
  sequence: number | null;
  done: boolean;
  createdAt: number;
}

export type NewStop = Omit<Stop, 'id' | 'createdAt' | 'sequence' | 'done'>;

export interface LatLng {
  lat: number;
  lng: number;
}
