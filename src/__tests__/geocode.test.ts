import { geocode, fromBrasilApiCep, fromPhoton, matchesCity, normalizeName } from '@/services/geocode';

const input = {
  street: 'Avenida Brigadeiro Faria Lima',
  number: '1811',
  neighborhood: 'Itaim Bibi',
  city: 'São Paulo',
  state: 'SP',
  cep: '04538133',
};

type Handler = (url: string) => { status?: number; body: unknown };

function mockFetch(handler: Handler) {
  globalThis.fetch = jest.fn(async (u: RequestInfo | URL) => {
    const { status = 200, body } = handler(String(u));
    return { ok: status < 300, status, json: async () => body } as Response;
  }) as unknown as typeof fetch;
}

const calledHosts = () => (globalThis.fetch as jest.Mock).mock.calls.map(([u]) => new URL(String(u)).host);

const nominatimOk = (postcode: string, house?: string) => [
  {
    lat: '-23.5880',
    lon: '-46.6820',
    address: { road: 'Avenida Brigadeiro Faria Lima', city: 'São Paulo', postcode, house_number: house },
  },
];

const photonFeature = (lat: number, lng: number, props: Record<string, string>) => ({
  geometry: { coordinates: [lng, lat] },
  properties: { country: 'Brasil', countrycode: 'BR', ...props },
});

describe('normalizeName / matchesCity', () => {
  it('ignora acentos e caixa', () => {
    expect(normalizeName('São Paulo')).toBe('sao paulo');
    expect(normalizeName('  Belo-Horizonte ')).toBe('belo horizonte');
  });
  it('aceita cidade igual ou CEP igual, rejeita homônimo de outra cidade', () => {
    expect(matchesCity({ lat: '0', lon: '0', address: { city: 'Sao Paulo' } }, input)).toBe(true);
    expect(matchesCity({ lat: '0', lon: '0', address: { town: 'Osasco', postcode: '04538-133' } }, input)).toBe(true);
    expect(matchesCity({ lat: '0', lon: '0', address: { city: 'Guarulhos', postcode: '07040-000' } }, input)).toBe(false);
  });
});

describe('geocode', () => {
  beforeEach(() => {
    delete process.env.EXPO_PUBLIC_GOOGLE_GEOCODING_API_KEY;
  });

  it('usa Nominatim estruturado com número e marca address quando há house_number', async () => {
    mockFetch((url) => (url.includes('nominatim') ? { body: nominatimOk('04538-133', '1811') } : { body: {} }));
    const r = await geocode(input);
    expect(r).toMatchObject({ lat: -23.588, lng: -46.682, precision: 'address', source: 'nominatim' });
    expect(calledHosts()).toEqual(['nominatim.openstreetmap.org']);
    expect(String((globalThis.fetch as jest.Mock).mock.calls[0][0])).toContain('postalcode=04538133');
  });

  it('descarta resultado do Nominatim em outra cidade', async () => {
    mockFetch((url) => {
      if (url.includes('nominatim'))
        return { body: [{ lat: '-23.47', lon: '-46.54', address: { city: 'Guarulhos', postcode: '07040-000' } }] };
      if (url.includes('photon')) return { body: { features: [] } };
      return { body: {} };
    });
    const r = await geocode(input);
    expect(r).toBeNull();
  }, 15000);

  it('cai para o Photon quando o Nominatim devolve 403, escolhendo o trecho do CEP', async () => {
    mockFetch((url) => {
      if (url.includes('nominatim')) return { status: 403, body: {} };
      if (url.includes('photon'))
        return {
          body: {
            features: [
              photonFeature(-23.594, -46.68, { name: 'Avenida Brigadeiro Faria Lima', city: 'São Paulo', postcode: '04552-040' }),
              photonFeature(-23.589, -46.6817, { name: 'Avenida Brigadeiro Faria Lima', city: 'São Paulo', postcode: '04538-133' }),
            ],
          },
        };
      return { body: {} };
    });
    const r = await geocode(input);
    expect(r).toMatchObject({ lat: -23.589, lng: -46.6817, precision: 'street', source: 'photon' });
    expect(calledHosts()).not.toContain('brasilapi.com.br');
  }, 15000);

  it('Photon prefere o número de porta na rua certa', async () => {
    mockFetch(() => ({
      body: {
        features: [
          photonFeature(-23.4769, -46.545, { street: 'Rua Cônego Valadão', housenumber: '1500', city: 'Guarulhos' }),
          photonFeature(-23.5566, -46.6587, { street: 'Rua Augusta', housenumber: '1500', city: 'São Paulo', postcode: '01304-001' }),
        ],
      },
    }));
    const r = await fromPhoton({ street: 'Rua Augusta', number: '1500', city: 'São Paulo', state: 'SP', cep: '01304001' });
    expect(r).toMatchObject({ lat: -23.5566, precision: 'address', source: 'photon' });
  });

  it('só usa o centroide da BrasilAPI por último, marcado como cep', async () => {
    mockFetch((url) => {
      if (url.includes('nominatim')) return { body: [] };
      if (url.includes('photon')) return { body: { features: [] } };
      return { body: { location: { coordinates: { longitude: '-46.63611', latitude: '-23.5475' } } } };
    });
    const r = await geocode(input);
    expect(r).toMatchObject({ precision: 'cep', source: 'brasilapi' });
    expect(calledHosts().at(-1)).toBe('brasilapi.com.br');
  }, 15000);

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
