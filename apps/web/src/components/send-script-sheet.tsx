import { Button } from "@shuaibin-cookie-app/ui/components/button";
import { Checkbox } from "@shuaibin-cookie-app/ui/components/checkbox";
import { Label } from "@shuaibin-cookie-app/ui/components/label";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@shuaibin-cookie-app/ui/components/select";
import {
	Sheet,
	SheetContent,
	SheetDescription,
	SheetFooter,
	SheetHeader,
	SheetTitle,
} from "@shuaibin-cookie-app/ui/components/sheet";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { Package, Send } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import type { Simulator } from "@/components/device-console-table";
import { client, orpc } from "@/utils/orpc";

interface SendScriptSheetProps {
	defaultScriptId?: string;
	onOpenChange: (open: boolean) => void;
	open: boolean;
	selectedDeviceIds: string[];
	simulators: Simulator[];
}

export function SendScriptSheet({
	defaultScriptId,
	onOpenChange,
	open,
	selectedDeviceIds,
	simulators,
}: SendScriptSheetProps) {
	const queryClient = useQueryClient();
	const scripts = useQuery(orpc.script.list.queryOptions());

	const [selectedSimulators, setSelectedSimulators] = useState<Set<string>>(
		new Set()
	);
	const [selectedScript, setSelectedScript] = useState<string>("");

	useEffect(() => {
		if (open) {
			setSelectedSimulators(new Set(selectedDeviceIds));
			if (defaultScriptId) {
				setSelectedScript(defaultScriptId);
			}
		}
	}, [open, selectedDeviceIds, defaultScriptId]);

	const assignAndStart = useMutation({
		mutationFn: async ({
			scriptName,
			scriptPackage,
			simulatorIds,
		}: {
			scriptName: string;
			scriptPackage: string;
			simulatorIds: string[];
		}) => {
			const assignResult = await client.task.assign({
				simulatorIds,
				scriptName,
				scriptPackage,
			});

			if (assignResult.errors.length > 0) {
				const firstError = assignResult.errors[0];
				throw new Error(
					firstError
						? `${firstError.simulatorId}: ${firstError.reason}`
						: "分配任务失败"
				);
			}

			if (assignResult.created.length === 0) {
				return assignResult;
			}

			const startResult = await client.task.start({
				taskIds: assignResult.created.map((t) => t.id),
			});

			if (startResult.failed.length > 0) {
				const firstFailed = startResult.failed[0];
				throw new Error(firstFailed ? firstFailed.reason : "启动任务失败");
			}

			return assignResult;
		},
		onError: (error) => {
			toast.error("发送失败", {
				description: error instanceof Error ? error.message : "未知错误",
			});
		},
		onSuccess: async (assignResult) => {
			await queryClient.invalidateQueries({
				queryKey: orpc.task.list.queryKey(),
			});
			toast.success(`已向 ${assignResult.created.length} 台设备发送脚本`);
			onOpenChange(false);
			setSelectedSimulators(new Set());
			setSelectedScript("");
		},
	});

	const toggleSimulator = (id: string) => {
		setSelectedSimulators((prev) => {
			const next = new Set(prev);
			if (next.has(id)) {
				next.delete(id);
			} else {
				next.add(id);
			}
			return next;
		});
	};

	const handleSend = () => {
		const script = scripts.data?.find((s) => s.id === selectedScript);
		if (!script || selectedSimulators.size === 0) {
			return;
		}

		assignAndStart.mutate({
			simulatorIds: Array.from(selectedSimulators),
			scriptName: script.fileName,
			scriptPackage: script.packageName,
		});
	};

	const onlineSimulators = simulators.filter((s) => s.status === "online");

	return (
		<Sheet onOpenChange={onOpenChange} open={open}>
			<SheetContent className="w-full sm:max-w-md">
				<SheetHeader>
					<SheetTitle>发送脚本</SheetTitle>
					<SheetDescription>
						选择在线设备与脚本 APK，分配后将立即启动执行。
					</SheetDescription>
				</SheetHeader>

				<div className="flex flex-1 flex-col gap-6 overflow-y-auto px-4">
					<div className="space-y-3">
						<Label>目标设备</Label>
						{onlineSimulators.length === 0 ? (
							<p className="text-muted-foreground text-sm">
								没有可用模拟器。请先手动开启模拟器，再点击「搜索模拟器」。
							</p>
						) : (
							<div className="max-h-48 space-y-2 overflow-y-auto border border-border p-3">
								{onlineSimulators.map((sim) => {
									const checkboxId = `send-sim-${sim.id}`;
									return (
										<label
											className="flex items-center gap-2 text-sm"
											htmlFor={checkboxId}
											key={sim.id}
										>
											<Checkbox
												checked={selectedSimulators.has(sim.id)}
												id={checkboxId}
												onCheckedChange={() => toggleSimulator(sim.id)}
											/>
											<span className="truncate">{sim.name}</span>
											<span className="ml-auto font-mono text-muted-foreground text-xs">
												{sim.adbId}
											</span>
										</label>
									);
								})}
							</div>
						)}
					</div>

					<div className="space-y-3">
						<Label>选择脚本</Label>
						{scripts.data?.length === 0 ? (
							<div className="flex flex-col items-start gap-2 text-sm">
								<p className="text-muted-foreground">
									脚本库为空，请先上传 APK。
								</p>
								<Button
									render={<Link to="/scripts" />}
									size="sm"
									variant="outline"
								>
									<Package aria-hidden="true" className="size-3.5" />
									前往脚本库
								</Button>
							</div>
						) : (
							<Select
								onValueChange={(value) => setSelectedScript(value ?? "")}
								value={selectedScript}
							>
								<SelectTrigger>
									<SelectValue placeholder="选择 APK" />
								</SelectTrigger>
								<SelectContent>
									{scripts.data?.map((script) => (
										<SelectItem key={script.id} value={script.id}>
											{script.fileName} ({script.packageName})
										</SelectItem>
									))}
								</SelectContent>
							</Select>
						)}
					</div>
				</div>

				<SheetFooter className="flex-row justify-end gap-2">
					<Button onClick={() => onOpenChange(false)} variant="outline">
						取消
					</Button>
					<Button
						disabled={
							selectedSimulators.size === 0 ||
							!selectedScript ||
							assignAndStart.isPending ||
							onlineSimulators.length === 0
						}
						onClick={handleSend}
					>
						<Send aria-hidden="true" className="size-3.5" />
						{assignAndStart.isPending ? "发送中..." : "发送并启动"}
					</Button>
				</SheetFooter>
			</SheetContent>
		</Sheet>
	);
}
