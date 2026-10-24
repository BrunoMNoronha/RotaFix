/**
 * Verifica a geocodificação contra as APIs reais.
 *   npx tsx scripts/geocode-check.ts 72331502 [numero]
 */
import { geocode } from '../src/services/geocode';
import { lookupCep } from '../src/services/cep';

(globalThis as { __DEV__?: boolean }).__DEV__ = true;

async function main() {
  const [cep, number] = process.argv.slice(2);
  if (!cep) throw new Error('uso: tsx scripts/geocode-check.ts <cep> [numero]');
  const a = await lookupCep(cep);
  console.log('Endereço:', a);
  const t = Date.now();
  const r = await geocode({ ...a, number: number ?? null });
  console.log(`Resultado (${Date.now() - t} ms):`, r);
  if (r) console.log(`https://www.openstreetmap.org/?mlat=${r.lat}&mlon=${r.lng}#map=16/${r.lat}/${r.lng}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
