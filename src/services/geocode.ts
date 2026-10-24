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

/** address: número exato · street: trecho da rua · cep: centroide do CEP (pode ser o centro da cidade) */
export type GeocodePrecision = 'address' | 'street' | 'cep';

export interface GeocodeResult extends LatLng {
  precision: GeocodePrecision;
  source: 'nominatim' | 'photon' | 'brasilapi' | 'google';
}

interface PhotonFeature {
  geometry: { coordinates: [number, number] };
  properties: {
    name?: string;
    street?: string;
    housenumber?: string;
    city?: string;
    state?: string;
    postcode?: string;
    country?: string;
    countrycode?: string;
  };
}

interface PhotonResponse {
  features: PhotonFeature[];
}

interface NominatimResult {
  lat: string;
  lon: string;
  type?: string;
  address?: {
    house_number?: string;
    road?: string;
    city?: string;
    town?: string;
    village?: string;
    municipality?: string;
    city_district?: string;
    state?: string;
    postcode?: string;
  };
}

interface BrasilApiCep {
  location?: { coordinates?: { longitude?: string | number; latitude?: string | number } };
}

interface GoogleGeocodeResponse {
  status: string;
  results: { geometry: { location: { lat: number; lng: number } }; types?: string[] }[];
}

const nominatimThrottle = createThrottle(1100);

// Nominatim exige identificação (User-Agent ou Referer). Enviamos ambos porque
// alguns ambientes nativos não repassam o User-Agent customizado.
const NOMINATIM_HEADERS = { Referer: 'https://rotafix.app' };
const NOMINATIM_BASE =
  'https://nominatim.openstreetmap.org/search?format=jsonv2&limit=3&countrycodes=br&addressdetails=1';

