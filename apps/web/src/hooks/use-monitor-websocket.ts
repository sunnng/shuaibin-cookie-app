import { env } from "@shuaibin-cookie-app/env/web";
import { useEffect, useRef, useState } from "react";

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

export interface WebSocketState {
	connected: boolean;
	devices: DeviceSnapshot[];
	logs: Record<string, LogEntry[]>;
	sendCommand: (deviceId: string, command: string, payload?: unknown) => void;
}

function handleSnapshot(
	data: Record<string, unknown>,
	setDevices: React.Dispatch<React.SetStateAction<DeviceSnapshot[]>>,
	setLogs: React.Dispatch<React.SetStateAction<Record<string, LogEntry[]>>>
): void {
	setDevices((data.devices as DeviceSnapshot[]) || []);
	setLogs((data.logs as Record<string, LogEntry[]>) || {});
}

function handleDeviceConnection(
	data: Record<string, unknown>,
	setDevices: React.Dispatch<React.SetStateAction<DeviceSnapshot[]>>
): void {
	const deviceId = data.deviceId as string;
	const isConnected = data.type === "device_connected";

	setDevices((prev) => {
		if (isConnected) {
			return prev.some((d) => d.deviceId === deviceId)
				? prev
				: [
						...prev,
						{
							deviceId,
							registeredAt: Date.now(),
							lastHeartbeat: Date.now(),
						},
					];
		}
		return prev.filter((d) => d.deviceId !== deviceId);
	});
}

function handleLogMessage(
	data: Record<string, unknown>,
	setLogs: React.Dispatch<React.SetStateAction<Record<string, LogEntry[]>>>
): void {
	const deviceId = data.deviceId as string;
	const entry: LogEntry = {
		timestamp: (data.timestamp as number) || Date.now(),
		level: (data.level as "info" | "warn" | "error") || "info",
		message: (data.message as string) || "",
	};

	setLogs((prev) => ({
		...prev,
		[deviceId]: [...(prev[deviceId] || []), entry].slice(-500),
	}));
}

function handleMessage(
	event: MessageEvent,
	setDevices: React.Dispatch<React.SetStateAction<DeviceSnapshot[]>>,
	setLogs: React.Dispatch<React.SetStateAction<Record<string, LogEntry[]>>>
): void {
	const data = JSON.parse(event.data as string) as Record<string, unknown>;

	if (data.type === "snapshot") {
		handleSnapshot(data, setDevices, setLogs);
		return;
	}

	if (data.type === "device_connected" || data.type === "device_disconnected") {
		handleDeviceConnection(data, setDevices);
		return;
	}

	if (data.type === "log") {
		handleLogMessage(data, setLogs);
	}
}

export function useMonitorWebSocket(): WebSocketState {
	const [connected, setConnected] = useState(false);
	const [devices, setDevices] = useState<DeviceSnapshot[]>([]);
	const [logs, setLogs] = useState<Record<string, LogEntry[]>>({});
	const wsRef = useRef<WebSocket | null>(null);

	useEffect(() => {
		const serverUrl = new URL(env.VITE_SERVER_URL);
		const wsUrl = `ws://${serverUrl.host}/ws/monitor`;
		const ws = new WebSocket(wsUrl);
		wsRef.current = ws;

		ws.onopen = () => setConnected(true);
		ws.onclose = () => setConnected(false);
		ws.onmessage = (event) => handleMessage(event, setDevices, setLogs);

		return () => {
			ws.close();
		};
	}, []);

	const sendCommand = (
		deviceId: string,
		command: string,
		payload?: unknown
	) => {
		wsRef.current?.send(
			JSON.stringify({ type: "sendCommand", deviceId, command, payload })
		);
	};

	return { connected, devices, logs, sendCommand };
}
