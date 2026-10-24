import { fetchJson, createThrottle } from './http';
import type { GeocodePrecision, LatLng } from '@/db/types';

export type { GeocodePrecision };

export interface GeocodeInput {
  street: string;
  number?: string | null;
  neighborhood?: string;
  city: string;
  state: string;
  cep: string;
}

export interface GeocodeResult extends LatLng {
  precision: GeocodePrecision;
  source: 'nominatim' | 'photon' | 'brasilapi' | 'google';
}

/** Campos comuns que usamos para validar um resultado, independente da fonte. */
export interface PlaceCandidate {
  lat: number;
  lng: number;
  name?: string;
  road?: string;
  houseNumber?: string;
  neighborhood?: string;
  city?: string;
  state?: string;
  postcode?: string;
}

interface NominatimResult {
  lat: string;
  lon: string;
  name?: string;
  type?: string;
  address?: {
    house_number?: string;
    road?: string;
    neighbourhood?: string;
    suburb?: string;
    quarter?: string;
    city_district?: string;
    city?: string;
    town?: string;
    village?: string;
    municipality?: string;
    state?: string;
    postcode?: string;
  };
}

interface PhotonFeature {
  geometry: { coordinates: [number, number] };
  properties: {
    name?: string;
    street?: string;
    housenumber?: string;
    district?: string;
    city?: string;
    state?: string;
    postcode?: string;
    country?: string;
    countrycode?: string;
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
const NOMINATIM_HEADERS = { Referer: 'https://rotafix.app' };
const NOMINATIM_BASE =
  'https://nominatim.openstreetmap.org/search?format=jsonv2&limit=5&countrycodes=br&addressdetails=1';

const UF_NAMES: Record<string, string> = {
  AC: 'acre', AL: 'alagoas', AP: 'amapa', AM: 'amazonas', BA: 'bahia', CE: 'ceara',
  DF: 'distrito federal', ES: 'espirito santo', GO: 'goias', MA: 'maranhao', MT: 'mato grosso',
  MS: 'mato grosso do sul', MG: 'minas gerais', PA: 'para', PB: 'paraiba', PR: 'parana',
  PE: 'pernambuco', PI: 'piaui', RJ: 'rio de janeiro', RN: 'rio grande do norte',
  RS: 'rio grande do sul', RO: 'rondonia', RR: 'roraima', SC: 'santa catarina', SP: 'sao paulo',
  SE: 'sergipe', TO: 'tocantins',
};

// ---------------------------------------------------------------------------
// Normalização e validação
// ---------------------------------------------------------------------------

/** Remove acentos, pontuação e caixa para comparar nomes. */
export function normalizeName(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\(.*?\)/g, ' ') // "Samambaia Norte (Samambaia)" → "Samambaia Norte"
    .replace(/[^a-z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Endereços do DF vêm dos Correios como "Quadra QS 601 Conjunto B Comércio";
 * no OSM aparecem como "QS 601 Conjunto B" / "Norte QS 601". Remove ruído.
 */
export function simplifyStreet(street: string): string {
  return street
    .replace(/^\s*quadra\s+/i, '')
    .replace(/\s+(com[eé]rcio|residencial|lotes?|lt\.?|[aá]rea especial)(\s.*)?$/i, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Código de quadra (QS 601, QNM 34, SQN 310, CLN 208…) quando o endereço segue o padrão do DF. */
export function quadraToken(street: string): string | null {
  const m = street.match(/\b(Q[A-Z]{1,3}|SQ[NS]?|SH[A-Z]{1,3}|CL[NS]?|CS[A-Z]?|SG[A-Z]{1,3}|SR[A-Z]{1,3})\s*0*(\d{1,4})\b/i);
  return m ? `${m[1].toLowerCase()} ${m[2]}` : null;
}

function stateMatches(c: PlaceCandidate, input: GeocodeInput): boolean {
  if (!c.state) return false;
  const got = normalizeName(c.state);
  const uf = input.state.trim().toUpperCase();
  return got === uf.toLowerCase() || got === UF_NAMES[uf];
}

function cityMatches(c: PlaceCandidate, input: GeocodeInput): boolean {
  return !!c.city && normalizeName(c.city) === normalizeName(input.city);
}

function cepMatches(c: PlaceCandidate, input: GeocodeInput): boolean {
  return !!c.postcode && c.postcode.replace(/\D/g, '') === input.cep.replace(/\D/g, '');
}

function neighborhoodMatches(c: PlaceCandidate, input: GeocodeInput): boolean {
  if (!input.neighborhood || !c.neighborhood) return false;
  return normalizeName(c.neighborhood) === normalizeName(input.neighborhood);
}

/**
 * O resultado pertence ao lugar informado? Aceita cidade igual, CEP igual, ou
 * bairro igual dentro do mesmo estado (no DF, o OSM usa a região administrativa
 * como "cidade" — Samambaia, Taguatinga — enquanto os Correios dizem Brasília).
 */
export function matchesPlace(c: PlaceCandidate, input: GeocodeInput): boolean {
  if (cepMatches(c, input)) return true;
  if (cityMatches(c, input)) return true;
  return stateMatches(c, input) && neighborhoodMatches(c, input);
}

/** Quando o endereço tem código de quadra, o resultado precisa citar a mesma quadra. */
function quadraMatches(c: PlaceCandidate, input: GeocodeInput): boolean {
  const want = quadraToken(input.street);
  if (!want) return true;
  const hay = normalizeName(`${c.name ?? ''} ${c.road ?? ''}`);
  return quadraToken(hay) === want || hay.includes(want);
}

// ---------------------------------------------------------------------------
// Fontes
// ---------------------------------------------------------------------------

function fromNominatimResult(r: NominatimResult): PlaceCandidate | null {
  const lat = parseFloat(r.lat);
  const lng = parseFloat(r.lon);
  if (Number.isNaN(lat) || Number.isNaN(lng)) return null;
  const a = r.address ?? {};
  return {
    lat,
    lng,
    name: r.name,
    road: a.road,
    houseNumber: a.house_number,
    neighborhood: a.suburb ?? a.neighbourhood ?? a.quarter ?? a.city_district,
    city: a.city ?? a.town ?? a.village ?? a.municipality,
    state: a.state,
    postcode: a.postcode,
  };
}

function fromPhotonFeature(f: PhotonFeature): PlaceCandidate | null {
  const p = f.properties;
  const isBr = (p.countrycode ?? '').toUpperCase() === 'BR' || normalizeName(p.country ?? '') === 'brasil';
  if (!isBr) return null;
  const [lng, lat] = f.geometry.coordinates;
  return {
    lat,
    lng,
    name: p.name,
    road: p.street,
    houseNumber: p.housenumber,
    neighborhood: p.district,
    city: p.city,
    state: p.state,
    postcode: p.postcode,
  };
}

async function nominatimSearch(params: Record<string, string>): Promise<PlaceCandidate[]> {
  const qs = Object.entries(params)
    .filter(([, v]) => v.trim().length > 0)
    .map(([k, v]) => `&${k}=${encodeURIComponent(v)}`)
    .join('');
  const results = await nominatimThrottle(() =>
    fetchJson<NominatimResult[]>(NOMINATIM_BASE + qs, { retries: 1, headers: NOMINATIM_HEADERS }),
  );
  return results.map(fromNominatimResult).filter((c): c is PlaceCandidate => c !== null);
}

async function photonSearch(q: string): Promise<PlaceCandidate[]> {
  const r = await fetchJson<{ features: PhotonFeature[] }>(
    `https://photon.komoot.io/api/?limit=5&q=${encodeURIComponent(q)}`,
    { retries: 1 },
  );
  return r.features.map(fromPhotonFeature).filter((c): c is PlaceCandidate => c !== null);
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
  const q = [input.street, input.number, input.neighborhood, input.city, input.state, 'Brasil']
    .filter((p) => p && p.trim())
    .join(', ');
  const url =
    'https://maps.googleapis.com/maps/api/geocode/json?region=br&components=country:BR&address=' +
    encodeURIComponent(q) +
    '&key=' +
    encodeURIComponent(apiKey);
  const r = await fetchJson<GoogleGeocodeResponse>(url, { retries: 1 });
  if (r.status !== 'OK' || !r.results.length) return null;
  const first = r.results[0];
  const types = first.types ?? [];
  let precision: GeocodePrecision;
  if (types.includes('street_address') || types.includes('premise')) precision = 'address';
  else if (types.includes('route')) precision = 'street';
  else if (types.includes('sublocality') || types.includes('neighborhood')) precision = 'neighborhood';
  else return null; // cidade/estado: não serve
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

// ---------------------------------------------------------------------------
// Estratégia
// ---------------------------------------------------------------------------

/** Variantes de nome de rua a tentar, da mais fiel à mais simplificada. */
export function streetVariants(street: string): string[] {
  const out: string[] = [];
  const push = (s: string) => {
    const t = s.trim();
    if (t && !out.includes(t)) out.push(t);
  };
  push(street);
  push(simplifyStreet(street));
  return out;
}

function pickStreetLevel(cands: PlaceCandidate[], input: GeocodeInput): GeocodeResult | null {
  const valid = cands.filter((c) => matchesPlace(c, input) && quadraMatches(c, input));
  if (!valid.length) return null;
  const want = input.number?.trim();
  const byNumber = want ? valid.find((c) => c.houseNumber === want) : undefined;
  const byCep = valid.find((c) => cepMatches(c, input));
  const pick = byNumber ?? byCep ?? valid[0];
  return { lat: pick.lat, lng: pick.lng, precision: pick === byNumber ? 'address' : 'street', source: 'nominatim' };
}

function pickNeighborhoodLevel(cands: PlaceCandidate[], input: GeocodeInput): LatLng | null {
  if (!input.neighborhood?.trim()) return null;
  const want = normalizeName(input.neighborhood);
  const pick = cands.find(
    (c) =>
      stateMatches(c, input) &&
      (normalizeName(c.name ?? '') === want || normalizeName(c.neighborhood ?? '') === want),
  );
  return pick ? { lat: pick.lat, lng: pick.lng } : null;
}

/**
 * Endereço → coordenadas, do mais preciso ao menos preciso. Todo resultado é
 * validado contra cidade, CEP ou bairro+UF informados.
 *  1. Google (se chave)                                  → address/street/neighborhood
 *  2. Nominatim estruturado (rua[+número], cidade, UF, CEP), com variantes de rua  → address/street
 *  3. Photon texto livre (rua, bairro, cidade, UF)       → address/street
 *  4. Nominatim texto livre (rua simplificada, bairro, UF) → street
 *  5. Bairro + cidade (Nominatim, depois Photon)         → neighborhood
 *  6. BrasilAPI centroide do CEP                          → cep (pode ser o centro da cidade)
 */
export async function geocode(input: GeocodeInput): Promise<GeocodeResult | null> {
  const googleKey = process.env.EXPO_PUBLIC_GOOGLE_GEOCODING_API_KEY;
  const variants = streetVariants(input.street);
  const hasStreet = variants.length > 0;

  if (googleKey && hasStreet) {
    const r = await attempt(() => fromGoogle(input, googleKey));
    if (r) return r;
  }

  // 2. Nominatim estruturado
  for (const street of hasStreet ? variants : []) {
    const forms = input.number ? [`${input.number} ${street}`, street] : [street];
    for (const s of forms) {
      const cands = await attempt(() =>
        nominatimSearch({ street: s, city: input.city, state: input.state, postalcode: input.cep }),
      );
      const r = cands && pickStreetLevel(cands, input);
      if (r) return r;
    }
  }

  // 3. Photon
  for (const street of hasStreet ? variants : []) {
    const q = [input.number ? `${street} ${input.number}` : street, input.neighborhood, input.city, input.state]
      .filter((p) => p && p.trim())
      .join(', ');
    const cands = await attempt(() => photonSearch(q));
    const r = cands && pickStreetLevel(cands, input);
    if (r) return { ...r, source: 'photon' };
  }

  // 4. Nominatim texto livre com rua simplificada + bairro
  if (hasStreet && input.neighborhood) {
    const q = [variants[variants.length - 1], input.neighborhood, input.state].join(', ');
    const cands = await attempt(() => nominatimSearch({ q }));
    const r = cands && pickStreetLevel(cands, input);
    if (r) return { ...r, precision: 'street' };
  }

  // 5. Bairro
  if (input.neighborhood?.trim()) {
    const q = [input.neighborhood, input.city, input.state].join(', ');
    const n = await attempt(() => nominatimSearch({ q }));
    const pn = n && pickNeighborhoodLevel(n, input);
    if (pn) return { ...pn, precision: 'neighborhood', source: 'nominatim' };
    const p = await attempt(() => photonSearch(q));
    const pp = p && pickNeighborhoodLevel(p, input);
    if (pp) return { ...pp, precision: 'neighborhood', source: 'photon' };
  }

  // 6. CEP (centroide, frequentemente o centro da cidade)
  const byCep = await attempt(() => fromBrasilApiCep(input.cep));
  if (byCep) return { ...byCep, precision: 'cep', source: 'brasilapi' };

  return null;
}
