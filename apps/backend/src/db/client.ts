import 'dotenv/config';
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import { config } from '../config.js';
import * as schema from './schema.js';

const pool = new Pool({
  connectionString: config.databaseUrl,
  // Serverless-friendly tuning: allow the pool to grow beyond the default so a
  // burst of concurrent function invocations can each borrow a connection.
  max: Number(process.env.PG_POOL_MAX ?? 10),
  // Fail fast instead of hanging when the DB is unreachable.
  connectionTimeoutMillis: Number(process.env.PG_CONNECTION_TIMEOUT_MS ?? 5000),
  // Idle connections are released quickly so serverless processes can exit.
  idleTimeoutMillis: Number(process.env.PG_IDLE_TIMEOUT_MS ?? 10000),
  // Neon (and most managed Postgres) require TLS. Enable it when the URL asks
  // for `sslmode=require` (e.g. Neon) or when running in production. Local dev
  // without sslmode stays unencrypted.
  ssl: config.isProduction || /(^|[?&])sslmode=require/.test(config.databaseUrl)
    ? { rejectUnauthorized: false }
    : undefined,
});

export const db = drizzle(pool, { schema });

export type Db = typeof db;
export type DBClient = Db;
