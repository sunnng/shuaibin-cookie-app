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
	if (!script) {
		throw new Error("Script APK not found");
	}

	console.log(`[task:${task.id}] install ${script.filePath} -> ${sim.adbId}`);
	try {
		const installOutput =
			await $`"${adb}" -s ${sim.adbId} install -r ${script.filePath}`.text();
		console.log(`[task:${task.id}] install output:`, installOutput);
	} catch (error) {
		console.log(
			`[task:${task.id}] install failed (may already be installed):`,
			error
		);
	}

	const mainActivity = script.mainActivity || ".MainActivity";
	const componentName = `${task.scriptPackage}/${mainActivity}`;

	const wsHost = process.env.SERVER_HOST || "localhost";
	const wsAddress = `ws://${wsHost}:3000/ws/script`;

	console.log(`[task:${task.id}] start ${componentName} on ${sim.adbId}`);
	try {
		const startOutput =
			await $`"${adb}" -s ${sim.adbId} shell am start -n ${componentName} --es ws_address ${wsAddress} --es device_id ${sim.id}`.text();
		console.log(`[task:${task.id}] start output:`, startOutput);
	} catch (error) {
		console.log(`[task:${task.id}] start failed:`, error);
		throw new Error(`Failed to start APK: ${componentName}`);
	}

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
