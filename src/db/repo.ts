import type { SQLiteDatabase } from 'expo-sqlite';
import type { GeocodePrecision, GeocodeStatus, NewStop, Route, Stop } from './types';
import { uuid } from '@/utils/uuid';

interface RouteRow {
  id: string;
  name: string;
  start_lat: number | null;
  start_lng: number | null;
  created_at: number;
  optimized_at: number | null;
}

interface StopRow {
  id: string;
  route_id: string;
  cep: string;
  street: string;
  neighborhood: string;
  city: string;
  state: string;
  number: string | null;
  complement: string | null;
  label: string | null;
  lat: number | null;
  lng: number | null;
  geocode_status: GeocodeStatus;
  geocode_precision: GeocodePrecision | null;
  sequence: number | null;
  done: number;
  created_at: number;
}

const toRoute = (r: RouteRow): Route => ({
  id: r.id,
  name: r.name,
  startLat: r.start_lat,
  startLng: r.start_lng,
  createdAt: r.created_at,
  optimizedAt: r.optimized_at,
});

const toStop = (s: StopRow): Stop => ({
  id: s.id,
  routeId: s.route_id,
  cep: s.cep,
  street: s.street,
  neighborhood: s.neighborhood,
  city: s.city,
  state: s.state,
  number: s.number,
  complement: s.complement,
  label: s.label,
  lat: s.lat,
  lng: s.lng,
  geocodeStatus: s.geocode_status,
  geocodePrecision: s.geocode_precision ?? null,
  sequence: s.sequence,
  done: s.done === 1,
  createdAt: s.created_at,
});

type SqlValue = string | number | null;

const STOP_COLUMNS: Record<string, string> = {
  cep: 'cep',
  street: 'street',
  neighborhood: 'neighborhood',
  city: 'city',
  state: 'state',
  number: 'number',
  complement: 'complement',
  label: 'label',
  lat: 'lat',
  lng: 'lng',
  geocodeStatus: 'geocode_status',
  geocodePrecision: 'geocode_precision',
  sequence: 'sequence',
  done: 'done',
};

export class Repo {
  constructor(private readonly db: SQLiteDatabase) {}

  // ---- routes ----
  async listRoutes(): Promise<Route[]> {
    const rows = await this.db.getAllAsync<RouteRow>('SELECT * FROM routes ORDER BY created_at DESC');
    return rows.map(toRoute);
  }

  async getRoute(id: string): Promise<Route | null> {
    const row = await this.db.getFirstAsync<RouteRow>('SELECT * FROM routes WHERE id = ?', [id]);
    return row ? toRoute(row) : null;
  }

  async createRoute(name: string): Promise<Route> {
    const route: Route = {
      id: uuid(),
      name,
      startLat: null,
      startLng: null,
      createdAt: Date.now(),
      optimizedAt: null,
    };
    await this.db.runAsync(
      'INSERT INTO routes (id, name, start_lat, start_lng, created_at, optimized_at) VALUES (?, ?, ?, ?, ?, ?)',
      [route.id, route.name, null, null, route.createdAt, null],
    );
    return route;
  }

  async renameRoute(id: string, name: string): Promise<void> {
    await this.db.runAsync('UPDATE routes SET name = ? WHERE id = ?', [name, id]);
  }

  async setRouteStart(id: string, lat: number | null, lng: number | null): Promise<void> {
    await this.db.runAsync('UPDATE routes SET start_lat = ?, start_lng = ? WHERE id = ?', [lat, lng, id]);
  }

  async deleteRoute(id: string): Promise<void> {
    await this.db.runAsync('DELETE FROM routes WHERE id = ?', [id]);
  }

  // ---- stops ----
  async listStops(routeId: string): Promise<Stop[]> {
    const rows = await this.db.getAllAsync<StopRow>(
      `SELECT * FROM stops WHERE route_id = ?
       ORDER BY done ASC, CASE WHEN sequence IS NULL THEN 1 ELSE 0 END, sequence ASC, created_at ASC`,
      [routeId],
    );
    return rows.map(toStop);
  }

