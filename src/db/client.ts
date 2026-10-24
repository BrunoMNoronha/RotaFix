import type { SQLiteDatabase } from 'expo-sqlite';

export const DB_NAME = 'rotafix.db';

const MIGRATIONS: string[] = [
  `
  CREATE TABLE IF NOT EXISTS routes (
    id TEXT PRIMARY KEY NOT NULL,
    name TEXT NOT NULL,
    start_lat REAL,
    start_lng REAL,
    created_at INTEGER NOT NULL,
    optimized_at INTEGER
  );
  CREATE TABLE IF NOT EXISTS stops (
    id TEXT PRIMARY KEY NOT NULL,
    route_id TEXT NOT NULL REFERENCES routes(id) ON DELETE CASCADE,
    cep TEXT NOT NULL,
    street TEXT NOT NULL DEFAULT '',
    neighborhood TEXT NOT NULL DEFAULT '',
    city TEXT NOT NULL DEFAULT '',
    state TEXT NOT NULL DEFAULT '',
    number TEXT,
    complement TEXT,
    label TEXT,
    lat REAL,
    lng REAL,
    geocode_status TEXT NOT NULL DEFAULT 'pending',
    sequence INTEGER,
    done INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_stops_route_seq ON stops(route_id, sequence);
  CREATE INDEX IF NOT EXISTS idx_stops_cep ON stops(cep);
  CREATE TABLE IF NOT EXISTS cep_cache (
    cep TEXT PRIMARY KEY NOT NULL,
    payload TEXT NOT NULL,
    fetched_at INTEGER NOT NULL
  );
  `,
];

export async function migrate(db: SQLiteDatabase): Promise<void> {
  await db.execAsync('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;');
  const row = await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version');
  let version = row?.user_version ?? 0;
  while (version < MIGRATIONS.length) {
    await db.execAsync(MIGRATIONS[version]);
    version += 1;
    await db.execAsync(`PRAGMA user_version = ${version}`);
  }
}
