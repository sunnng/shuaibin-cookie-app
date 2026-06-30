import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const simulators = sqliteTable("simulators", {
	id: text("id").primaryKey(),
	name: text("name").notNull(),
	brand: text("brand", { enum: ["leidian", "mumu", "bluestacks", "adb"] })
		.notNull()
		.default("adb"),
	adbId: text("adb_id").notNull(),
	adbPort: integer("adb_port"),
	androidId: text("android_id").unique(),
	status: text("status", { enum: ["offline", "online", "busy"] })
		.notNull()
		.default("offline"),
	resolution: text("resolution"),
	createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
	lastSeen: integer("last_seen", { mode: "timestamp_ms" }).notNull(),
});

export type Simulator = typeof simulators.$inferSelect;
export type NewSimulator = typeof simulators.$inferInsert;