  async countStops(routeId: string): Promise<{ total: number; done: number }> {
    const row = await this.db.getFirstAsync<{ total: number; done: number }>(
      'SELECT COUNT(*) AS total, COALESCE(SUM(done), 0) AS done FROM stops WHERE route_id = ?',
      [routeId],
    );
    return row ?? { total: 0, done: 0 };
  }

  async createStop(input: NewStop): Promise<Stop> {
    const stop: Stop = { ...input, id: uuid(), createdAt: Date.now(), sequence: null, done: false };
    await this.insertStop(stop);
    return stop;
  }

  private async insertStop(s: Stop): Promise<void> {
    await this.db.runAsync(
      `INSERT OR REPLACE INTO stops (id, route_id, cep, street, neighborhood, city, state, number, complement, label,
        lat, lng, geocode_status, geocode_precision, sequence, done, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        s.id,
        s.routeId,
        s.cep,
        s.street,
        s.neighborhood,
        s.city,
        s.state,
        s.number,
        s.complement,
        s.label,
        s.lat,
        s.lng,
        s.geocodeStatus,
        s.geocodePrecision,
        s.sequence,
        s.done ? 1 : 0,
        s.createdAt,
      ],
    );
  }

  async updateStop(id: string, patch: Partial<Omit<Stop, 'id' | 'routeId' | 'createdAt'>>): Promise<void> {
    const sets: string[] = [];
    const params: SqlValue[] = [];
    for (const [key, col] of Object.entries(STOP_COLUMNS)) {
      if (key in patch) {
        const value = (patch as Record<string, unknown>)[key];
        sets.push(`${col} = ?`);
        params.push(typeof value === 'boolean' ? (value ? 1 : 0) : (value as SqlValue));
      }
    }
    if (sets.length === 0) return;
    params.push(id);
    await this.db.runAsync(`UPDATE stops SET ${sets.join(', ')} WHERE id = ?`, params);
  }

  async deleteStop(id: string): Promise<void> {
    await this.db.runAsync('DELETE FROM stops WHERE id = ?', [id]);
  }

  async applySequence(routeId: string, orderedIds: string[]): Promise<void> {
    await this.db.withTransactionAsync(async () => {
      await this.db.runAsync('UPDATE stops SET sequence = NULL WHERE route_id = ?', [routeId]);
      for (let i = 0; i < orderedIds.length; i++) {
        await this.db.runAsync('UPDATE stops SET sequence = ? WHERE id = ?', [i + 1, orderedIds[i]]);
      }
      await this.db.runAsync('UPDATE routes SET optimized_at = ? WHERE id = ?', [Date.now(), routeId]);
    });
  }

  // ---- cep cache ----
  async getCepCache(cep: string, maxAgeMs: number): Promise<string | null> {
    const row = await this.db.getFirstAsync<{ payload: string; fetched_at: number }>(
      'SELECT payload, fetched_at FROM cep_cache WHERE cep = ?',
      [cep],
    );
    if (!row) return null;
    if (Date.now() - row.fetched_at > maxAgeMs) return null;
    return row.payload;
  }

  async setCepCache(cep: string, payload: string): Promise<void> {
    await this.db.runAsync('INSERT OR REPLACE INTO cep_cache (cep, payload, fetched_at) VALUES (?, ?, ?)', [
      cep,
      payload,
      Date.now(),
    ]);
  }

  // ---- export / import ----
  async exportAll(): Promise<{ routes: Route[]; stops: Stop[] }> {
    const routes = await this.listRoutes();
    const rows = await this.db.getAllAsync<StopRow>('SELECT * FROM stops');
    return { routes, stops: rows.map(toStop) };
  }

  async importAll(data: { routes: Route[]; stops: Stop[] }): Promise<void> {
    await this.db.withTransactionAsync(async () => {
      for (const r of data.routes) {
        await this.db.runAsync(
          'INSERT OR REPLACE INTO routes (id, name, start_lat, start_lng, created_at, optimized_at) VALUES (?, ?, ?, ?, ?, ?)',
          [r.id, r.name, r.startLat, r.startLng, r.createdAt, r.optimizedAt],
        );
      }
      for (const s of data.stops) {
        await this.insertStop(s);
      }
    });
  }
}
