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

interface NominatimResult {
  lat: string;
  lon: string;
}

interface GoogleGeocodeResponse {
  status: string;
  results: { geometry: { location: { lat: number; lng: number } } }[];
}

const nominatimThrottle = createThrottle(1100);

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
  const results = await nominatimThrottle(() => fetchJson<NominatimResult[]>(url, { retries: 1 }));
  if (!results.length) return null;
  return { lat: parseFloat(results[0].lat), lng: parseFloat(results[0].lon) };
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

/**
 * Endereço → coordenadas. Tenta Nominatim com número, depois sem número,
 * depois Google (se houver chave). Retorna null quando nada resolve.
 */
export async function geocode(input: GeocodeInput): Promise<LatLng | null> {
  const googleKey = process.env.EXPO_PUBLIC_GOOGLE_GEOCODING_API_KEY;
  const queries = [buildAddressQuery(input, true)];
  if (input.number) queries.push(buildAddressQuery(input, false));

  for (const q of queries) {
    try {
      const r = await fromNominatim(q);
      if (r) return r;
    } catch {
      // segue para o próximo
    }
  }

  if (googleKey) {
    try {
      const r = await fromGoogle(queries[0], googleKey);
      if (r) return r;
    } catch {
      // sem resultado
    }
  }

  // Último recurso: só o CEP (Nominatim indexa CEPs brasileiros parcialmente)
  try {
    return await fromNominatim(`${input.cep}, Brasil`);
  } catch {
    return null;
  }
}
