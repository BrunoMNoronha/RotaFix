import { lookupCep, CepNotFoundError, type CepAddress } from '@/services/cep';

const okViaCep = { cep: '01310-100', logradouro: 'Avenida Paulista', bairro: 'Bela Vista', localidade: 'São Paulo', uf: 'SP' };
const okBrasilApi = { cep: '01310100', street: 'Avenida Paulista', neighborhood: 'Bela Vista', city: 'São Paulo', state: 'SP' };

function mockFetch(handler: (url: string) => Promise<Partial<Response>> | Partial<Response>) {
  globalThis.fetch = jest.fn(async (input: RequestInfo | URL) => {
    const url = typeof input === 'string' ? input : input.toString();
    return (await handler(url)) as Response;
  }) as unknown as typeof fetch;
}

const json = (body: unknown, status = 200): Partial<Response> => ({
  ok: status >= 200 && status < 300,
  status,
  json: async () => body,
});

describe('lookupCep', () => {
  afterEach(() => jest.restoreAllMocks());

  it('rejeita CEP inválido sem chamar rede', async () => {
    mockFetch(() => json({}));
    await expect(lookupCep('123')).rejects.toThrow('CEP inválido');
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it('usa ViaCEP quando responde', async () => {
    mockFetch((url) => (url.includes('viacep') ? json(okViaCep) : json({}, 500)));
    const r = await lookupCep('01310-100');
    expect(r.street).toBe('Avenida Paulista');
    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
  });

  it('cai para BrasilAPI quando ViaCEP falha com 5xx', async () => {
    mockFetch((url) => (url.includes('viacep') ? json({}, 503) : json(okBrasilApi)));
    const r = await lookupCep('01310100');
    expect(r.city).toBe('São Paulo');
    expect((globalThis.fetch as jest.Mock).mock.calls.some(([u]) => String(u).includes('brasilapi'))).toBe(true);
  });

  it('lança CepNotFoundError quando ViaCEP retorna erro', async () => {
    mockFetch(() => json({ erro: true }));
    await expect(lookupCep('99999999')).rejects.toBeInstanceOf(CepNotFoundError);
  });

  it('usa cache antes da rede e grava depois', async () => {
    const store = new Map<string, CepAddress>();
    const cache = {
      get: async (k: string) => store.get(k) ?? null,
      set: async (k: string, v: CepAddress) => void store.set(k, v),
    };
    mockFetch(() => json(okViaCep));
    await lookupCep('01310100', cache);
    await lookupCep('01310100', cache);
    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
    expect(store.has('01310100')).toBe(true);
  });
});
