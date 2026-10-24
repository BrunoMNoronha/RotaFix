import { create } from 'zustand';
import type { LatLng, NewStop, Route, Stop } from '@/db/types';
import { Repo } from '@/db/repo';
import { lookupCep, type CepAddress } from '@/services/cep';
import { geocode } from '@/services/geocode';
import { optimizeRoute } from '@/services/optimizer';

const CEP_CACHE_TTL = 30 * 24 * 60 * 60 * 1000; // 30 dias

export interface RouteSummary extends Route {
  total: number;
  done: number;
}

interface RoutesState {
  repo: Repo | null;
  routes: RouteSummary[];
  stops: Record<string, Stop[]>;
  geocoding: Record<string, boolean>; // stopId -> em andamento

  init(repo: Repo): Promise<void>;
  loadRoutes(): Promise<void>;
  createRoute(name: string): Promise<Route>;
  renameRoute(id: string, name: string): Promise<void>;
  deleteRoute(id: string): Promise<void>;
  setRouteStart(id: string, start: LatLng | null): Promise<void>;

  loadStops(routeId: string): Promise<void>;
  lookupCep(cep: string): Promise<CepAddress>;
  addStop(input: NewStop): Promise<Stop>;
  updateStop(routeId: string, id: string, patch: Partial<Stop>): Promise<void>;
  toggleDone(routeId: string, id: string): Promise<void>;
  deleteStop(routeId: string, id: string): Promise<void>;

  geocodeStop(routeId: string, stop: Stop): Promise<void>;
  retryPendingGeocodes(routeId: string): Promise<void>;
  optimize(routeId: string, start: LatLng): Promise<{ totalDistance: number; skipped: number }>;
}

/** Sem coordenadas, ou com coordenadas aproximadas (centroide do CEP / precisão desconhecida). */
export function needsGeocodeRetry(s: Stop): boolean {
  return s.geocodeStatus !== 'ok' || s.geocodePrecision === 'cep' || s.geocodePrecision === null;
}

function requireRepo(repo: Repo | null): Repo {
  if (!repo) throw new Error('Banco de dados não inicializado');
  return repo;
}

export const useRoutesStore = create<RoutesState>((set, get) => ({
  repo: null,
  routes: [],
  stops: {},
  geocoding: {},

  async init(repo) {
    set({ repo });
    await get().loadRoutes();
  },

  async loadRoutes() {
    const repo = requireRepo(get().repo);
    const routes = await repo.listRoutes();
    const summaries = await Promise.all(
      routes.map(async (r) => ({ ...r, ...(await repo.countStops(r.id)) })),
    );
    set({ routes: summaries });
  },

  async createRoute(name) {
    const repo = requireRepo(get().repo);
    const route = await repo.createRoute(name);
    await get().loadRoutes();
    return route;
  },

  async renameRoute(id, name) {
    await requireRepo(get().repo).renameRoute(id, name);
    await get().loadRoutes();
  },

  async deleteRoute(id) {
    await requireRepo(get().repo).deleteRoute(id);
    set((s) => {
      const stops = { ...s.stops };
      delete stops[id];
      return { stops };
    });
    await get().loadRoutes();
  },

  async setRouteStart(id, start) {
    await requireRepo(get().repo).setRouteStart(id, start?.lat ?? null, start?.lng ?? null);
    await get().loadRoutes();
  },

  async loadStops(routeId) {
    const repo = requireRepo(get().repo);
    const list = await repo.listStops(routeId);
    set((s) => ({ stops: { ...s.stops, [routeId]: list } }));
  },

  async lookupCep(cep) {
    const repo = requireRepo(get().repo);
    return lookupCep(cep, {
      get: async (k) => {
        const raw = await repo.getCepCache(k, CEP_CACHE_TTL);
        return raw ? (JSON.parse(raw) as CepAddress) : null;
      },
      set: (k, v) => repo.setCepCache(k, JSON.stringify(v)),
    });
  },

  async addStop(input) {
    const repo = requireRepo(get().repo);
    const stop = await repo.createStop(input);
    await get().loadStops(input.routeId);
    await get().loadRoutes();
    if (stop.geocodeStatus === 'pending') {
      // dispara em background; não bloqueia a UI
      void get().geocodeStop(input.routeId, stop);
    }
    return stop;
  },

  async updateStop(routeId, id, patch) {
    await requireRepo(get().repo).updateStop(id, patch);
    await get().loadStops(routeId);
  },

  async toggleDone(routeId, id) {
    const current = get().stops[routeId]?.find((s) => s.id === id);
    if (!current) return;
    await requireRepo(get().repo).updateStop(id, { done: !current.done });
    await get().loadStops(routeId);
    await get().loadRoutes();
  },

  async deleteStop(routeId, id) {
    await requireRepo(get().repo).deleteStop(id);
    await get().loadStops(routeId);
    await get().loadRoutes();
  },

  async geocodeStop(routeId, stop) {
    const repo = requireRepo(get().repo);
    set((s) => ({ geocoding: { ...s.geocoding, [stop.id]: true } }));
    try {
      const coords = await geocode({
        street: stop.street,
        number: stop.number,
        neighborhood: stop.neighborhood,
        city: stop.city,
        state: stop.state,
        cep: stop.cep,
      });
      if (coords) {
        await repo.updateStop(stop.id, {
          lat: coords.lat,
          lng: coords.lng,
          geocodeStatus: 'ok',
          geocodePrecision: coords.precision,
        });
      } else {
        await repo.updateStop(stop.id, { geocodeStatus: 'failed' });
      }
    } catch {
      await repo.updateStop(stop.id, { geocodeStatus: 'failed' });
    } finally {
      set((s) => {
        const geocoding = { ...s.geocoding };
        delete geocoding[stop.id];
        return { geocoding };
      });
      await get().loadStops(routeId);
    }
  },

  async retryPendingGeocodes(routeId) {
    const list = get().stops[routeId] ?? [];
    const pending = list.filter(needsGeocodeRetry);
    for (const s of pending) {
      await get().geocodeStop(routeId, s);
    }
  },

  async optimize(routeId, start) {
    const repo = requireRepo(get().repo);
    const list = get().stops[routeId] ?? (await repo.listStops(routeId));
    const candidates = list.filter(
      (s): s is Stop & { lat: number; lng: number } => !s.done && s.lat !== null && s.lng !== null,
    );
    const result = optimizeRoute(
      start,
      candidates.map((s) => ({ id: s.id, lat: s.lat, lng: s.lng })),
    );
    await repo.applySequence(routeId, result.orderedIds);
    await get().loadStops(routeId);
    await get().loadRoutes();
    return { totalDistance: result.totalDistance, skipped: list.length - candidates.length };
  },
}));
