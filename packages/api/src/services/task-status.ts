import { db } from "@shuaibin-cookie-app/db";
import { type Task, tasks } from "@shuaibin-cookie-app/db/schema";
import { desc, eq } from "drizzle-orm";

type TaskStatus = Task["status"];

const STATUS_PRIORITY: Record<TaskStatus, number> = {
	running: 5,
	paused: 4,
	error: 3,
	idle: 2,
	completed: 1,
};

export async function findActiveTaskForSimulator(
	simulatorId: string
): Promise<Task | undefined> {
	const rows = await db
		.select()
		.from(tasks)
		.where(eq(tasks.simulatorId, simulatorId))
		.all();

	if (rows.length === 0) {
		return;
	}

	return rows.reduce((best, current) => {
		const bestPriority = STATUS_PRIORITY[best.status];
		const currentPriority = STATUS_PRIORITY[current.status];
		if (currentPriority > bestPriority) {
			return current;
		}
		if (currentPriority < bestPriority) {
			return best;
		}
		return current.createdAt > best.createdAt ? current : best;
	});
}

export interface TaskStatusUpdate {
	currentMessage?: string;
	progress?: number;
	status?: string;
}

export async function updateTaskStatusFromDevice(
	deviceId: string,
	update: TaskStatusUpdate
): Promise<Task | undefined> {
	const task = await findActiveTaskForSimulator(deviceId);
	if (!task) {
		return;
	}

	const set: Partial<typeof tasks.$inferInsert> = {};
	if (update.status) {
		set.status = update.status as TaskStatus;
		if (update.status === "completed") {
			set.finishedAt = new Date();
		}
	}
	if (update.progress !== undefined) {
		set.progress = update.progress;
	}
	if (update.currentMessage !== undefined) {
		set.currentMessage = update.currentMessage;
	}

	if (Object.keys(set).length === 0) {
		return task;
	}

	const [updated] = await db
		.update(tasks)
		.set(set)
		.where(eq(tasks.id, task.id))
		.returning();

	return updated;
}

export async function markTaskError(
	taskId: string,
	message: string
): Promise<void> {
	await db
		.update(tasks)
		.set({
			status: "error",
			currentMessage: message,
			finishedAt: new Date(),
		})
		.where(eq(tasks.id, taskId));
}

export function getLatestIdleTaskForSimulator(
	simulatorId: string,
	scriptPackage: string
): Promise<Task | undefined> {
	return db
		.select()
		.from(tasks)
		.where(eq(tasks.simulatorId, simulatorId))
		.orderBy(desc(tasks.createdAt))
		.all()
		.then((rows) =>
			rows.find((t) => t.status === "idle" && t.scriptPackage === scriptPackage)
		);
}

export function getBlockingTaskForSimulator(
	simulatorId: string
): Promise<Task | undefined> {
	return db
		.select()
		.from(tasks)
		.where(eq(tasks.simulatorId, simulatorId))
		.orderBy(desc(tasks.createdAt))
		.all()
		.then((rows) =>
			rows.find((t) => t.status === "running" || t.status === "paused")
		);
}
