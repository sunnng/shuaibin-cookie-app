import { Button } from "@shuaibin-cookie-app/ui/components/button";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@shuaibin-cookie-app/ui/components/table";
import { cn } from "@shuaibin-cookie-app/ui/lib/utils";
import { useState } from "react";

import type { LogEntry } from "@/hooks/use-monitor-websocket";

interface TaskWithSimulator {
	simulator?: {
		id: string;
		name: string;
		brand: string;
		status: string;
	} | null;
	task: {
		id: string;
		scriptName: string;
		scriptPackage: string;
		scriptVersion?: string | null;
		status: "idle" | "running" | "paused" | "completed" | "error";
		progress: number;
		currentMessage?: string | null;
		retryCount: number;
		maxRetries: number;
	};
}

interface TaskTableProps {
	logs: Record<string, LogEntry[]>;
	onPause: (taskIds: string[]) => void;
	onStart: (taskIds: string[]) => void;
	onStop: (taskIds: string[]) => void;
	tasks: TaskWithSimulator[];
}

const statusIcons: Record<TaskWithSimulator["task"]["status"], string> = {
	idle: "⚪",
	running: "🟢",
	paused: "🟡",
	completed: "🔵",
	error: "🔴",
};

export function TaskTable({
	tasks,
	logs,
	onStart,
	onPause,
	onStop,
}: TaskTableProps) {
	const [expandedTaskId, setExpandedTaskId] = useState<string | null>(null);

	const counts = tasks.reduce(
		(acc, { task }) => {
			acc[task.status] = (acc[task.status] || 0) + 1;
			return acc;
		},
		{} as Record<TaskWithSimulator["task"]["status"], number>
	);

	return (
		<div className="space-y-4">
			<Table>
				<TableHeader>
					<TableRow>
						<TableHead className="w-12">#</TableHead>
						<TableHead>窗口</TableHead>
						<TableHead>状态</TableHead>
						<TableHead>进度</TableHead>
						<TableHead className="text-right">操作</TableHead>
					</TableRow>
				</TableHeader>
				<TableBody>
					{tasks.map(({ task, simulator }, index) => {
						const isExpanded = expandedTaskId === task.id;
						const taskLogs = simulator ? logs[simulator.id] || [] : [];

						return (
							<>
								<TableRow
									className={cn(
										"cursor-pointer",
										task.status === "error" && "bg-red-50 dark:bg-red-900/20"
									)}
									key={task.id}
									onClick={() => setExpandedTaskId(isExpanded ? null : task.id)}
								>
									<TableCell>{String(index + 1).padStart(2, "0")}</TableCell>
									<TableCell>{simulator?.name || task.scriptName}</TableCell>
									<TableCell>
										<span className="flex items-center gap-2">
											<span>{statusIcons[task.status]}</span>
											<span>{task.status}</span>
											{task.status === "error" && (
												<span className="text-muted-foreground text-xs">
													{task.retryCount < task.maxRetries
														? `自动重试中 (${task.retryCount}/${task.maxRetries})`
														: "重试耗尽"}
												</span>
											)}
										</span>
									</TableCell>
									<TableCell>{task.progress}%</TableCell>
									<TableCell className="text-right">
										<div className="flex justify-end gap-2">
											<Button
												onClick={(e) => {
													e.stopPropagation();
													onStart([task.id]);
												}}
												size="sm"
												variant="outline"
											>
												启动
											</Button>
											<Button
												onClick={(e) => {
													e.stopPropagation();
													onPause([task.id]);
												}}
												size="sm"
												variant="outline"
											>
												暂停
											</Button>
											<Button
												onClick={(e) => {
													e.stopPropagation();
													onStop([task.id]);
												}}
												size="sm"
												variant="destructive"
											>
												停止
											</Button>
										</div>
									</TableCell>
								</TableRow>
								{isExpanded && (
									<TableRow className="bg-muted/50">
										<TableCell className="p-4" colSpan={5}>
											<div className="max-h-48 overflow-y-auto rounded border bg-background p-2 font-mono text-xs">
												{taskLogs.length === 0 ? (
													<div className="text-muted-foreground">暂无日志</div>
												) : (
													taskLogs.map((log) => (
														<div
															className="py-0.5"
															key={`${log.timestamp}-${log.message}`}
														>
															<span className="text-muted-foreground">
																{new Date(log.timestamp).toLocaleTimeString()}
															</span>{" "}
															<span
																className={cn(
																	log.level === "error" && "text-red-500",
																	log.level === "warn" && "text-yellow-500"
																)}
															>
																[{log.level}]
															</span>{" "}
															{log.message}
														</div>
													))
												)}
											</div>
										</TableCell>
									</TableRow>
								)}
							</>
						);
					})}
				</TableBody>
			</Table>

			<div className="flex gap-4 text-muted-foreground text-sm">
				<span>运行 {counts.running || 0}</span>
				<span>暂停 {counts.paused || 0}</span>
				<span>异常 {counts.error || 0}</span>
				<span>空闲 {counts.idle || 0}</span>
			</div>
		</div>
	);
}
