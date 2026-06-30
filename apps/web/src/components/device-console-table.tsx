import type { AppRouterClient } from "@shuaibin-cookie-app/api/routers/index";
import { Badge } from "@shuaibin-cookie-app/ui/components/badge";
import { Button } from "@shuaibin-cookie-app/ui/components/button";
import { Checkbox } from "@shuaibin-cookie-app/ui/components/checkbox";
import { Input } from "@shuaibin-cookie-app/ui/components/input";
import {
	Progress,
	ProgressLabel,
	ProgressValue,
} from "@shuaibin-cookie-app/ui/components/progress";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@shuaibin-cookie-app/ui/components/table";
import { cn } from "@shuaibin-cookie-app/ui/lib/utils";
import {
	type ColumnDef,
	flexRender,
	getCoreRowModel,
	getFilteredRowModel,
	getPaginationRowModel,
	getSortedRowModel,
	type RowSelectionState,
	type SortingState,
	useReactTable,
} from "@tanstack/react-table";
import {
	ChevronLeft,
	ChevronRight,
	Search,
	Send,
} from "lucide-react";
import { Fragment, useMemo, useState } from "react";

import { DeviceLogPanel } from "@/components/device-log-panel";
import type { DeviceSnapshot, LogEntry } from "@/hooks/use-monitor-websocket";

export type Simulator = Awaited<
	ReturnType<AppRouterClient["simulator"]["list"]>
>[number];

export type TaskWithSimulator = Awaited<
	ReturnType<AppRouterClient["task"]["list"]>
>[number];

type TaskStatus = TaskWithSimulator["task"]["status"];

export interface DeviceConsoleRow {
	simulator: Simulator;
	task: TaskWithSimulator["task"] | null;
	wsConnected: boolean;
}

interface DeviceConsoleTableProps {
	devices: DeviceConsoleRow[];
	loading?: boolean;
	logs: Record<string, LogEntry[]>;
	onSelectionChange?: (ids: string[]) => void;
	onSendScript: (deviceId: string) => void;
}

const ADB_STATUS_LABEL: Record<Simulator["status"], string> = {
	online: "在线",
	busy: "繁忙",
	offline: "离线",
};

const ADB_STATUS_LED: Record<Simulator["status"], string> = {
	online: "bg-emerald-500",
	busy: "bg-amber-500",
	offline: "bg-muted-foreground/40",
};

const BRAND_LABEL: Record<Simulator["brand"], string> = {
	leidian: "雷电",
	mumu: "MuMu",
	bluestacks: "BlueStacks",
	adb: "ADB",
};

function formatAdbEndpoint(
	adbId: string,
	adbPort: Simulator["adbPort"]
): string {
	if (adbId.includes(":")) {
		return adbId;
	}
	if (adbPort) {
		return `${adbId}:${adbPort}`;
	}
	return adbId;
}

const TASK_STATUS_VARIANT: Record<
	TaskStatus,
	"default" | "destructive" | "outline" | "secondary"
> = {
	running: "default",
	paused: "secondary",
	error: "destructive",
	idle: "outline",
	completed: "outline",
};

const TASK_STATUS_LABEL: Record<TaskStatus, string> = {
	running: "运行中",
	paused: "已暂停",
	error: "异常",
	idle: "空闲",
	completed: "已完成",
};

const TASK_PRIORITY: Record<TaskStatus, number> = {
	running: 5,
	paused: 4,
	error: 3,
	idle: 2,
	completed: 1,
};

export function buildDeviceConsoleRows(
	simulators: Simulator[],
	tasks: TaskWithSimulator[],
	wsDevices: DeviceSnapshot[]
): DeviceConsoleRow[] {
	const wsSet = new Set(wsDevices.map((d) => d.deviceId));

	const tasksBySimulator = new Map<string, TaskWithSimulator["task"][]>();
	for (const { task } of tasks) {
		const list = tasksBySimulator.get(task.simulatorId) ?? [];
		list.push(task);
		tasksBySimulator.set(task.simulatorId, list);
	}

	return simulators.map((simulator) => {
		const simTasks = tasksBySimulator.get(simulator.id) ?? [];
		const task =
			simTasks.length === 0
				? null
				: simTasks.reduce((best, current) =>
						TASK_PRIORITY[current.status] > TASK_PRIORITY[best.status]
							? current
							: best
					);

		const wsConnected =
			wsSet.has(simulator.id) ||
			(simulator.androidId ? wsSet.has(simulator.androidId) : false);

		return { simulator, task, wsConnected };
	});
}