/** Remove acentos, pontuação e caixa para comparar nomes de cidade. */
export function normalizeName(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

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

/** O resultado pertence à cidade esperada (ou ao CEP exato)? Evita cair em homônimos de outra cidade. */
export function matchesCity(r: NominatimResult, input: GeocodeInput): boolean {
  const a = r.address;
  if (!a) return false;
  const expectedCep = input.cep.replace(/\D/g, '');
  if (a.postcode && a.postcode.replace(/\D/g, '') === expectedCep) return true;
  const want = normalizeName(input.city);
  const candidates = [a.city, a.town, a.village, a.municipality, a.city_district].filter(Boolean) as string[];
  return candidates.some((c) => normalizeName(c) === want);
}

function parseLatLng(r: NominatimResult): LatLng | null {
  const lat = parseFloat(r.lat);
  const lng = parseFloat(r.lon);
  return Number.isNaN(lat) || Number.isNaN(lng) ? null : { lat, lng };
}

async function nominatim(params: Record<string, string>, input: GeocodeInput): Promise<NominatimResult | null> {
  const qs = Object.entries(params)
    .filter(([, v]) => v.trim().length > 0)
    .map(([k, v]) => `&${k}=${encodeURIComponent(v)}`)
    .join('');
  const results = await nominatimThrottle(() =>
    fetchJson<NominatimResult[]>(NOMINATIM_BASE + qs, { retries: 1, headers: NOMINATIM_HEADERS }),
  );
  return results.find((r) => matchesCity(r, input)) ?? null;
}

/** Busca estruturada: a mais confiável para endereços brasileiros, pois o CEP delimita o trecho da rua. */
async function nominatimStructured(input: GeocodeInput, withNumber: boolean): Promise<NominatimResult | null> {
  const street = input.street.trim();
  if (!street) return null;
  return nominatim(
    {
      street: withNumber && input.number ? `${input.number} ${street}` : street,
      city: input.city,
      state: input.state,
      postalcode: input.cep,
    },
    input,
  );
}

async function nominatimFreeText(input: GeocodeInput): Promise<NominatimResult | null> {
  if (!input.street.trim()) return null;
  return nominatim({ q: buildAddressQuery(input, false) }, input);
}

/**
 * Photon (komoot, dados OSM): não exige User-Agent, então funciona mesmo
 * quando o Nominatim bloqueia o aparelho. Prefere, nesta ordem, o resultado
 * com o CEP exato, com o número de porta na cidade certa, ou qualquer um na cidade certa.
 */
export async function fromPhoton(input: GeocodeInput): Promise<GeocodeResult | null> {
  const street = input.street.trim();
  if (!street) return null;
  const q = [input.number ? `${street} ${input.number}` : street, input.neighborhood, input.city, input.state]
    .filter((p) => p && p.trim())
    .join(', ');
  const url = `https://photon.komoot.io/api/?limit=5&q=${encodeURIComponent(q)}`;
  const r = await fetchJson<PhotonResponse>(url, { retries: 1 });
  const expectedCep = input.cep.replace(/\D/g, '');
  const wantCity = normalizeName(input.city);
  const inBrazil = (f: PhotonFeature) =>
    (f.properties.countrycode ?? '').toUpperCase() === 'BR' || normalizeName(f.properties.country ?? '') === 'brasil';
  const sameCity = (f: PhotonFeature) => normalizeName(f.properties.city ?? '') === wantCity;
  const candidates = r.features.filter((f) => inBrazil(f) && sameCity(f));

  const byCep = candidates.find((f) => (f.properties.postcode ?? '').replace(/\D/g, '') === expectedCep);
  const byNumber = input.number
    ? candidates.find((f) => f.properties.housenumber === input.number && normalizeName(f.properties.street ?? f.properties.name ?? '') === normalizeName(street))
    : undefined;
  const pick = byNumber ?? byCep ?? candidates[0];
  if (!pick) return null;
  const [lng, lat] = pick.geometry.coordinates;
  const precision: GeocodePrecision = pick === byNumber ? 'address' : 'street';
  return { lat, lng, precision, source: 'photon' };
}

/** Centroide do CEP via BrasilAPI. Frequentemente é o centro da cidade: só como último recurso. */
export async function fromBrasilApiCep(cep: string): Promise<LatLng | null> {
  const r = await fetchJson<BrasilApiCep>(`https://brasilapi.com.br/api/cep/v2/${cep}`, { retries: 1 });
  const c = r.location?.coordinates;
  if (!c || c.latitude === undefined || c.longitude === undefined) return null;
  const lat = Number(c.latitude);
  const lng = Number(c.longitude);
  if (Number.isNaN(lat) || Number.isNaN(lng) || (lat === 0 && lng === 0)) return null;
  return { lat, lng };
}

async function fromGoogle(input: GeocodeInput, apiKey: string): Promise<GeocodeResult | null> {
  const url =
    'https://maps.googleapis.com/maps/api/geocode/json?region=br&components=country:BR&address=' +
    encodeURIComponent(buildAddressQuery(input, true)) +
    '&key=' +
    encodeURIComponent(apiKey);
  const r = await fetchJson<GoogleGeocodeResponse>(url, { retries: 1 });
  if (r.status !== 'OK' || !r.results.length) return null;
  const first = r.results[0];
  const types = first.types ?? [];
  const precision: GeocodePrecision = types.includes('street_address') || types.includes('premise')
    ? 'address'
    : types.includes('route')
      ? 'street'
      : 'cep';
  return { ...first.geometry.location, precision, source: 'google' };
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
 * Endereço → coordenadas, do mais preciso ao menos preciso. Todo resultado do
 * Nominatim é validado contra a cidade/CEP informados.
 *  1. Google (se chave)                              → address/street
 *  2. Nominatim estruturado com número               → address
 *  3. Nominatim estruturado sem número (trecho/CEP)  → street
 *  4. Nominatim texto livre (rua, bairro, cidade)    → street
 *  5. Photon (OSM, sem exigir User-Agent)            → address/street
 *  6. BrasilAPI centroide do CEP                     → cep (aproximado)
 */
export async function geocode(input: GeocodeInput): Promise<GeocodeResult | null> {
  const googleKey = process.env.EXPO_PUBLIC_GOOGLE_GEOCODING_API_KEY;

  if (googleKey && input.street.trim()) {
    const r = await attempt(() => fromGoogle(input, googleKey));
    if (r && r.precision !== 'cep') return r;
  }

  if (input.number) {
    const r = await attempt(() => nominatimStructured(input, true));
    const p = r && parseLatLng(r);
    if (p) return { ...p, precision: r.address?.house_number ? 'address' : 'street', source: 'nominatim' };
  }

  const byStreet = await attempt(() => nominatimStructured(input, false));
  const ps = byStreet && parseLatLng(byStreet);
  if (ps) return { ...ps, precision: 'street', source: 'nominatim' };

  const byText = await attempt(() => nominatimFreeText(input));
  const pt = byText && parseLatLng(byText);
  if (pt) return { ...pt, precision: 'street', source: 'nominatim' };

  const photon = await attempt(() => fromPhoton(input));
  if (photon) return photon;

  const byCep = await attempt(() => fromBrasilApiCep(input.cep));
  if (byCep) return { ...byCep, precision: 'cep', source: 'brasilapi' };

  return null;
}
