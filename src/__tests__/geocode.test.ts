import {
  geocode,
  fromBrasilApiCep,
  matchesPlace,
  normalizeName,
  simplifyStreet,
  quadraToken,
  streetVariants,
} from '@/services/geocode';

const fariaLima = {
  street: 'Avenida Brigadeiro Faria Lima',
  number: '1811',
  neighborhood: 'Itaim Bibi',
  city: 'São Paulo',
  state: 'SP',
  cep: '04538133',
};

// CEP real que motivou a correção: QS 601 não está mapeada no OSM.
const samambaia = {
  street: 'Quadra QS 601 Conjunto B Comércio',
  number: null,
  neighborhood: 'Samambaia Norte (Samambaia)',
  city: 'Brasília',
  state: 'DF',
  cep: '72331502',
};

type Handler = (url: string) => { status?: number; body: unknown };

function mockFetch(handler: Handler) {
  globalThis.fetch = jest.fn(async (u: RequestInfo | URL) => {
    const { status = 200, body } = handler(String(u));
    return { ok: status < 300, status, json: async () => body } as Response;
  }) as unknown as typeof fetch;
}

const calls = () => (globalThis.fetch as jest.Mock).mock.calls.map(([u]) => decodeURIComponent(String(u)));
const hosts = () => calls().map((u) => new URL(u).host);

const nom = (lat: string, lon: string, address: Record<string, string>, name?: string) => ({ lat, lon, name, address });
const photon = (lat: number, lng: number, props: Record<string, string>) => ({
  geometry: { coordinates: [lng, lat] },
  properties: { country: 'Brasil', countrycode: 'BR', ...props },
});
const brasilApiCenter = { location: { coordinates: { longitude: '-47.92972', latitude: '-15.77972' } } };

describe('normalização', () => {
  it('normalizeName ignora acentos, caixa e parênteses', () => {
    expect(normalizeName('São Paulo')).toBe('sao paulo');
    expect(normalizeName('Samambaia Norte (Samambaia)')).toBe('samambaia norte');
  });
  it('simplifyStreet remove ruído do padrão DF', () => {
    expect(simplifyStreet('Quadra QS 601 Conjunto B Comércio')).toBe('QS 601 Conjunto B');
    expect(simplifyStreet('Quadra QNM 34 Área Especial 1')).toBe('QNM 34');
    expect(simplifyStreet('Rua Augusta')).toBe('Rua Augusta');
  });
  it('quadraToken extrai o código da quadra', () => {
    expect(quadraToken('Quadra QS 601 Conjunto B')).toBe('qs 601');
    expect(quadraToken('SQN 310 Bloco A')).toBe('sqn 310');
    expect(quadraToken('Rua Augusta')).toBeNull();
  });
  it('streetVariants não repete quando não há simplificação', () => {
    expect(streetVariants('Rua Augusta')).toEqual(['Rua Augusta']);
    expect(streetVariants(samambaia.street)).toEqual(['Quadra QS 601 Conjunto B Comércio', 'QS 601 Conjunto B']);
  });
});

describe('matchesPlace', () => {
  const base = { lat: 0, lng: 0 };
  it('aceita cidade igual ou CEP igual', () => {
    expect(matchesPlace({ ...base, city: 'Sao Paulo' }, fariaLima)).toBe(true);
    expect(matchesPlace({ ...base, city: 'Osasco', postcode: '04538-133' }, fariaLima)).toBe(true);
  });
  it('rejeita homônimo em outra cidade', () => {
    expect(matchesPlace({ ...base, city: 'Guarulhos', postcode: '07040-000' }, fariaLima)).toBe(false);
  });
  it('aceita bairro igual no mesmo estado (RA do DF)', () => {
    expect(
      matchesPlace({ ...base, city: 'Samambaia', state: 'Distrito Federal', neighborhood: 'Samambaia Norte' }, samambaia),
    ).toBe(true);
    expect(matchesPlace({ ...base, city: 'Goiânia', state: 'Goiás', neighborhood: 'Samambaia Norte' }, samambaia)).toBe(false);
  });
});

