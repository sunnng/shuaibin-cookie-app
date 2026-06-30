import { db } from "@shuaibin-cookie-app/db";
import { simulators, type Task, tasks } from "@shuaibin-cookie-app/db/schema";
import { $ } from "bun";
import { existsSync } from "node:fs";
import { eq } from "drizzle-orm";
import { findScriptByPackage } from "./script-store";
import { getScriptWsUrl } from "./server-config";
import { getAdb, setupAdbReverse } from "./simulator-discovery";
import { markTaskError } from "./task-status";
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

	const wsAddress = getScriptWsUrl();
	const apkPath = script.filePath;

	if (!existsSync(apkPath)) {
		throw new Error(`Script APK not found: ${apkPath}`);
	}

	try {
		console.log(`[task:${task.id}] install ${apkPath} -> ${sim.adbId}`);
		try {
			const installOutput =
				await $`"${adb}" -s ${sim.adbId} install -r ${apkPath}`.text();
			console.log(`[task:${task.id}] install output:`, installOutput);
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			if (message.includes("No such file or directory")) {
				throw new Error(`Script APK not found: ${apkPath}`);
			}
			console.log(
				`[task:${task.id}] install failed (may already be installed):`,
				error
			);
		}

		const mainActivity = script.mainActivity || ".MainActivity";
		const componentName = `${task.scriptPackage}/${mainActivity}`;

		console.log(`[task:${task.id}] start ${componentName} on ${sim.adbId}`);
		await setupAdbReverse(sim.adbId);
		const startOutput =
			await $`"${adb}" -s ${sim.adbId} shell am start -n ${componentName} --es ws_address ${wsAddress} --es device_id ${sim.id}`.text();
		console.log(`[task:${task.id}] start output:`, startOutput);

		await db
			.update(tasks)
			.set({
				status: "running",
				startedAt: new Date(),
				progress: 0,
				currentMessage: "已启动",
			})
			.where(eq(tasks.id, task.id));
	} catch (error) {
		const message =
			error instanceof Error ? error.message : "Failed to start APK";
		await markTaskError(task.id, message);
		throw error;
	}
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
