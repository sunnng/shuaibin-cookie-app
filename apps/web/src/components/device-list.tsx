import { Button } from "@shuaibin-cookie-app/ui/components/button";
import {
	Card,
	CardContent,
	CardHeader,
	CardTitle,
} from "@shuaibin-cookie-app/ui/components/card";
import { useMutation, useQueryClient } from "@tanstack/react-query";

import { orpc } from "@/utils/orpc";

interface Simulator {
	adbId: string;
	adbPort?: number | null;
	brand: string;
	id: string;
	name: string;
	status: string;
}

interface DeviceListProps {
	devices: Simulator[];
	isDiscovering?: boolean;
	onDiscover: () => void;
}

export function DeviceList({
	devices,
	onDiscover,
	isDiscovering,
}: DeviceListProps) {
	const queryClient = useQueryClient();

	const launch = useMutation({
		...orpc.simulator.launch.mutationOptions(),
		onSuccess: async () => {
			await queryClient.invalidateQueries({
				queryKey: orpc.simulator.list.queryKey(),
			});
		},
	});

	const shutdown = useMutation({
		...orpc.simulator.shutdown.mutationOptions(),
		onSuccess: async () => {
			await queryClient.invalidateQueries({
				queryKey: orpc.simulator.list.queryKey(),
			});
		},
	});

	const remove = useMutation({
		...orpc.simulator.delete.mutationOptions(),
		onSuccess: async () => {
			await queryClient.invalidateQueries({
				queryKey: orpc.simulator.list.queryKey(),
			});
		},
	});

	return (
		<div className="space-y-4">
			<div className="flex gap-2">
				<Button disabled={isDiscovering} onClick={onDiscover}>
					{isDiscovering ? "发现中..." : "发现模拟器"}
				</Button>
			</div>

			<div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
				{devices.map((device) => (
					<Card key={device.id}>
						<CardHeader>
							<CardTitle className="text-base">{device.name}</CardTitle>
						</CardHeader>
						<CardContent className="space-y-3">
							<div className="text-muted-foreground text-sm">
								<p>品牌: {device.brand}</p>
								<p>ADB: {device.adbId}</p>
								<p>状态: {device.status}</p>
							</div>
							<div className="flex gap-2">
								<Button
									disabled={launch.isPending}
									onClick={() => launch.mutate({ id: device.id })}
									size="sm"
									variant="outline"
								>
									启动
								</Button>
								<Button
									disabled={shutdown.isPending}
									onClick={() => shutdown.mutate({ id: device.id })}
									size="sm"
									variant="outline"
								>
									关闭
								</Button>
								<Button
									disabled={remove.isPending}
									onClick={() => remove.mutate({ id: device.id })}
									size="sm"
									variant="destructive"
								>
									删除
								</Button>
							</div>
						</CardContent>
					</Card>
				))}
			</div>
		</div>
	);
}
