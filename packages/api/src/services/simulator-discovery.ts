import { db } from "@shuaibin-cookie-app/db";
import { type Simulator, simulators } from "@shuaibin-cookie-app/db/schema";
import { $ } from "bun";
import { eq } from "drizzle-orm";

declare const Bun: typeof import("bun");

export interface DiscoveredSimulator {
	adbId: string;
	adbPort: number;
	brand: Simulator["brand"];
	name: string;
	resolution?: string;
	status: "online" | "offline";
}

const LEIDIAN_CANDIDATES = [
	"C:\\Program Files\\LeiDian\\LDPlayer\\ldconsole.exe",
	"C:\\Program Files (x86)\\LeiDian\\LDPlayer\\ldconsole.exe",
	"C:\\leidian\\LDPlayer\\ldconsole.exe",
];

const ADB_PORT_REGEX = /:(\d+)/;
const EMULATOR_PORT_REGEX = /emulator-(\d+)/;
const ANY_PORT_REGEX = /(\d{4,5})/;

async function findExisting(paths: string[]): Promise<string | undefined> {
	for (const path of paths) {
		if (await Bun.file(path).exists()) {
			return path;
		}
	}
	return;
}

function getLeiDianConsoleCandidates(): string[] {
	if (process.env.LEIDIAN_PATH) {
		return [process.env.LEIDIAN_PATH, ...LEIDIAN_CANDIDATES];
	}
	return LEIDIAN_CANDIDATES;
}

async function getLeiDianConsole(): Promise<string> {
	return (
		(await findExisting(getLeiDianConsoleCandidates())) ?? LEIDIAN_CANDIDATES[0]
	);
}

async function getAdb(): Promise<string> {
	if (process.env.ADB_PATH) {
		return process.env.ADB_PATH;
	}

	const userHome =
		process.env.USERPROFILE || `C:\\Users\\${process.env.USERNAME ?? "User"}`;
	const candidates = [
		"adb",
		// Bundled adb inside LeiDian installation
		...(await getLeiDianConsoleCandidates()).map((ldconsole) =>
			ldconsole.replace("ldconsole.exe", "adb.exe")
		),
		// Android SDK default location
		`${userHome}\\AppData\\Local\\Android\\Sdk\\platform-tools\\adb.exe`,
	];

	return (await findExisting(candidates)) ?? "adb";
}

function extractPort(output: string): number {
	const adbMatch = output.match(ADB_PORT_REGEX);
	if (adbMatch?.[1]) {
		return Number.parseInt(adbMatch[1], 10);
	}

	const emulatorMatch = output.match(EMULATOR_PORT_REGEX);
	if (emulatorMatch?.[1]) {
		return Number.parseInt(emulatorMatch[1], 10);
	}

	const anyMatch = output.match(ANY_PORT_REGEX);
	if (anyMatch?.[1]) {
		return Number.parseInt(anyMatch[1], 10);
	}

	return 5555;
}

async function isLeiDianRunning(
	index: string,
	ldconsole: string
): Promise<boolean> {
	try {
		const output = await $`"${ldconsole}" isrunning --index ${index}`.text();
		return output.trim().toLowerCase().includes("running");
	} catch {
		// If isrunning is not supported, assume running
		return true;
	}
}

async function discoverLeiDian(): Promise<DiscoveredSimulator[]> {
	const ldconsole = await getLeiDianConsole();
	const results: DiscoveredSimulator[] = [];

	try {
		console.log(`[discover] LeiDian console: ${ldconsole}`);
		const listOutput = await $`"${ldconsole}" list`.text();
		console.log(`[discover] LeiDian list output:\n${listOutput}`);
		const lines = listOutput.trim().split("\n").filter(Boolean);

		for (const line of lines) {
			const [index, name] = line.split(",");
			if (!(index && name)) {
				continue;
			}

			try {
				const running = await isLeiDianRunning(index, ldconsole);
				console.log(`[discover] LeiDian index=${index} running=${running}`);
				if (!running) {
					continue;
				}

				const adbOutput = await $`"${ldconsole}" adb --index ${index}`.text();
				console.log(
					`[discover] LeiDian adb --index ${index} output:\n${adbOutput}`
				);
				const port = extractPort(adbOutput);

				results.push({
					name: name.trim() || `LeiDian-${index}`,
					brand: "leidian",
					adbId: `127.0.0.1:${port}`,
					adbPort: port,
					status: "online",
				});
			} catch (error) {
				console.log(`[discover] LeiDian index=${index} failed:`, error);
			}
		}
	} catch (error) {
		console.log("[discover] LeiDian not found or CLI error:", error);
	}

	return results;
}

async function discoverMuMu(): Promise<DiscoveredSimulator[]> {
	const results: DiscoveredSimulator[] = [];
	const adb = await getAdb();

	for (let i = 0; i < 16; i++) {
		const port = 7555 + i * 2;
		const adbId = `127.0.0.1:${port}`;

		try {
			await $`"${adb}" -s ${adbId} shell echo ok`.quiet();
			results.push({
				name: `MuMu-${i}`,
				brand: "mumu",
				adbId,
				adbPort: port,
				status: "online",
			});
		} catch {
			// Port not responding
		}
	}

	return results;
}

