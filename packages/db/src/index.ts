import { createClient } from "@libsql/client";
import { env } from "@shuaibin-cookie-app/env/server";
import { drizzle } from "drizzle-orm/libsql";

// biome-ignore lint/performance/noNamespaceImport: Drizzle requires the full schema namespace
import * as schema from "./schema";

export function createDb() {
	const client = createClient({
		url: env.DATABASE_URL,
	});

	return drizzle({ client, schema });
}

export const db = createDb();
