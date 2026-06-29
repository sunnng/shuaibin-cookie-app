interface MonitorClient {
	send: (data: string) => void;
}

interface DeviceConnection {
	deviceId: string;
	lastHeartbeat: number;
	registeredAt: number;
	send: (data: string) => void;
}

export interface LogEntry {
	level: "info" | "warn" | "error";
	message: string;
	timestamp: number;
}

export interface DeviceSnapshot {
	deviceId: string;
	lastHeartbeat: number;
	registeredAt: number;
}

const connections = new Map<string, DeviceConnection>();
const monitors = new Set<MonitorClient>();
const logCache = new Map<string, LogEntry[]>();
const MAX_LOGS_PER_DEVICE = 500;

export function registerDevice(deviceId: string, client: MonitorClient): void {
	connections.set(deviceId, {
		send: client.send,
		deviceId,
		registeredAt: Date.now(),
		lastHeartbeat: Date.now(),
	});

	if (!logCache.has(deviceId)) {
		logCache.set(deviceId, []);
	}

	broadcastToMonitors({
		type: "device_connected",
		deviceId,
		timestamp: Date.now(),
	});
}

export function unregisterDevice(deviceId: string): void {
	if (connections.delete(deviceId)) {
		broadcastToMonitors({
			type: "device_disconnected",
			deviceId,
			timestamp: Date.now(),
		});
	}
}

export function findDeviceIdBySend(
	send: (data: string) => void
): string | undefined {
	for (const [deviceId, conn] of connections) {
		if (conn.send === send) {
			return deviceId;
		}
	}

	return;
}

export function updateHeartbeat(deviceId: string): void {
	const conn = connections.get(deviceId);
	if (conn) {
		conn.lastHeartbeat = Date.now();
	}
}

export function getDeviceConnection(
	deviceId: string
): DeviceConnection | undefined {
	return connections.get(deviceId);
}

export function addLog(deviceId: string, entry: LogEntry): void {
	const logs = logCache.get(deviceId) || [];
	logs.push(entry);

	if (logs.length > MAX_LOGS_PER_DEVICE) {
		logs.shift();
	}

	logCache.set(deviceId, logs);
}

export function getLogs(deviceId: string): LogEntry[] {
	return logCache.get(deviceId) || [];
}

export function getDeviceSnapshots(): DeviceSnapshot[] {
	return Array.from(connections.values()).map((conn) => ({
		deviceId: conn.deviceId,
		registeredAt: conn.registeredAt,
		lastHeartbeat: conn.lastHeartbeat,
	}));
}

export function broadcastToMonitors(data: unknown): void {
	const payload = JSON.stringify(data);

	for (const monitor of monitors) {
		try {
			monitor.send(payload);
		} catch {
			// Ignore closed connections
		}
	}
}

export function registerMonitor(monitor: MonitorClient): void {
	monitors.add(monitor);

	monitor.send(
		JSON.stringify({
			type: "snapshot",
			devices: getDeviceSnapshots(),
			logs: Object.fromEntries(logCache),
		})
	);
}

export function unregisterMonitor(monitor: MonitorClient): void {
	monitors.delete(monitor);
}

export function sendCommand(
	deviceId: string,
	command: string,
	payload?: unknown
): boolean {
	const conn = connections.get(deviceId);
	if (!conn) {
		return false;
	}

	try {
		conn.send(
			JSON.stringify({
				type: "command",
				command,
				payload,
			})
		);
		return true;
	} catch {
		return false;
	}
}
