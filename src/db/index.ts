import "server-only";
import { neonConfig, Pool } from "@neondatabase/serverless";
import WebSocket from "ws";
import { drizzle } from "drizzle-orm/neon-serverless";
import * as schema from "@/db/schema";
import { getServerEnv } from "@/lib/server-env";

neonConfig.webSocketConstructor ??= WebSocket;

const createDatabase = (pool: Pool) => drizzle(pool, { schema });
export type IponlyDatabase = ReturnType<typeof createDatabase>;

const globalForDatabase = globalThis as typeof globalThis & {
  iponlyDatabase?: IponlyDatabase;
  iponlyPool?: Pool;
};

export function getDatabase(): IponlyDatabase {
  const { DATABASE_URL } = getServerEnv();

  if (!globalForDatabase.iponlyPool) {
    globalForDatabase.iponlyPool = new Pool({ connectionString: DATABASE_URL, max: 3 });
  }

  if (!globalForDatabase.iponlyDatabase) {
    globalForDatabase.iponlyDatabase = createDatabase(globalForDatabase.iponlyPool);
  }

  return globalForDatabase.iponlyDatabase;
}

export async function closeDatabasePool(): Promise<void> {
  const pool = globalForDatabase.iponlyPool;
  globalForDatabase.iponlyPool = undefined;
  globalForDatabase.iponlyDatabase = undefined;
  if (pool) await pool.end();
}