import { haversine, formatDistance } from '@/utils/haversine';
import { normalizeCep, isValidCep, formatCep } from '@/utils/cep';
import { decodePolyline } from '@/utils/polyline';
import { buildGoogleMapsUrl, chunkForGoogle } from '@/services/navigation';
import { mapViaCep, mapBrasilApi } from '@/services/cep';

describe('haversine', () => {
  it('Sé → Paulista ≈ 2,6 km', () => {
    const d = haversine({ lat: -23.5505, lng: -46.6333 }, { lat: -23.5614, lng: -46.6559 });
    expect(d).toBeGreaterThan(2500);
    expect(d).toBeLessThan(2800);
  });
  it('mesmo ponto = 0', () => {
    expect(haversine({ lat: 1, lng: 1 }, { lat: 1, lng: 1 })).toBe(0);
  });
  it('formata', () => {
    expect(formatDistance(850)).toBe('850 m');
    expect(formatDistance(12345)).toBe('12,3 km');
  });
});

describe('cep utils', () => {
  it('normaliza', () => {
    expect(normalizeCep('01310-100')).toBe('01310100');
    expect(normalizeCep('abc 01310100999')).toBe('01310100');
  });
  it('valida', () => {
    expect(isValidCep('01310-100')).toBe(true);
    expect(isValidCep('0131010')).toBe(false);
  });
  it('formata', () => {
    expect(formatCep('01310100')).toBe('01310-100');
    expect(formatCep('0131')).toBe('0131');
  });
});

describe('polyline', () => {
  it('decodifica exemplo do Google', () => {
    const pts = decodePolyline('_p~iF~ps|U_ulLnnqC_mqNvxq`@');
    expect(pts).toHaveLength(3);
    expect(pts[0].lat).toBeCloseTo(38.5, 4);
    expect(pts[0].lng).toBeCloseTo(-120.2, 4);
    expect(pts[2].lat).toBeCloseTo(43.252, 3);
  });
});

describe('navigation', () => {
  it('monta URL do Google Maps com waypoints', () => {
    const url = buildGoogleMapsUrl({ lat: -23.5, lng: -46.6 }, [{ lat: -23.4, lng: -46.5 }]);
    expect(url).toContain('api=1');
    expect(url).toContain('destination=-23.500000%2C-46.600000');
    expect(url).toContain('waypoints=-23.400000%2C-46.500000');
  });
  it('divide em blocos de 10', () => {
    const pts = Array.from({ length: 23 }, (_, i) => ({ lat: i, lng: i }));
    const chunks = chunkForGoogle(pts);
    expect(chunks.map((c) => c.length)).toEqual([10, 10, 3]);
  });
});

describe('cep mappers', () => {
  it('ViaCEP', () => {
    expect(mapViaCep('01310100', { logradouro: 'Avenida Paulista', bairro: 'Bela Vista', localidade: 'São Paulo', uf: 'SP' })).toEqual({
      cep: '01310100',
      street: 'Avenida Paulista',
      neighborhood: 'Bela Vista',
      city: 'São Paulo',
      state: 'SP',
    });
  });
  it('BrasilAPI com campos ausentes', () => {
    expect(mapBrasilApi('01310100', { cep: '01310100', city: 'São Paulo', state: 'SP' })).toEqual({
      cep: '01310100',
      street: '',
      neighborhood: '',
      city: 'São Paulo',
      state: 'SP',
    });
  });
});
