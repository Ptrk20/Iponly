import { loadEnvConfig } from "@next/env";
import { sql } from "drizzle-orm";
import { closeDatabasePool, getDatabase } from "@/db";
import { getServerEnv } from "@/lib/server-env";

async function main() {
  loadEnvConfig(process.cwd());

  try {
    getServerEnv();
    await getDatabase().execute(sql`select 1`);
    process.stdout.write(`${JSON.stringify({ status: "ok", databaseReachable: true, checkedAt: new Date().toISOString() })}\n`);
  } catch {
    console.error("Iponly database health check failed.");
    process.stdout.write(`${JSON.stringify({ status: "error", databaseReachable: false, checkedAt: new Date().toISOString() })}\n`);
    process.exitCode = 1;
  } finally {
    await closeDatabasePool();
  }
}

void main();