export function DeviceConsoleTable({
	devices,
	logs,
	onSendScript,
	onSelectionChange,
	loading,
}: DeviceConsoleTableProps) {
	const [sorting, setSorting] = useState<SortingState>([]);
	const [rowSelection, setRowSelection] = useState<RowSelectionState>({});
	const [expandedDeviceId, setExpandedDeviceId] = useState<string | null>(null);

	const columns = useMemo<ColumnDef<DeviceConsoleRow>[]>(
		() => [
			{
				id: "select",
				enableSorting: false,
				header: ({ table }) => (
					<Checkbox
						aria-label="全选当前页"
						checked={table.getIsAllPageRowsSelected()}
						indeterminate={
							table.getIsSomePageRowsSelected() &&
							!table.getIsAllPageRowsSelected()
						}
						onCheckedChange={(checked) =>
							table.toggleAllPageRowsSelected(checked === true)
						}
					/>
				),
				cell: ({ row }) => (
					<Checkbox
						aria-label={`选择 ${row.original.simulator.name}`}
						checked={row.getIsSelected()}
						onCheckedChange={(checked) => row.toggleSelected(checked === true)}
					/>
				),
			},
			{
				id: "device",
				header: "设备名称",
				filterFn: (row, _id, value: string) => {
					const q = value.toLowerCase();
					const sim = row.original.simulator;
					return (
						sim.name.toLowerCase().includes(q) ||
						sim.adbId.toLowerCase().includes(q) ||
						(row.original.task?.scriptName ?? "").toLowerCase().includes(q)
					);
				},
				cell: ({ row }) => {
					const sim = row.original.simulator;
					return (
						<div className="flex min-w-0 items-center gap-2.5">
							<span
								aria-hidden="true"
								className={cn(
									"inline-block size-2 shrink-0 rounded-full",
									ADB_STATUS_LED[sim.status]
								)}
							/>
							<p className="truncate font-medium text-sm">{sim.name}</p>
						</div>
					);
				},
			},
			{
				id: "adbInfo",
				header: "ADB 信息",
				cell: ({ row }) => {
					const sim = row.original.simulator;
					return (
						<div className="min-w-0 space-y-1">
							<p className="truncate font-mono text-muted-foreground text-xs">
								{formatAdbEndpoint(sim.adbId, sim.adbPort)}
							</p>
							<div className="flex flex-wrap items-center gap-1.5">
								<Badge
									variant={sim.status === "online" ? "default" : "outline"}
								>
									{ADB_STATUS_LABEL[sim.status]}
								</Badge>
								<Badge variant="outline">{BRAND_LABEL[sim.brand]}</Badge>
							</div>
						</div>
					);
				},
			},
			{
				id: "scriptProgress",
				header: "脚本发送进度",
				cell: ({ row }) => {
					const task = row.original.task;
					if (!task) {
						return (
							<span className="text-muted-foreground text-xs">未发送</span>
						);
					}

					const showProgress = task.status !== "idle";

					return (
						<div className="min-w-48 space-y-2">
							<div className="flex min-w-0 items-center gap-2">
								<p className="truncate text-sm">{task.scriptName}</p>
								<Badge variant={TASK_STATUS_VARIANT[task.status]}>
									{TASK_STATUS_LABEL[task.status]}
								</Badge>
							</div>
							{showProgress ? (
								<Progress className="gap-1" value={task.progress}>
									<ProgressLabel className="truncate text-xs">
										{task.currentMessage || `${task.progress}%`}
									</ProgressLabel>
									<ProgressValue className="w-10 text-right" />
								</Progress>
							) : (
								<span className="text-muted-foreground text-xs">等待启动</span>
							)}
						</div>
					);
				},
			},
			{
				id: "actions",
				enableSorting: false,
				header: () => <span className="sr-only">操作</span>,
				cell: ({ row }) => {
					const sim = row.original.simulator;

					return (
						<div className="flex justify-end gap-1">
							<Button
								aria-label={`发送脚本到 ${sim.name}`}
								onClick={() => onSendScript(sim.id)}
								size="icon-sm"
								variant="outline"
							>
								<Send aria-hidden="true" className="size-3.5" />
							</Button>
						</div>
					);
				},
			},
		],
		[onSendScript]
	);

	const table = useReactTable({
		data: devices,
		columns,
		getRowId: (row) => row.simulator.id,
		state: { sorting, rowSelection },
		onSortingChange: setSorting,
		onRowSelectionChange: (updater) => {
			setRowSelection((prev) => {
				const next = typeof updater === "function" ? updater(prev) : updater;
				const ids = Object.keys(next).filter((id) => next[id]);
				onSelectionChange?.(ids);
				return next;
			});
		},
		getCoreRowModel: getCoreRowModel(),
		getSortedRowModel: getSortedRowModel(),
		getFilteredRowModel: getFilteredRowModel(),
		getPaginationRowModel: getPaginationRowModel(),
		initialState: { pagination: { pageSize: 10 } },
	});

	const deviceFilter =
		(table.getColumn("device")?.getFilterValue() as string) ?? "";
	const pageCount = table.getPageCount();
	const totalCount = table.getFilteredRowModel().rows.length;

	if (loading) {
		return <p className="text-muted-foreground text-sm">加载中...</p>;
	}

	return (
		<div className="space-y-4">
			<div className="relative max-w-sm">
				<Search
					aria-hidden="true"
					className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground"
				/>
				<Input
					aria-label="按设备名或 ADB ID 搜索"
					className="h-8 pl-8 text-sm"
					onChange={(e) =>
						table.getColumn("device")?.setFilterValue(e.target.value)
					}
					placeholder="搜索设备 / 脚本..."
					type="search"
					value={deviceFilter}
				/>
			</div>

			<div className="border border-border bg-card">
				<div className="overflow-x-auto">
					<Table>
						<TableHeader>
							{table.getHeaderGroups().map((headerGroup) => (
								<TableRow
									className="border-border bg-muted/40 hover:bg-muted/40"
									key={headerGroup.id}
								>
									{headerGroup.headers.map((header) => (
										<TableHead
											className={cn(
												"h-9 whitespace-nowrap",
												header.column.id === "select" && "w-10 pl-4",
												header.column.id === "actions" && "w-24 pr-4"
											)}
											key={header.id}
										>
											{header.isPlaceholder
												? null
												: flexRender(
														header.column.columnDef.header,
														header.getContext()
													)}
										</TableHead>
									))}
								</TableRow>
							))}
						</TableHeader>
						<TableBody>
							{table.getRowModel().rows.length ? (
								table.getRowModel().rows.map((row) => {
									const simId = row.original.simulator.id;
									const isExpanded = expandedDeviceId === simId;
									const deviceLogs = logs[simId] ?? [];

									return (
										<Fragment key={row.id}>
											<TableRow
												className={cn(
													"cursor-pointer border-border transition-colors last:border-b-0 hover:bg-muted/30",
													isExpanded && "bg-muted/40"
												)}
												onClick={() =>
													setExpandedDeviceId(isExpanded ? null : simId)
												}
											>
												{row.getVisibleCells().map((cell) => (
													<TableCell
														className={cn(
															"py-3",
															cell.column.id === "select" && "pl-4",
															cell.column.id === "actions" && "pr-4"
														)}
														key={cell.id}
														onClick={(e) => {
															if (
																cell.column.id === "select" ||
																cell.column.id === "actions"
															) {
																e.stopPropagation();
															}
														}}
													>
														{flexRender(
															cell.column.columnDef.cell,
															cell.getContext()
														)}
													</TableCell>
												))}
											</TableRow>
											{isExpanded && (
												<TableRow className="bg-muted/30 hover:bg-muted/30">
													<TableCell className="p-4" colSpan={columns.length}>
														<DeviceLogPanel
															deviceName={row.original.simulator.name}
															logs={deviceLogs}
														/>
													</TableCell>
												</TableRow>
											)}
										</Fragment>
									);
								})
							) : (
								<TableRow className="hover:bg-transparent">
									<TableCell
										className="h-24 text-center text-muted-foreground text-sm"
										colSpan={columns.length}
									>
										没有匹配的设备。
									</TableCell>
								</TableRow>
							)}
						</TableBody>
					</Table>
				</div>

				<div className="flex items-center justify-between gap-4 border-border border-t bg-muted/20 px-4 py-2.5">
					<span className="text-muted-foreground text-xs">
						共{" "}
						<span className="font-medium text-foreground tabular-nums">
							{totalCount}
						</span>{" "}
						台设备
					</span>
					<div className="flex items-center gap-1.5">
						<Button
							aria-label="上一页"
							className="size-7"
							disabled={!table.getCanPreviousPage()}
							onClick={() => table.previousPage()}
							size="icon"
							variant="outline"
						>
							<ChevronLeft aria-hidden="true" className="size-3.5" />
						</Button>
						<span className="px-1 text-muted-foreground text-xs tabular-nums">
							第 {table.getState().pagination.pageIndex + 1} /{" "}
							{Math.max(pageCount, 1)} 页
						</span>
						<Button
							aria-label="下一页"
							className="size-7"
							disabled={!table.getCanNextPage()}
							onClick={() => table.nextPage()}
							size="icon"
							variant="outline"
						>
							<ChevronRight aria-hidden="true" className="size-3.5" />
						</Button>
					</div>
				</div>
			</div>
		</div>
	);
}
