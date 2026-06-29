import { Button } from "@shuaibin-cookie-app/ui/components/button";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@shuaibin-cookie-app/ui/components/select";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";

import { AssignScriptDialog } from "@/components/assign-script-dialog";
import { TaskTable } from "@/components/task-table";
import { useMonitorWebSocket } from "@/hooks/use-monitor-websocket";
import { orpc } from "@/utils/orpc";

export const Route = createFileRoute("/dashboard")({
	component: DashboardComponent,
});

function DashboardComponent() {
	const queryClient = useQueryClient();
	const { logs } = useMonitorWebSocket();

	const tasks = useQuery(orpc.task.list.queryOptions());
	const scripts = useQuery(orpc.script.list.queryOptions());
	const simulators = useQuery(orpc.simulator.list.queryOptions());

	const start = useMutation({
		...orpc.task.start.mutationOptions(),
		onSuccess: async () => {
			await queryClient.invalidateQueries({
				queryKey: orpc.task.list.queryKey(),
			});
		},
	});

	const pause = useMutation({
		...orpc.task.pause.mutationOptions(),
		onSuccess: async () => {
			await queryClient.invalidateQueries({
				queryKey: orpc.task.list.queryKey(),
			});
		},
	});

	const stop = useMutation({
		...orpc.task.stop.mutationOptions(),
		onSuccess: async () => {
			await queryClient.invalidateQueries({
				queryKey: orpc.task.list.queryKey(),
			});
		},
	});

	const allTaskIds = tasks.data?.map(({ task }) => task.id) || [];

	return (
		<div className="container mx-auto space-y-4 p-4">
			<div className="flex flex-wrap items-center justify-between gap-4">
				<h1 className="font-bold text-xl">脚本中控台</h1>

				<div className="flex flex-wrap items-center gap-2">
					<Select>
						<SelectTrigger className="w-48">
							<SelectValue placeholder="当前脚本" />
						</SelectTrigger>
						<SelectContent>
							{scripts.data?.map((script) => (
								<SelectItem key={script.id} value={script.id}>
									{script.fileName}
								</SelectItem>
							))}
						</SelectContent>
					</Select>

					<Button
						disabled={start.isPending}
						onClick={() => start.mutate({ taskIds: allTaskIds })}
					>
						▶ 全部启动
					</Button>
					<Button
						disabled={pause.isPending}
						onClick={() => pause.mutate({ taskIds: allTaskIds })}
					>
						⏸ 全部暂停
					</Button>
					<Button
						disabled={stop.isPending}
						onClick={() => stop.mutate({ taskIds: allTaskIds })}
					>
						⏹ 全部停止
					</Button>
					<AssignScriptDialog />
				</div>
			</div>

			{tasks.isLoading || simulators.isLoading ? (
				<p className="text-muted-foreground">加载中...</p>
			) : (
				<TaskTable
					logs={logs}
					onPause={(ids) => pause.mutate({ taskIds: ids })}
					onStart={(ids) => start.mutate({ taskIds: ids })}
					onStop={(ids) => stop.mutate({ taskIds: ids })}
					tasks={tasks.data || []}
				/>
			)}
		</div>
	);
}
