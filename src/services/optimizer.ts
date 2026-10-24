import type { LatLng } from '@/db/types';
import { haversine } from '@/utils/haversine';

export interface OptimizablePoint extends LatLng {
  id: string;
}

export interface OptimizeResult {
  orderedIds: string[];
  totalDistance: number;
}

/** Distância total do caminho aberto start → p[0] → p[1] → ... */
export function pathDistance(start: LatLng, points: LatLng[]): number {
  let total = 0;
  let prev = start;
  for (const p of points) {
    total += haversine(prev, p);
    prev = p;
  }
  return total;
}

function buildMatrix(nodes: LatLng[]): number[][] {
  const n = nodes.length;
  const m: number[][] = Array.from({ length: n }, () => new Array<number>(n).fill(0));
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const d = haversine(nodes[i], nodes[j]);
      m[i][j] = d;
      m[j][i] = d;
    }
  }
  return m;
}

/** Nearest neighbor a partir do índice 0 (start). Retorna ordem dos índices 1..n. */
function nearestNeighbor(m: number[][]): number[] {
  const n = m.length;
  const visited = new Array<boolean>(n).fill(false);
  visited[0] = true;
  const order: number[] = [];
  let current = 0;
  for (let step = 1; step < n; step++) {
    let best = -1;
    let bestD = Infinity;
    for (let j = 1; j < n; j++) {
      if (!visited[j] && m[current][j] < bestD) {
        bestD = m[current][j];
        best = j;
      }
    }
    visited[best] = true;
    order.push(best);
    current = best;
  }
  return order;
}

/** 2-opt para caminho aberto (sem retorno ao início). */
function twoOpt(m: number[][], order: number[], timeBudgetMs: number): number[] {
  const path = [0, ...order];
  const n = path.length;
  const deadline = Date.now() + timeBudgetMs;
  let improved = true;
  while (improved && Date.now() < deadline) {
    improved = false;
    for (let i = 1; i < n - 1; i++) {
      for (let k = i + 1; k < n; k++) {
        const a = path[i - 1];
        const b = path[i];
        const c = path[k];
        const d = k + 1 < n ? path[k + 1] : null;
        const before = m[a][b] + (d !== null ? m[c][d] : 0);
        const after = m[a][c] + (d !== null ? m[b][d] : 0);
        if (after + 1e-9 < before) {
          // reverte o segmento i..k
          let lo = i;
          let hi = k;
          while (lo < hi) {
            const tmp = path[lo];
            path[lo] = path[hi];
            path[hi] = tmp;
            lo++;
            hi--;
          }
          improved = true;
        }
      }
    }
  }
  return path.slice(1);
}

/**
 * Resolve o TSP aberto: começa em `start`, visita todos os pontos uma vez,
 * não precisa voltar. Nearest Neighbor + 2-opt, limite de tempo padrão 200 ms.
 */
export function optimizeRoute(
  start: LatLng,
  points: OptimizablePoint[],
  timeBudgetMs = 200,
): OptimizeResult {
  if (points.length === 0) return { orderedIds: [], totalDistance: 0 };
  if (points.length === 1) {
    return { orderedIds: [points[0].id], totalDistance: haversine(start, points[0]) };
  }
  const nodes: LatLng[] = [start, ...points];
  const m = buildMatrix(nodes);
  const nn = nearestNeighbor(m);
  const improved = twoOpt(m, nn, timeBudgetMs);
  const ordered = improved.map((idx) => points[idx - 1]);
  return {
    orderedIds: ordered.map((p) => p.id),
    totalDistance: pathDistance(start, ordered),
  };
}
