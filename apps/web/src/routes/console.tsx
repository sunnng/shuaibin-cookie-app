import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { Smartphone } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { ConsoleToolbar } from "@/components/console-toolbar";
import {
	buildDeviceConsoleRows,
	DeviceConsoleTable,
} from "@/components/device-console-table";
import { EmptyState } from "@/components/empty-state";
import { useMonitor } from "@/components/monitor-provider";
import { SendScriptSheet } from "@/components/send-script-sheet";
import { orpc } from "@/utils/orpc";

interface ConsoleSearch {
	scriptId?: string;
}

export const Route = createFileRoute("/console")({
	validateSearch: (search: Record<string, unknown>): ConsoleSearch => ({
		scriptId: typeof search.scriptId === "string" ? search.scriptId : undefined,
	}),
	component: ConsoleComponent,
});

function ConsoleComponent() {
	const queryClient = useQueryClient();
	const { scriptId } = Route.useSearch();
	const monitor = useMonitor();

	const simulators = useQuery(orpc.simulator.list.queryOptions());
	const tasks = useQuery(orpc.task.list.queryOptions());

	const [selectedDeviceIds, setSelectedDeviceIds] = useState<string[]>([]);
	const [sendSheetOpen, setSendSheetOpen] = useState(false);
	const [sendScriptDeviceId, setSendScriptDeviceId] = useState<string | null>(
		null
	);

	useEffect(() => {
		if (scriptId) {
			setSendSheetOpen(true);
		}
	}, [scriptId]);

	useEffect(() => {
		if (monitor.clientStatusChangedAt) {
			queryClient.invalidateQueries({
				queryKey: orpc.simulator.list.queryKey(),
			});
		}
	}, [monitor.clientStatusChangedAt, queryClient]);

	useEffect(() => {
		if (monitor.taskStatusChangedAt) {
			queryClient.invalidateQueries({
				queryKey: orpc.task.list.queryKey(),
			});
		}
	}, [monitor.taskStatusChangedAt, queryClient]);

	const invalidateAll = async () => {
		await Promise.all([
			queryClient.invalidateQueries({
				queryKey: orpc.simulator.list.queryKey(),
			}),
			queryClient.invalidateQueries({
				queryKey: orpc.task.list.queryKey(),
			}),
		]);
	};

	const discover = useMutation({
		...orpc.simulator.discover.mutationOptions(),
		onSuccess: async (data) => {
			await invalidateAll();
			toast.success(`发现 ${data.count} 台已开启的模拟器`);
		},
		onError: (error) => {
			toast.error("搜索失败", {
				description: error instanceof Error ? error.message : "未知错误",
			});
		},
	});

	const simList = simulators.data ?? [];
	const taskList = tasks.data ?? [];

	const deviceRows = useMemo(
		() => buildDeviceConsoleRows(simList, taskList, monitor.devices),
		[simList, taskList, monitor.devices]
	);

	const hasDevices = simList.length > 0;
	const loading = simulators.isLoading || tasks.isLoading;

	const openSendSheet = (deviceId?: string) => {
		if (deviceId) {
			setSendScriptDeviceId(deviceId);
			setSelectedDeviceIds([deviceId]);
		}
		setSendSheetOpen(true);
	};

	const effectiveSelectedIds = useMemo(() => {
		if (sendScriptDeviceId && sendSheetOpen) {
			return [
				sendScriptDeviceId,
				...selectedDeviceIds.filter((id) => id !== sendScriptDeviceId),
			];
		}
		if (selectedDeviceIds.length > 0) {
			return selectedDeviceIds;
		}
		if (sendScriptDeviceId) {
			return [sendScriptDeviceId];
		}
		return [];
	}, [sendScriptDeviceId, sendSheetOpen, selectedDeviceIds]);

	const renderMainContent = () => {
		if (loading) {
			return <p className="text-muted-foreground text-sm">加载中...</p>;
		}
		if (!hasDevices) {
			return (
				<EmptyState
					description="请先在雷电/MuMu 等工具中手动开启模拟器，再点击「搜索模拟器」。"
					icon={Smartphone}
					title="暂无设备"
				/>
			);
		}
		return (
			<DeviceConsoleTable
				devices={deviceRows}
				loading={loading}
				logs={monitor.logs}
				onSelectionChange={setSelectedDeviceIds}
				onSendScript={(id) => openSendSheet(id)}
			/>
		);
	};

	return (
		<div className="space-y-6 p-4 sm:p-6">
			<div className="space-y-4">
				<div>
					<h1 className="font-semibold text-lg tracking-tight">设备控制台</h1>
					<p className="text-muted-foreground text-sm">
						搜索本地已开启的模拟器并发送脚本 — 共 {simList.length} 台设备
					</p>
				</div>

				<ConsoleToolbar
					discoverPending={discover.isPending}
					onDiscover={() => discover.mutate(undefined)}
					onSendScript={() => openSendSheet()}
				/>
			</div>

			{renderMainContent()}

			<SendScriptSheet
				defaultScriptId={scriptId}
				onOpenChange={(open) => {
					setSendSheetOpen(open);
					if (!open) {
						setSendScriptDeviceId(null);
					}
				}}
				open={sendSheetOpen}
				selectedDeviceIds={
					effectiveSelectedIds.length > 0
						? [...new Set(effectiveSelectedIds)]
						: selectedDeviceIds
				}
				simulators={simList}
			/>
		</div>
	);
}
