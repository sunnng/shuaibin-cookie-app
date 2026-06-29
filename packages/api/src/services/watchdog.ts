import { db } from "@shuaibin-cookie-app/db";
import { simulators, tasks } from "@shuaibin-cookie-app/db/schema";
import { eq } from "drizzle-orm";

import { restartTask } from "./task-runner";
import { broadcastToMonitors, getDeviceConnection } from "./websocket-store";

const HEARTBEAT_TIMEOUT = 30_000;
const WATCHDOG_INTERVAL = 10_000;

export function startWatchdog(): void {
	setInterval(async () => {
		const runningTasks = await db
			.select()
			.from(tasks)
			.where(eq(tasks.status, "running"))
			.all();

		for (const task of runningTasks) {
			const conn = getDeviceConnection(task.simulatorId);
			const sim = await db
				.select()
				.from(simulators)
				.where(eq(simulators.id, task.simulatorId))
				.get();

			const lastSeen = conn?.lastHeartbeat ?? sim?.lastSeen?.getTime() ?? 0;
			const now = Date.now();

			if (now - lastSeen <= HEARTBEAT_TIMEOUT) {
				continue;
			}

			await db
				.update(tasks)
				.set({ status: "error", currentMessage: "Heartbeat timeout" })
				.where(eq(tasks.id, task.id));

			if (task.retryCount < task.maxRetries) {
				const nextRetry = task.retryCount + 1;
				await db
					.update(tasks)
					.set({ retryCount: nextRetry })
					.where(eq(tasks.id, task.id));

				broadcastToMonitors({
					type: "alert",
					alert: "auto_retry",
					taskId: task.id,
					retryCount: nextRetry,
					maxRetries: task.maxRetries,
				});

				try {
					await restartTask(task);
				} catch (error) {
					const message =
						error instanceof Error ? error.message : String(error);
					await db
						.update(tasks)
						.set({
							status: "error",
							currentMessage: `Auto-retry failed: ${message}`,
						})
						.where(eq(tasks.id, task.id));
				}
			} else {
				broadcastToMonitors({
					type: "alert",
					alert: "manual_handling",
					taskId: task.id,
					message: "Retries exhausted, needs manual handling",
				});
			}
		}
	}, WATCHDOG_INTERVAL);
}
