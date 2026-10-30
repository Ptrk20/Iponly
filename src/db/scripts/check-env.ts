import { loadEnvConfig } from "@next/env";
import { getServerEnv } from "@/lib/server-env";

loadEnvConfig(process.cwd());

try {
	getServerEnv();
} catch (error) {
	const message = error instanceof Error ? error.message : "Required server configuration is unavailable.";
	console.error(message);
	process.exitCode = 1;
}