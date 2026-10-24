import { optimizeRoute, pathDistance } from '@/services/optimizer';
import type { OptimizablePoint } from '@/services/optimizer';

// Pontos reais em São Paulo (aprox.)
const start = { lat: -23.5505, lng: -46.6333 }; // Sé
const points: OptimizablePoint[] = [
  { id: 'paulista', lat: -23.5614, lng: -46.6559 },
  { id: 'ibirapuera', lat: -23.5874, lng: -46.6576 },
  { id: 'luz', lat: -23.5362, lng: -46.6336 },
  { id: 'pinheiros', lat: -23.5672, lng: -46.6936 },
  { id: 'moema', lat: -23.6005, lng: -46.6646 },
  { id: 'bras', lat: -23.5417, lng: -46.6161 },
];

describe('optimizeRoute', () => {
  it('retorna vazio sem pontos', () => {
    expect(optimizeRoute(start, [])).toEqual({ orderedIds: [], totalDistance: 0 });
  });

  it('retorna o único ponto', () => {
    const r = optimizeRoute(start, [points[0]]);
    expect(r.orderedIds).toEqual(['paulista']);
    expect(r.totalDistance).toBeGreaterThan(2000);
  });

  it('visita cada ponto exatamente uma vez', () => {
    const r = optimizeRoute(start, points);
    expect([...r.orderedIds].sort()).toEqual(points.map((p) => p.id).sort());
  });

  it('não é pior que a ordem de entrada', () => {
    const r = optimizeRoute(start, points);
    const naive = pathDistance(start, points);
    expect(r.totalDistance).toBeLessThanOrEqual(naive + 1e-6);
  });

  it('é determinístico', () => {
    expect(optimizeRoute(start, points)).toEqual(optimizeRoute(start, points));
  });

  it('melhora uma ordem propositalmente ruim', () => {
    // alterna extremos norte/sul para forçar zigue-zague
    const bad = [points[2], points[4], points[5], points[1], points[3], points[0]];
    const r = optimizeRoute(start, bad);
    expect(r.totalDistance).toBeLessThan(pathDistance(start, bad) * 0.9);
  });

  it('o primeiro ponto é o mais próximo do início (em grafo pequeno)', () => {
    const r = optimizeRoute(start, points);
    expect(['luz', 'bras']).toContain(r.orderedIds[0]);
  });
});
