import { createContext, type ReactNode, use } from "react";

import {
	useMonitorWebSocket,
	type WebSocketState,
} from "@/hooks/use-monitor-websocket";

const MonitorContext = createContext<WebSocketState | null>(null);

export function MonitorProvider({ children }: { children: ReactNode }) {
	const state = useMonitorWebSocket();
	return (
		<MonitorContext.Provider value={state}>{children}</MonitorContext.Provider>
	);
}

export function useMonitor(): WebSocketState {
	const ctx = use(MonitorContext);
	if (!ctx) {
		throw new Error("useMonitor must be used within MonitorProvider");
	}
	return ctx;
}
