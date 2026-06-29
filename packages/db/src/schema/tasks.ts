import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

import { simulators } from "./simulators";

export const tasks = sqliteTable("tasks", {
	id: text("id").primaryKey(),
	simulatorId: text("simulator_id")
		.notNull()
		.references(() => simulators.id, { onDelete: "cascade" }),
	scriptName: text("script_name").notNull(),
	scriptPackage: text("script_package").notNull(),
	scriptVersion: text("script_version"),
	status: text("status", {
		enum: ["idle", "running", "paused", "completed", "error"],
	})
		.notNull()
		.default("idle"),
	progress: integer("progress").notNull().default(0),
	currentMessage: text("current_message"),
	retryCount: integer("retry_count").notNull().default(0),
	maxRetries: integer("max_retries").notNull().default(3),
	startedAt: integer("started_at", { mode: "timestamp_ms" }),
	finishedAt: integer("finished_at", { mode: "timestamp_ms" }),
	createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
});

export type Task = typeof tasks.$inferSelect;
export type NewTask = typeof tasks.$inferInsert;
export type TaskStatus = Task["status"];
