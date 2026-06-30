import { db } from "@shuaibin-cookie-app/db";
import { simulators, tasks } from "@shuaibin-cookie-app/db/schema";
import { eq } from "drizzle-orm";
import { z } from "zod";

import { publicProcedure } from "../index";
import { findScriptByPackage } from "../services/script-store";
import {
	installAndStart,
	restartTask,
	sendCommandToDevice,
	stopTask,
} from "../services/task-runner";
import {
	getBlockingTaskForSimulator,
	getLatestIdleTaskForSimulator,
} from "../services/task-status";
import { getLogs } from "../services/websocket-store";

const taskIdsSchema = z.object({ taskIds: z.array(z.string()) });
const taskIdSchema = z.object({ taskId: z.string() });
const assignSchema = z.object({
	simulatorIds: z.array(z.string()),
	scriptName: z.string(),
	scriptPackage: z.string(),
});

export const taskRouter = {
	list: publicProcedure.handler(async () =>
		db
			.select({
				task: tasks,
				simulator: simulators,
			})
			.from(tasks)
			.leftJoin(simulators, eq(tasks.simulatorId, simulators.id))
			.all()
	),

	assign: publicProcedure.input(assignSchema).handler(async ({ input }) => {
		const script = await findScriptByPackage(input.scriptPackage);
		if (!script) {
			throw new Error("Script APK not found");
		}

		const created: (typeof tasks.$inferSelect)[] = [];
		const skipped: string[] = [];
		const errors: { simulatorId: string; reason: string }[] = [];
		const now = new Date();

		for (const simulatorId of input.simulatorIds) {
			const blocking = await getBlockingTaskForSimulator(simulatorId);
			if (blocking) {
				errors.push({
					simulatorId,
					reason: `设备已有运行中任务 (${blocking.scriptName})`,
				});
				continue;
			}

			const existingIdle = await getLatestIdleTaskForSimulator(
				simulatorId,
				input.scriptPackage
			);

			if (existingIdle) {
				const [updated] = await db
					.update(tasks)
					.set({
						scriptName: input.scriptName,
						scriptPackage: input.scriptPackage,
						scriptVersion: script.versionName ?? null,
						progress: 0,
						currentMessage: null,
						status: "idle",
					})
					.where(eq(tasks.id, existingIdle.id))
					.returning();
				if (updated) {
					created.push(updated);
				}
				continue;
			}

			const idleTasks = await db
				.select()
				.from(tasks)
				.where(eq(tasks.simulatorId, simulatorId))
				.all();
			const otherIdle = idleTasks.filter((t) => t.status === "idle");
			for (const idle of otherIdle) {
				await db.delete(tasks).where(eq(tasks.id, idle.id));
			}

			const [task] = await db
				.insert(tasks)
				.values({
					id: crypto.randomUUID(),
					simulatorId,
					scriptName: input.scriptName,
					scriptPackage: input.scriptPackage,
					scriptVersion: script.versionName ?? null,
					status: "idle",
					progress: 0,
					retryCount: 0,
					maxRetries: 3,
					createdAt: now,
				})
				.returning();

			if (task) {
				created.push(task);
			} else {
				skipped.push(simulatorId);
			}
		}

		return { created, skipped, errors };
	}),

	start: publicProcedure.input(taskIdsSchema).handler(async ({ input }) => {
		const failed: { taskId: string; reason: string }[] = [];

		for (const taskId of input.taskIds) {
			const task = await db
				.select()
				.from(tasks)
				.where(eq(tasks.id, taskId))
				.get();
			if (!task) {
				failed.push({ taskId, reason: "Task not found" });
				continue;
			}

			try {
				await installAndStart(task);
			} catch (error) {
				const reason =
					error instanceof Error ? error.message : "Failed to start task";
				failed.push({ taskId, reason });
			}
		}

		return { success: failed.length === 0, failed };
	}),

	pause: publicProcedure.input(taskIdsSchema).handler(async ({ input }) => {
		for (const taskId of input.taskIds) {
			const task = await db
				.select()
				.from(tasks)
				.where(eq(tasks.id, taskId))
				.get();
			if (!task) {
				continue;
			}

			sendCommandToDevice(task.simulatorId, "pause");
			await db
				.update(tasks)
				.set({ status: "paused" })
				.where(eq(tasks.id, task.id));
		}

		return { success: true };
	}),

	resume: publicProcedure.input(taskIdsSchema).handler(async ({ input }) => {
		for (const taskId of input.taskIds) {
			const task = await db
				.select()
				.from(tasks)
				.where(eq(tasks.id, taskId))
				.get();
			if (!task) {
				continue;
			}

			sendCommandToDevice(task.simulatorId, "resume");
			await db
				.update(tasks)
				.set({ status: "running" })
				.where(eq(tasks.id, task.id));
		}

		return { success: true };
	}),

	stop: publicProcedure.input(taskIdsSchema).handler(async ({ input }) => {
		for (const taskId of input.taskIds) {
			const task = await db
				.select()
				.from(tasks)
				.where(eq(tasks.id, taskId))
				.get();
			if (!task) {
				continue;
			}

			await stopTask(task);
		}

		return { success: true };
	}),

	restart: publicProcedure.input(taskIdSchema).handler(async ({ input }) => {
		const task = await db
			.select()
			.from(tasks)
			.where(eq(tasks.id, input.taskId))
			.get();
		if (!task) {
			throw new Error("Task not found");
		}

		await restartTask(task);
		return { success: true };
	}),

	logs: publicProcedure
		.input(z.object({ id: z.string() }))
		.handler(async ({ input }) => {
			const task = await db
				.select()
				.from(tasks)
				.where(eq(tasks.id, input.id))
				.get();

			if (!task) {
				throw new Error("Task not found");
			}

			return getLogs(task.simulatorId);
		}),
};
