import { db } from "@shuaibin-cookie-app/db";
import { type Simulator, simulators } from "@shuaibin-cookie-app/db/schema";
import { $ } from "bun";
import { eq, notInArray } from "drizzle-orm";
import { getServerPort } from "./server-config";

async function execText(exe: string, args: string[]): Promise<string> {
	const proc = Bun.spawn([exe, ...args], { stdout: "pipe", stderr: "pipe" });
	const buffer = await new Response(proc.stdout).arrayBuffer();
	await proc.exited;

	if (process.platform === "win32") {
		try {
			return new TextDecoder("gbk").decode(buffer);
		} catch {
			// Fall back to UTF-8 when GBK is unavailable.
		}
	}

	return new TextDecoder().decode(buffer);
}

function getLeiDianAdbPort(index: string): number {
	return 5555 + Number.parseInt(index, 10) * 2;
}

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
	"C:\\leidian\\LDPlayer9\\ldconsole.exe",
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

async function getLeiDianConsole(): Promise<string | undefined> {
	return await findExisting(getLeiDianConsoleCandidates());
}

export async function getAdb(): Promise<string | undefined> {
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

	return findExisting(candidates);
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

function getLeiDianEmulatorSerial(connectPort: number): string {
	return `emulator-${connectPort - 1}`;
}

function isLeiDianAdbAlias(
	adbId: string,
	leidianConnectPorts: Set<number>
): boolean {
	if (adbId.startsWith("127.0.0.1:")) {
		const port = Number.parseInt(adbId.split(":")[1] ?? "", 10);
		return leidianConnectPorts.has(port);
	}

	if (adbId.startsWith("emulator-")) {
		const emuPort = Number.parseInt(adbId.replace("emulator-", ""), 10);
		for (const connectPort of leidianConnectPorts) {
			if (emuPort === connectPort - 1) {
				return true;
			}
		}
	}

	return false;
}

async function connectAdbEndpoint(adbId: string): Promise<void> {
	const adb = await getAdb();
	if (!adb || !adbId.includes(":")) {
		return;
	}

	try {
		await $`"${adb}" connect ${adbId}`.quiet();
	} catch {
		// Ignore connect errors; reachability check decides final status.
	}
}

async function resolveLeiDianReachability(
	connectPort: number
): Promise<boolean> {
	const adb = await getAdb();
	if (!adb) {
		return false;
	}

	const adbId = `127.0.0.1:${connectPort}`;
	await connectAdbEndpoint(adbId);
	if (await isAdbReachable(adbId)) {
		return true;
	}

	const emulatorSerial = getLeiDianEmulatorSerial(connectPort);
	return await isAdbReachable(emulatorSerial);
}

async function isAdbReachable(adbId: string): Promise<boolean> {
	const adb = await getAdb();
	if (!adb) {
		return false;
	}
	try {
		await $`"${adb}" -s ${adbId} shell echo ok`.quiet();
		return true;
	} catch {
		return false;
	}
}

async function isLeiDianRunning(
	index: string,
	ldconsole: string
): Promise<boolean> {
	try {
		const output = await execText(ldconsole, [
			"isrunning",
			"--index",
			index,
		]);
		const text = output.trim().toLowerCase();
		if (
			text === "0" ||
			text === "false" ||
			text.includes("not running") ||
			text.includes("stopped") ||
			text.includes("stop")
		) {
			return false;
		}
		if (text === "1" || text === "true" || text === "running") {
			return true;
		}
		return false;
	} catch {
		return false;
	}
}

function parseLeiDianListLine(
	line: string
): { index: string; name: string } | null {
	const trimmed = line.trim();
	if (!/^\d+,/.test(trimmed)) {
		return null;
	}

	const commaIdx = trimmed.indexOf(",");
	const index = trimmed.slice(0, commaIdx).trim();
	const rest = trimmed.slice(commaIdx + 1);
	const nameEnd = rest.indexOf(",");
	const name = (nameEnd === -1 ? rest : rest.slice(0, nameEnd)).trim();

	if (!(index && name)) {
		return null;
	}

	return { index, name };
}

async function getLeiDianListOutput(ldconsole: string): Promise<string> {
	try {
		const list2Output = await execText(ldconsole, ["list2"]);
		const hasValidEntry = list2Output
			.trim()
			.split("\n")
			.some((line) => parseLeiDianListLine(line) !== null);
		if (hasValidEntry) {
			return list2Output;
		}
	} catch {
		// LDPlayer 9+ uses list2; fall back to legacy list output.
	}

	return await execText(ldconsole, ["list"]);
}

async function discoverLeiDian(): Promise<DiscoveredSimulator[]> {
	const ldconsole = await getLeiDianConsole();
	const results: DiscoveredSimulator[] = [];

	if (!ldconsole) {
		console.log(
			"[discover] LeiDian console not found; set LEIDIAN_PATH env var"
		);
		return results;
	}

	try {
		console.log(`[discover] LeiDian console: ${ldconsole}`);
		const listOutput = await getLeiDianListOutput(ldconsole);
		console.log(`[discover] LeiDian list output:\n${listOutput}`);
		const lines = listOutput.trim().split("\n").filter(Boolean);

		for (const line of lines) {
			const parsed = parseLeiDianListLine(line);
			if (!parsed) {
				continue;
			}
			const { index, name } = parsed;

			try {
				const port = getLeiDianAdbPort(index);
				const adbId = `127.0.0.1:${port}`;
				const running = await isLeiDianRunning(index, ldconsole);
				if (!running) {
					console.log(`[discover] LeiDian index=${index} not running, skip`);
					continue;
				}

				const reachable = await resolveLeiDianReachability(port);
				console.log(
					`[discover] LeiDian index=${index} running=${running} reachable=${reachable}`
				);
				if (!reachable) {
					continue;
				}

				results.push({
					name: name.trim() || `LeiDian-${index}`,
					brand: "leidian",
					adbId,
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

	if (!adb) {
		console.log("[discover] adb not found; set ADB_PATH env var");
		return results;
	}

	for (let i = 0; i < 16; i++) {
		const port = 7555 + i * 2;
		const adbId = `127.0.0.1:${port}`;

		await connectAdbEndpoint(adbId);
		if (await isAdbReachable(adbId)) {
			results.push({
				name: `MuMu-${i}`,
				brand: "mumu",
				adbId,
				adbPort: port,
				status: "online",
			});
		}
	}

	return results;
}

async function discoverAdb(
	leidianConnectPorts: Set<number> = new Set()
): Promise<DiscoveredSimulator[]> {
	const adb = await getAdb();
	const results: DiscoveredSimulator[] = [];

	if (!adb) {
		console.log("[discover] adb not found; set ADB_PATH env var");
		return results;
	}

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

			if (isLeiDianAdbAlias(adbId, leidianConnectPorts)) {
				console.log(`[discover] skip adb alias for LeiDian: ${adbId}`);
				continue;
			}

			if (!(await isAdbReachable(adbId))) {
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
	const leidian = await discoverLeiDian();
	const leidianConnectPorts = new Set(leidian.map((sim) => sim.adbPort));

	const [mumu, adb] = await Promise.all([
		discoverMuMu(),
		discoverAdb(leidianConnectPorts),
	]);

	const map = new Map<string, DiscoveredSimulator>();

	for (const sim of [...leidian, ...mumu, ...adb]) {
		const existing = map.get(sim.adbId);
		if (!existing) {
			map.set(sim.adbId, sim);
			continue;
		}
		if (sim.status === "online" && existing.status === "offline") {
			map.set(sim.adbId, sim);
		}
	}

	return Array.from(map.values());
}

export async function setupAdbReverse(adbId: string): Promise<void> {
	const adb = await getAdb();
	if (!adb) {
		console.log("[adb] adb not found; skip reverse for", adbId);
		return;
	}
	try {
		const port = getServerPort();
		await $`"${adb}" -s ${adbId} reverse tcp:${port} tcp:${port}`.quiet();
		console.log(`[adb] reverse tcp:${port} set for`, adbId);
	} catch {
		console.log(`[adb] reverse tcp:${getServerPort()} failed for`, adbId);
	}
}

export async function getEmulatorAndroidId(
	adbId: string
): Promise<string | undefined> {
	const adb = await getAdb();
	if (!adb) {
		return;
	}
	try {
		const output =
			await $`"${adb}" -s ${adbId} shell settings get secure android_id`.text();
		const id = output.trim();
		return id && id !== "null" ? id : undefined;
	} catch {
		return;
	}
}

async function tryUpdateSimulator(
	existingId: string,
	sim: DiscoveredSimulator,
	androidId: string | undefined,
	now: Date
): Promise<Simulator | undefined> {
	const set: Partial<typeof simulators.$inferInsert> = {
		name: sim.name,
		brand: sim.brand,
		adbPort: sim.adbPort,
		status: sim.status,
		lastSeen: now,
	};
	if (androidId) {
		set.androidId = androidId;
	}

	try {
		const [updated] = await db
			.update(simulators)
			.set(set)
			.where(eq(simulators.id, existingId))
			.returning();
		return updated;
	} catch (error) {
		console.log(`[discover] update androidId for ${sim.adbId} failed:`, error);
		const [updated] = await db
			.update(simulators)
			.set({
				name: sim.name,
				brand: sim.brand,
				adbPort: sim.adbPort,
				status: sim.status,
				lastSeen: now,
			})
			.where(eq(simulators.id, existingId))
			.returning();
		return updated;
	}
}

async function tryCreateSimulator(
	sim: DiscoveredSimulator,
	androidId: string | undefined,
	now: Date
): Promise<Simulator | undefined> {
	const id = crypto.randomUUID();
	const values: typeof simulators.$inferInsert = {
		id,
		name: sim.name,
		brand: sim.brand,
		adbId: sim.adbId,
		adbPort: sim.adbPort,
		status: sim.status,
		createdAt: now,
		lastSeen: now,
	};
	if (androidId) {
		values.androidId = androidId;
	}

	try {
		const [created] = await db.insert(simulators).values(values).returning();
		return created;
	} catch (error) {
		console.log(
			`[discover] insert simulator ${sim.adbId} with androidId failed:`,
			error
		);
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
		return created;
	}
}

export async function syncDiscoveredSimulators(): Promise<Simulator[]> {
	const discovered = await discoverSimulators();
	const synced: Simulator[] = [];
	const now = new Date();
	const discoveredAdbIds = discovered.map((sim) => sim.adbId);

	for (const sim of discovered) {
		const androidId =
			sim.status === "online"
				? await getEmulatorAndroidId(sim.adbId)
				: undefined;
		const existing = await db
			.select()
			.from(simulators)
			.where(eq(simulators.adbId, sim.adbId))
			.get();

		const record = existing
			? await tryUpdateSimulator(existing.id, sim, androidId, now)
			: await tryCreateSimulator(sim, androidId, now);

		if (record) {
			synced.push(record);
		}

		if (sim.status === "online") {
			await setupAdbReverse(sim.adbId);
		}
	}

	if (discoveredAdbIds.length > 0) {
		await db
			.delete(simulators)
			.where(notInArray(simulators.adbId, discoveredAdbIds));
	} else {
		await db.delete(simulators);
	}

	const all = await db.select().from(simulators).all();
	return all;
}

export async function isClientRunning(
	adbId: string,
	packageName: string
): Promise<boolean> {
	const adb = await getAdb();
	if (!adb) {
		return false;
	}
	try {
		// 优先使用 pidof（Android 7+ 支持）
		const output =
			await $`"${adb}" -s ${adbId} shell pidof ${packageName}`.text();
		return output.trim() !== "";
	} catch {
		// 兜底：用 ps 过滤
		try {
			const output =
				await $`"${adb}" -s ${adbId} shell ps -A | grep ${packageName}`.text();
			return output.trim() !== "";
		} catch {
			return false;
		}
	}
}

export async function scanRunningClients(
	packageName: string
): Promise<Map<string, boolean>> {
	const adb = await getAdb();
	const result = new Map<string, boolean>();
	if (!adb) {
		return result;
	}

	const onlineSims = await db
		.select({ adbId: simulators.adbId })
		.from(simulators)
		.where(eq(simulators.status, "online"))
		.all();
	await Promise.all(
		onlineSims.map(async (sim) => {
			if (!sim.adbId) {
				return;
			}
			const running = await isClientRunning(sim.adbId, packageName);
			result.set(sim.adbId, running);
		})
	);
	return result;
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

	if (sim.brand === "leidian" && ldconsole) {
		try {
			const listOutput = await getLeiDianListOutput(ldconsole);
			const lines = listOutput.trim().split("\n").filter(Boolean);

			for (const line of lines) {
				const parsed = parseLeiDianListLine(line);
				if (!parsed) {
					continue;
				}
				const { index, name } = parsed;
				if (name === sim.name || line.includes(sim.adbId)) {
					await execText(ldconsole, [
						"modify",
						"--index",
						index,
						"--resolution",
						`${w},${h}`,
						"--dpi",
						"240",
					]);
					return;
				}
			}
		} catch {
			// Ignore
		}
	}

	console.log(`[arrange] ${sim.name} -> (${x}, ${y}) ${w}x${h}`);
}