describe('geocode', () => {
  beforeEach(() => {
    delete process.env.EXPO_PUBLIC_GOOGLE_GEOCODING_API_KEY;
  });

  it('Nominatim estruturado com número → address', async () => {
    mockFetch((url) =>
      url.includes('nominatim')
        ? { body: [nom('-23.5880', '-46.6820', { road: 'Avenida Brigadeiro Faria Lima', city: 'São Paulo', postcode: '04538-133', house_number: '1811' })] }
        : { body: {} },
    );
    const r = await geocode(fariaLima);
    expect(r).toMatchObject({ lat: -23.588, lng: -46.682, precision: 'address', source: 'nominatim' });
    expect(hosts()).toEqual(['nominatim.openstreetmap.org']);
    expect(calls()[0]).toContain('postalcode=04538133');
    expect(calls()[0]).toContain('street=1811 Avenida Brigadeiro Faria Lima');
  });

  it('descarta Nominatim em outra cidade e, sem alternativas, devolve null', async () => {
    mockFetch((url) => {
      if (url.includes('nominatim')) return { body: [nom('-23.47', '-46.54', { city: 'Guarulhos', postcode: '07040-000' })] };
      if (url.includes('photon')) return { body: { features: [] } };
      return { status: 404, body: {} };
    });
    expect(await geocode(fariaLima)).toBeNull();
  }, 20000);

  it('Nominatim 403 → Photon escolhe o trecho do CEP', async () => {
    mockFetch((url) => {
      if (url.includes('nominatim')) return { status: 403, body: {} };
      if (url.includes('photon'))
        return {
          body: {
            features: [
              photon(-23.594, -46.68, { name: 'Avenida Brigadeiro Faria Lima', city: 'São Paulo', postcode: '04552-040' }),
              photon(-23.589, -46.6817, { name: 'Avenida Brigadeiro Faria Lima', city: 'São Paulo', postcode: '04538-133' }),
            ],
          },
        };
      return { body: {} };
    });
    const r = await geocode(fariaLima);
    expect(r).toMatchObject({ lat: -23.589, lng: -46.6817, precision: 'street', source: 'photon' });
    expect(hosts()).not.toContain('brasilapi.com.br');
  }, 20000);

  it('Photon prefere número de porta na rua certa', async () => {
    mockFetch((url) => {
      if (url.includes('nominatim')) return { body: [] };
      if (url.includes('photon'))
        return {
          body: {
            features: [
              photon(-23.4769, -46.545, { street: 'Rua Cônego Valadão', housenumber: '1500', city: 'Guarulhos' }),
              photon(-23.5566, -46.6587, { street: 'Rua Augusta', housenumber: '1500', city: 'São Paulo', postcode: '01304-001' }),
            ],
          },
        };
      return { body: {} };
    });
    const r = await geocode({ street: 'Rua Augusta', number: '1500', city: 'São Paulo', state: 'SP', cep: '01304001' });
    expect(r).toMatchObject({ lat: -23.5566, precision: 'address', source: 'photon' });
  }, 20000);

  it('CEP 72331502 (DF): rejeita quadra vizinha e cai no centro do bairro, não no Plano Piloto', async () => {
    mockFetch((url) => {
      if (url.includes('nominatim') && url.includes('q=Samambaia')) {
        // busca por bairro
        return {
          body: [nom('-15.8677728', '-48.0993771', { suburb: 'Samambaia Norte', city: 'Samambaia', state: 'Distrito Federal', postcode: '72316-041' }, 'Samambaia Norte')],
        };
      }
      if (url.includes('nominatim') && url.includes('q=')) {
        // texto livre com rua simplificada: devolve quadra vizinha QS 604
        return {
          body: [nom('-15.8612842', '-48.0894600', { road: 'Norte QS 604 Conjunto B', suburb: 'Samambaia Norte', city: 'Samambaia', state: 'Distrito Federal', postcode: '72322-530' }, 'Norte QS 604 Conjunto B')],
        };
      }
      if (url.includes('nominatim')) return { body: [] }; // estruturado: vazio
      if (url.includes('photon'))
        return {
          body: {
            features: [
              photon(-15.86264, -48.08903, { name: 'Norte QS 604 Conjunto B', district: 'Samambaia Norte', city: 'Samambaia', state: 'Distrito Federal', postcode: '72322-530' }),
            ],
          },
        };
      return { body: brasilApiCenter };
    });
    const r = await geocode(samambaia);
    expect(r).toMatchObject({ lat: -15.8677728, lng: -48.0993771, precision: 'neighborhood', source: 'nominatim' });
    expect(hosts()).not.toContain('brasilapi.com.br');
  }, 30000);

  it('CEP 72331502 (DF): aceita a quadra certa mesmo com cidade "Samambaia"', async () => {
    mockFetch((url) => {
      if (url.includes('nominatim'))
        return {
          body: [nom('-15.8600', '-48.0900', { road: 'Norte QS 601 Conjunto B', suburb: 'Samambaia Norte', city: 'Samambaia', state: 'Distrito Federal', postcode: '72331-502' }, 'Norte QS 601 Conjunto B')],
        };
      return { body: {} };
    });
    const r = await geocode(samambaia);
    expect(r).toMatchObject({ lat: -15.86, lng: -48.09, precision: 'street', source: 'nominatim' });
    expect(hosts()).toEqual(['nominatim.openstreetmap.org']);
  });

  it('BrasilAPI só por último, marcada como cep', async () => {
    mockFetch((url) => {
      if (url.includes('nominatim')) return { body: [] };
      if (url.includes('photon')) return { body: { features: [] } };
      return { body: brasilApiCenter };
    });
    const r = await geocode(samambaia);
    expect(r).toMatchObject({ precision: 'cep', source: 'brasilapi' });
    expect(hosts().at(-1)).toBe('brasilapi.com.br');
  }, 30000);

  it('retorna null quando tudo falha', async () => {
    mockFetch(() => ({ status: 500, body: {} }));
    expect(await geocode(fariaLima)).toBeNull();
  }, 30000);

  it('fromBrasilApiCep rejeita 0,0 ou ausente', async () => {
    mockFetch(() => ({ body: { location: { coordinates: { longitude: '0', latitude: '0' } } } }));
    expect(await fromBrasilApiCep('01310200')).toBeNull();
    mockFetch(() => ({ body: {} }));
    expect(await fromBrasilApiCep('01310200')).toBeNull();
  });
});
