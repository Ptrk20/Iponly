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
  } catch (error) {
    let diagnosticError = error;
    for (let depth = 0; depth < 5; depth += 1) {
      if (diagnosticError instanceof Error && diagnosticError.cause) {
        diagnosticError = diagnosticError.cause;
      } else {
        break;
      }
    }
    const errorCode =
      typeof diagnosticError === "object" &&
      diagnosticError !== null &&
      "code" in diagnosticError &&
      typeof diagnosticError.code === "string"
        ? diagnosticError.code
        : undefined;
    const rawMessage =
      diagnosticError instanceof Error
        ? diagnosticError.message
        : typeof diagnosticError === "object" &&
            diagnosticError !== null &&
            "message" in diagnosticError &&
            typeof diagnosticError.message === "string"
          ? diagnosticError.message
          : "Unknown error";
    const errorMessage = rawMessage
      .replace(/postgres(?:ql)?:\/\/[^\s"'`]+/gi, "[redacted database URL]")
      .replace(/password[=:]\s*[^,\s;]+/gi, "password=[redacted]")
      .slice(0, 240);
    console.error(
      `Iponly database health check failed (${errorCode ?? errorMessage}).`,
    );
    process.stdout.write(`${JSON.stringify({ status: "error", databaseReachable: false, checkedAt: new Date().toISOString() })}\n`);
    process.exitCode = 1;
  } finally {
    await closeDatabasePool();
  }
}

void main();