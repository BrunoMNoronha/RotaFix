import { geocode, fromBrasilApiCep } from '@/services/geocode';

const input = {
  street: 'Avenida Paulista',
  number: '1578',
  neighborhood: 'Bela Vista',
  city: 'São Paulo',
  state: 'SP',
  cep: '01310200',
};

type Handler = (url: string) => { status?: number; body: unknown };

function mockFetch(handler: Handler) {
  globalThis.fetch = jest.fn(async (u: RequestInfo | URL) => {
    const { status = 200, body } = handler(String(u));
    return { ok: status < 300, status, json: async () => body } as Response;
  }) as unknown as typeof fetch;
}

const calledHosts = () => (globalThis.fetch as jest.Mock).mock.calls.map(([u]) => new URL(String(u)).host);

describe('geocode', () => {
  beforeEach(() => {
    delete process.env.EXPO_PUBLIC_GOOGLE_GEOCODING_API_KEY;
  });

  it('usa Nominatim com número quando responde', async () => {
    mockFetch((url) =>
      url.includes('nominatim') ? { body: [{ lat: '-23.5615', lon: '-46.6559' }] } : { body: {} },
    );
    const r = await geocode(input);
    expect(r).toMatchObject({ lat: -23.5615, lng: -46.6559, precision: 'address', source: 'nominatim' });
    expect(calledHosts()).toEqual(['nominatim.openstreetmap.org']);
  });

  it('cai para o centroide do CEP (BrasilAPI) quando Nominatim falha com 403', async () => {
    mockFetch((url) =>
      url.includes('nominatim')
        ? { status: 403, body: {} }
        : { body: { location: { coordinates: { longitude: '-46.63611', latitude: '-23.5475' } } } },
    );
    const r = await geocode(input);
    expect(r).toMatchObject({ lat: -23.5475, lng: -46.63611, precision: 'cep', source: 'brasilapi' });
    expect(calledHosts()).toEqual(['nominatim.openstreetmap.org', 'brasilapi.com.br']);
  });

  it('pula o Nominatim com número quando não há número e vai direto ao CEP', async () => {
    mockFetch((url) =>
      url.includes('brasilapi')
        ? { body: { location: { coordinates: { longitude: -46.6, latitude: -23.5 } } } }
        : { body: [] },
    );
    const r = await geocode({ ...input, number: null });
    expect(r?.source).toBe('brasilapi');
    expect(calledHosts()[0]).toBe('brasilapi.com.br');
  });

  it('usa Nominatim sem número como último recurso', async () => {
    mockFetch((url) => {
      if (url.includes('brasilapi')) return { body: { location: { coordinates: {} } } };
      if (url.includes('nominatim') && url.includes('1578')) return { body: [] };
      return { body: [{ lat: '-23.5618', lon: '-46.6559' }] };
    });
    const r = await geocode(input);
    expect(r).toMatchObject({ precision: 'street', source: 'nominatim' });
  }, 10000);

  it('retorna null quando nada resolve', async () => {
    mockFetch(() => ({ status: 500, body: {} }));
    expect(await geocode(input)).toBeNull();
  }, 15000);

  it('fromBrasilApiCep rejeita coordenadas 0,0 ou ausentes', async () => {
    mockFetch(() => ({ body: { location: { coordinates: { longitude: '0', latitude: '0' } } } }));
    expect(await fromBrasilApiCep('01310200')).toBeNull();
    mockFetch(() => ({ body: {} }));
    expect(await fromBrasilApiCep('01310200')).toBeNull();
  });
});
