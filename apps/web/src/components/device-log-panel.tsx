import { Button } from "@shuaibin-cookie-app/ui/components/button";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@shuaibin-cookie-app/ui/components/select";
import { Copy, Download, Filter } from "lucide-react";
import { useMemo, useState } from "react";

import type { LogEntry } from "@/hooks/use-monitor-websocket";

const LOG_LEVEL_COLOR: Record<LogEntry["level"], string> = {
	error: "text-destructive",
	warn: "text-yellow-500",
	info: "text-foreground",
};

interface DeviceLogPanelProps {
	deviceName?: string;
	logs: LogEntry[];
}

export function DeviceLogPanel({ deviceName, logs }: DeviceLogPanelProps) {
	const [levelFilter, setLevelFilter] = useState<LogEntry["level"] | "all">(
		"all"
	);

	const filteredLogs = useMemo(() => {
		if (levelFilter === "all") {
			return logs;
		}
		return logs.filter((log) => log.level === levelFilter);
	}, [logs, levelFilter]);

	const logText = useMemo(
		() =>
			filteredLogs
				.map(
					(log) =>
						`${new Date(log.timestamp).toLocaleTimeString()} [${log.level}] ${log.message}`
				)
				.join("\n"),
		[filteredLogs]
	);

	const handleCopy = async () => {
		try {
			await navigator.clipboard.writeText(logText || "暂无日志");
		} catch {
			// ignore
		}
	};

	const handleExport = () => {
		const blob = new Blob([logText || "暂无日志"], { type: "text/plain" });
		const url = URL.createObjectURL(blob);
		const link = document.createElement("a");
		link.href = url;
		const suffix = deviceName ? deviceName.replace(/\s+/g, "-") : "device";
		link.download = `${suffix}-logs-${new Date().toISOString().slice(0, 19).replace(/:/g, "-")}.txt`;
		link.click();
		URL.revokeObjectURL(url);
	};

	return (
		<div className="space-y-2">
			<div className="flex flex-wrap items-center justify-between gap-2">
				<div className="flex items-center gap-2">
					{deviceName && (
						<span className="font-medium text-foreground text-sm">
							{deviceName}
						</span>
					)}
					<Filter
						aria-hidden="true"
						className="size-3.5 text-muted-foreground"
					/>
					<Select
						onValueChange={(v) =>
							setLevelFilter((v ?? "all") as LogEntry["level"] | "all")
						}
						value={levelFilter}
					>
						<SelectTrigger className="h-7 w-28 text-xs">
							<SelectValue placeholder="全部级别" />
						</SelectTrigger>
						<SelectContent>
							<SelectItem value="all">全部级别</SelectItem>
							<SelectItem value="info">Info</SelectItem>
							<SelectItem value="warn">Warn</SelectItem>
							<SelectItem value="error">Error</SelectItem>
						</SelectContent>
					</Select>
					<span className="text-muted-foreground text-xs">
						{filteredLogs.length} / {logs.length} 条
					</span>
				</div>
				<div className="flex items-center gap-1">
					<Button
						aria-label="复制日志"
						disabled={logs.length === 0}
						onClick={handleCopy}
						size="icon-xs"
						variant="ghost"
					>
						<Copy aria-hidden="true" className="size-3.5" />
					</Button>
					<Button
						aria-label="导出日志"
						disabled={logs.length === 0}
						onClick={handleExport}
						size="icon-xs"
						variant="ghost"
					>
						<Download aria-hidden="true" className="size-3.5" />
					</Button>
				</div>
			</div>

			<div className="max-h-48 overflow-y-auto border border-border bg-background p-3 font-mono text-xs">
				{filteredLogs.length === 0 ? (
					<div className="text-muted-foreground">暂无日志</div>
				) : (
					filteredLogs.map((log) => (
						<div className="py-0.5" key={`${log.timestamp}-${log.message}`}>
							<span className="text-muted-foreground">
								{new Date(log.timestamp).toLocaleTimeString()}
							</span>{" "}
							<span className={LOG_LEVEL_COLOR[log.level]}>[{log.level}]</span>{" "}
							{log.message}
						</div>
					))
				)}
			</div>
		</div>
	);
}
