import { db } from "@shuaibin-cookie-app/db";
import { simulators, type Task, tasks } from "@shuaibin-cookie-app/db/schema";
import { $ } from "bun";
import { eq } from "drizzle-orm";
import { findScriptByPackage } from "./script-store";
import { getAdb } from "./simulator-discovery";
import { sendCommand } from "./websocket-store";

export async function installAndStart(task: Task): Promise<void> {
	const adb = await getAdb();
	if (!adb) {
		throw new Error("adb not found; set ADB_PATH env var");
	}

	const sim = await db
		.select()
		.from(simulators)
		.where(eq(simulators.id, task.simulatorId))
		.get();

	if (!sim) {
		throw new Error("Simulator not found");
	}

	const script = await findScriptByPackage(task.scriptPackage);

	if (script) {
		try {
			await $`"${adb}" -s ${sim.adbId} install -r ${script.filePath}`.quiet();
		} catch {
			// APK may already be installed with same signature
		}
	}

	const wsHost = process.env.SERVER_HOST || "localhost";
	const wsAddress = `ws://${wsHost}:3000/ws/script`;

	await $`"${adb}" -s ${sim.adbId} shell am start -n ${task.scriptPackage}/.MainActivity --es ws_address ${wsAddress} --es device_id ${sim.id}`.quiet();

	await db
		.update(tasks)
		.set({ status: "running", startedAt: new Date() })
		.where(eq(tasks.id, task.id));
}

export async function stopTask(task: Task): Promise<void> {
	const adb = await getAdb();
	const sim = await db
		.select()
		.from(simulators)
		.where(eq(simulators.id, task.simulatorId))
		.get();

	if (sim) {
		sendCommand(sim.id, "stop");
		if (adb) {
			try {
				await $`"${adb}" -s ${sim.adbId} shell am force-stop ${task.scriptPackage}`.quiet();
			} catch {
				// Ignore force-stop errors
			}
		}
	}

	await db
		.update(tasks)
		.set({ status: "idle", finishedAt: new Date() })
		.where(eq(tasks.id, task.id));
}

export async function restartTask(task: Task): Promise<void> {
	await stopTask(task);
	await installAndStart(task);
}

export function sendCommandToDevice(
	deviceId: string,
	action: string,
	payload?: unknown
): boolean {
	return sendCommand(deviceId, action, payload);
}
