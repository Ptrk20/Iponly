import { getDatabase } from "@/db";
import { connection } from "next/server";
import { sql } from "drizzle-orm";

export async function GET() {
  await connection();

  try {
    await getDatabase().execute(sql`select 1`);
    return Response.json(
      { status: "ok", database: "reachable" },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch {
    console.error("Iponly health check failed.", { category: "database-unreachable" });
    return Response.json(
      { status: "error", database: "unavailable" },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
}
