export const USER_AGENT = 'RotaFix/1.0 (contato: rotafix.app@gmail.com)';

export class HttpError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = 'HttpError';
  }
}

interface FetchOptions {
  timeoutMs?: number;
  retries?: number;
  headers?: Record<string, string>;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** fetch JSON com timeout e retries com backoff exponencial. */
export async function fetchJson<T>(url: string, opts: FetchOptions = {}): Promise<T> {
  const { timeoutMs = 8000, retries = 2, headers = {} } = opts;
  let lastError: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(url, {
        headers: { Accept: 'application/json', 'User-Agent': USER_AGENT, ...headers },
        signal: controller.signal,
      });
      if (!res.ok) {
        // 4xx não adianta repetir (exceto 429)
        if (res.status >= 400 && res.status < 500 && res.status !== 429) {
          throw new HttpError(res.status, `HTTP ${res.status} em ${url}`);
        }
        throw new HttpError(res.status, `HTTP ${res.status} em ${url}`);
      }
      return (await res.json()) as T;
    } catch (err) {
      lastError = err;
      const isClientError = err instanceof HttpError && err.status < 500 && err.status !== 429;
      if (isClientError || attempt === retries) break;
      await sleep(300 * 2 ** attempt);
    } finally {
      clearTimeout(timer);
    }
  }
  throw lastError instanceof Error ? lastError : new Error('Falha de rede');
}

/** Limitador simples: garante intervalo mínimo entre chamadas (ex.: Nominatim 1 req/s). */
export function createThrottle(minIntervalMs: number) {
  let last = 0;
  let chain: Promise<void> = Promise.resolve();
  return function throttle<T>(fn: () => Promise<T>): Promise<T> {
    const run = chain.then(async () => {
      const wait = last + minIntervalMs - Date.now();
      if (wait > 0) await sleep(wait);
      last = Date.now();
    });
    chain = run.catch(() => undefined);
    return run.then(fn);
  };
}
