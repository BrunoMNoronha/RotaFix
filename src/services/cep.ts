import { fetchJson } from './http';
import { normalizeCep, isValidCep } from '@/utils/cep';

export interface CepAddress {
  cep: string;
  street: string;
  neighborhood: string;
  city: string;
  state: string;
}

export class CepNotFoundError extends Error {
  constructor(cep: string) {
    super(`CEP ${cep} não encontrado`);
    this.name = 'CepNotFoundError';
  }
}

interface ViaCepResponse {
  cep?: string;
  logradouro?: string;
  bairro?: string;
  localidade?: string;
  uf?: string;
  erro?: boolean | string;
}

interface BrasilApiResponse {
  cep: string;
  street?: string;
  neighborhood?: string;
  city?: string;
  state?: string;
}

export interface CepCache {
  get(cep: string): Promise<CepAddress | null>;
  set(cep: string, value: CepAddress): Promise<void>;
}

export function mapViaCep(cep: string, r: ViaCepResponse): CepAddress {
  return {
    cep,
    street: r.logradouro ?? '',
    neighborhood: r.bairro ?? '',
    city: r.localidade ?? '',
    state: r.uf ?? '',
  };
}

export function mapBrasilApi(cep: string, r: BrasilApiResponse): CepAddress {
  return {
    cep,
    street: r.street ?? '',
    neighborhood: r.neighborhood ?? '',
    city: r.city ?? '',
    state: r.state ?? '',
  };
}

async function fromViaCep(cep: string): Promise<CepAddress> {
  const r = await fetchJson<ViaCepResponse>(`https://viacep.com.br/ws/${cep}/json/`);
  if (r.erro) throw new CepNotFoundError(cep);
  return mapViaCep(cep, r);
}

async function fromBrasilApi(cep: string): Promise<CepAddress> {
  const r = await fetchJson<BrasilApiResponse>(`https://brasilapi.com.br/api/cep/v2/${cep}`);
  return mapBrasilApi(cep, r);
}

/**
 * Busca endereço de um CEP: cache → ViaCEP → BrasilAPI.
 * Lança CepNotFoundError quando ambos dizem que não existe.
 */
export async function lookupCep(input: string, cache?: CepCache): Promise<CepAddress> {
  const cep = normalizeCep(input);
  if (!isValidCep(cep)) throw new Error('CEP inválido: informe 8 dígitos');

  const cached = await cache?.get(cep);
  if (cached) return cached;

  let result: CepAddress;
  try {
    result = await fromViaCep(cep);
  } catch (err) {
    if (err instanceof CepNotFoundError) throw err;
    try {
      result = await fromBrasilApi(cep);
    } catch (err2) {
      // BrasilAPI responde 404 quando não existe
      if (err2 instanceof Error && 'status' in err2 && (err2 as { status: number }).status === 404) {
        throw new CepNotFoundError(cep);
      }
      throw err2;
    }
  }
  await cache?.set(cep, result);
  return result;
}
