import { fetchJson, createThrottle } from './http';
import type { LatLng } from '@/db/types';

export interface GeocodeInput {
  street: string;
  number?: string | null;
  neighborhood?: string;
  city: string;
  state: string;
  cep: string;
}

export type GeocodePrecision = 'address' | 'street' | 'cep';

export interface GeocodeResult extends LatLng {
  precision: GeocodePrecision;
  source: 'nominatim' | 'brasilapi' | 'google';
}

interface NominatimResult {
  lat: string;
  lon: string;
}

interface BrasilApiCep {
  location?: { coordinates?: { longitude?: string | number; latitude?: string | number } };
}

interface GoogleGeocodeResponse {
  status: string;
  results: { geometry: { location: { lat: number; lng: number } } }[];
}

const nominatimThrottle = createThrottle(1100);

// Nominatim exige identificação (User-Agent ou Referer). Enviamos ambos porque
// alguns ambientes nativos não repassam o User-Agent customizado.
const NOMINATIM_HEADERS = { Referer: 'https://rotafix.app' };

export function buildAddressQuery(a: GeocodeInput, withNumber = true): string {
  const parts: string[] = [];
  const street = a.street.trim();
  if (street) parts.push(withNumber && a.number ? `${street}, ${a.number}` : street);
  if (a.neighborhood?.trim()) parts.push(a.neighborhood.trim());
  if (a.city.trim()) parts.push(a.city.trim());
  if (a.state.trim()) parts.push(a.state.trim());
  parts.push('Brasil');
  return parts.join(', ');
}

async function fromNominatim(query: string): Promise<LatLng | null> {
  const url =
    'https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=br&q=' +
    encodeURIComponent(query);
  const results = await nominatimThrottle(() =>
    fetchJson<NominatimResult[]>(url, { retries: 1, headers: NOMINATIM_HEADERS }),
  );
  if (!results.length) return null;
  const lat = parseFloat(results[0].lat);
  const lng = parseFloat(results[0].lon);
  if (Number.isNaN(lat) || Number.isNaN(lng)) return null;
  return { lat, lng };
}

/** Centroide do CEP via BrasilAPI (base open-cep). Sem exigência de cabeçalhos. */
export async function fromBrasilApiCep(cep: string): Promise<LatLng | null> {
  const r = await fetchJson<BrasilApiCep>(`https://brasilapi.com.br/api/cep/v2/${cep}`, { retries: 1 });
  const c = r.location?.coordinates;
  if (!c || c.latitude === undefined || c.longitude === undefined) return null;
  const lat = Number(c.latitude);
  const lng = Number(c.longitude);
  if (Number.isNaN(lat) || Number.isNaN(lng) || (lat === 0 && lng === 0)) return null;
  return { lat, lng };
}

async function fromGoogle(query: string, apiKey: string): Promise<LatLng | null> {
  const url =
    'https://maps.googleapis.com/maps/api/geocode/json?region=br&address=' +
    encodeURIComponent(query) +
    '&key=' +
    encodeURIComponent(apiKey);
  const r = await fetchJson<GoogleGeocodeResponse>(url, { retries: 1 });
  if (r.status !== 'OK' || !r.results.length) return null;
  const { lat, lng } = r.results[0].geometry.location;
  return { lat, lng };
}

async function attempt<T>(fn: () => Promise<T | null>): Promise<T | null> {
  try {
    return await fn();
  } catch (err) {
    if (__DEV__) console.warn('[geocode] tentativa falhou:', err instanceof Error ? err.message : err);
    return null;
  }
}

/**
 * Endereço → coordenadas, do mais preciso ao menos preciso:
 *  1. Google com número (se houver chave)      → precisão 'address'
 *  2. Nominatim com número                      → 'address'
 *  3. BrasilAPI (centroide do CEP)              → 'cep'
 *  4. Nominatim sem número (meio da rua)        → 'street'
 * Retorna null quando nada resolve.
 */
export async function geocode(input: GeocodeInput): Promise<GeocodeResult | null> {
  const googleKey = process.env.EXPO_PUBLIC_GOOGLE_GEOCODING_API_KEY;
  const full = buildAddressQuery(input, true);
  const hasStreet = input.street.trim().length > 0;

  if (googleKey && hasStreet) {
    const r = await attempt(() => fromGoogle(full, googleKey));
    if (r) return { ...r, precision: input.number ? 'address' : 'street', source: 'google' };
  }

  if (hasStreet && input.number) {
    const r = await attempt(() => fromNominatim(full));
    if (r) return { ...r, precision: 'address', source: 'nominatim' };
  }

  const byCep = await attempt(() => fromBrasilApiCep(input.cep));
  if (byCep) return { ...byCep, precision: 'cep', source: 'brasilapi' };

  if (hasStreet) {
    const r = await attempt(() => fromNominatim(buildAddressQuery(input, false)));
    if (r) return { ...r, precision: 'street', source: 'nominatim' };
  }

  return null;
}