async function discoverAdb(): Promise<DiscoveredSimulator[]> {
	const adb = await getAdb();
	const results: DiscoveredSimulator[] = [];

	try {
		console.log(`[discover] adb: ${adb}`);
		const output = await $`"${adb}" devices`.text();
		console.log(`[discover] adb devices output:\n${output}`);
		const lines = output.trim().split("\n").slice(1);

		for (const line of lines) {
			const [adbId, state] = line.split("\t");
			if (!adbId || state !== "device") {
				continue;
			}

			const port = extractPort(adbId);

			results.push({
				name: `Device-${adbId}`,
				brand: "adb",
				adbId,
				adbPort: port,
				status: "online",
			});
		}
	} catch (error) {
		console.log("[discover] adb not available:", error);
	}

	return results;
}

export async function discoverSimulators(): Promise<DiscoveredSimulator[]> {
	const [leidian, mumu, adb] = await Promise.all([
		discoverLeiDian(),
		discoverMuMu(),
		discoverAdb(),
	]);

	const map = new Map<string, DiscoveredSimulator>();

	for (const sim of [...leidian, ...mumu, ...adb]) {
		if (!map.has(sim.adbId)) {
			map.set(sim.adbId, sim);
		}
	}

	return Array.from(map.values());
}

export async function syncDiscoveredSimulators(): Promise<Simulator[]> {
	const discovered = await discoverSimulators();
	const synced: Simulator[] = [];
	const now = new Date();

	for (const sim of discovered) {
		const existing = await db
			.select()
			.from(simulators)
			.where(eq(simulators.adbId, sim.adbId))
			.get();

		if (existing) {
			const [updated] = await db
				.update(simulators)
				.set({
					name: sim.name,
					brand: sim.brand,
					adbPort: sim.adbPort,
					status: sim.status,
					lastSeen: now,
				})
				.where(eq(simulators.id, existing.id))
				.returning();
			if (updated) {
				synced.push(updated);
			}
		} else {
			const id = crypto.randomUUID();
			const [created] = await db
				.insert(simulators)
				.values({
					id,
					name: sim.name,
					brand: sim.brand,
					adbId: sim.adbId,
					adbPort: sim.adbPort,
					status: sim.status,
					createdAt: now,
					lastSeen: now,
				})
				.returning();
			if (created) {
				synced.push(created);
			}
		}
	}

	return synced;
}

export async function launchSimulator(sim: Simulator): Promise<void> {
	const ldconsole = await getLeiDianConsole();
	const adb = await getAdb();

	if (sim.brand === "leidian") {
		try {
			const listOutput = await $`"${ldconsole}" list`.text();
			const lines = listOutput.trim().split("\n").filter(Boolean);

			for (const line of lines) {
				const [index, name] = line.split(",");
				if (name?.trim() === sim.name || line.includes(sim.adbId)) {
					await $`"${ldconsole}" launch --index ${index}`.quiet();
					return;
				}
			}
		} catch {
			// Fallback to adb
		}
	}

	try {
		await $`"${adb}" connect ${sim.adbId}`.quiet();
	} catch {
		// Ignore
	}
}

export async function shutdownSimulator(sim: Simulator): Promise<void> {
	const ldconsole = await getLeiDianConsole();
	const adb = await getAdb();

	if (sim.brand === "leidian") {
		try {
			const listOutput = await $`"${ldconsole}" list`.text();
			const lines = listOutput.trim().split("\n").filter(Boolean);

			for (const line of lines) {
				const [index, name] = line.split(",");
				if (name?.trim() === sim.name || line.includes(sim.adbId)) {
					await $`"${ldconsole}" quit --index ${index}`.quiet();
					return;
				}
			}
		} catch {
			// Fallback to adb
		}
	}

	try {
		await $`"${adb}" -s ${sim.adbId} shell reboot -p`.quiet();
	} catch {
		// Ignore
	}
}

export async function arrangeWindows(
	layout: "grid" | "horizontal" | "vertical",
	columns?: number
): Promise<void> {
	const onlineSims = await db
		.select()
		.from(simulators)
		.where(eq(simulators.status, "online"))
		.all();

	if (onlineSims.length === 0) {
		return;
	}

	const winW = 540;
	const winH = 960;
	const cols = columns || Math.ceil(Math.sqrt(onlineSims.length));

	for (let i = 0; i < onlineSims.length; i++) {
		const sim = onlineSims[i];
		if (!sim) {
			continue;
		}
		let x = 0;
		let y = 0;

		if (layout === "grid") {
			const row = Math.floor(i / cols);
			const col = i % cols;
			x = col * winW;
			y = row * winH;
		} else if (layout === "horizontal") {
			x = i * winW;
			y = 0;
		} else if (layout === "vertical") {
			x = 0;
			y = i * winH;
		}

		await positionWindow(sim, x, y, winW, winH);
	}
}

async function positionWindow(
	sim: Simulator,
	x: number,
	y: number,
	w: number,
	h: number
): Promise<void> {
	const ldconsole = await getLeiDianConsole();

	if (sim.brand === "leidian") {
		try {
			const listOutput = await $`"${ldconsole}" list`.text();
			const lines = listOutput.trim().split("\n").filter(Boolean);

			for (const line of lines) {
				const [index, name] = line.split(",");
				if (name?.trim() === sim.name || line.includes(sim.adbId)) {
					await $`"${ldconsole}" modify --index ${index} --resolution ${w},${h} --dpi 240`.quiet();
					return;
				}
			}
		} catch {
			// Ignore
		}
	}

	console.log(`[arrange] ${sim.name} -> (${x}, ${y}) ${w}x${h}`);
}
