import { db } from "@shuaibin-cookie-app/db";
import { simulators } from "@shuaibin-cookie-app/db/schema";

import { scanRunningClients } from "./simulator-discovery";
import { broadcastToMonitors } from "./websocket-store";

const DEFAULT_SCAN_INTERVAL_MS = 10_000;

interface ClientStatus {
	checkedAt: string;
	running: boolean;
}

const clientStatus = new Map<string, ClientStatus>();
let scanTimer: ReturnType<typeof setInterval> | null = null;
let packageName: string | null = null;

export function getClientStatus(simulatorId: string): ClientStatus | undefined {
	return clientStatus.get(simulatorId);
}

export function getAllClientStatus(): Map<string, ClientStatus> {
	return new Map(clientStatus);
}

export async function scanOnce(pkgName: string): Promise<void> {
	const runningByAdbId = await scanRunningClients(pkgName);
	const allSims = await db
		.select({ id: simulators.id, adbId: simulators.adbId })
		.from(simulators)
		.all();

	const changed: { simulatorId: string; running: boolean }[] = [];

	for (const sim of allSims) {
		const running = sim.adbId
			? (runningByAdbId.get(sim.adbId) ?? false)
			: false;
		const previous = clientStatus.get(sim.id);
		const next: ClientStatus = { running, checkedAt: new Date().toISOString() };
		clientStatus.set(sim.id, next);

		if (!previous || previous.running !== running) {
			changed.push({ simulatorId: sim.id, running });
		}
	}

	if (changed.length > 0) {
		broadcastToMonitors({
			type: "client_status_changed",
			changes: changed,
		});
	}
}

export function startScanning(
	pkgName: string,
	intervalMs = DEFAULT_SCAN_INTERVAL_MS
): void {
	if (scanTimer) {
		stopScanning();
	}
	packageName = pkgName;
	console.log(
		`[client-monitor] start scanning ${pkgName} every ${intervalMs}ms`
	);

	// 立即执行一次
	scanOnce(pkgName).catch((error) => {
		console.error("[client-monitor] initial scan failed:", error);
	});

	scanTimer = setInterval(() => {
		if (!packageName) {
			return;
		}
		scanOnce(packageName).catch((error) => {
			console.error("[client-monitor] scan failed:", error);
		});
	}, intervalMs);
}

export function stopScanning(): void {
	if (scanTimer) {
		clearInterval(scanTimer);
		scanTimer = null;
	}
	packageName = null;
	clientStatus.clear();
}

export function isScanning(): boolean {
	return scanTimer !== null;
}
