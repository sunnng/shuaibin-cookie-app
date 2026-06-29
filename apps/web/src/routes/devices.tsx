import { Button } from "@shuaibin-cookie-app/ui/components/button";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";

import { DeviceList } from "@/components/device-list";
import { orpc } from "@/utils/orpc";

export const Route = createFileRoute("/devices")({
	component: DevicesComponent,
});

function DevicesComponent() {
	const queryClient = useQueryClient();
	const simulators = useQuery(orpc.simulator.list.queryOptions());
	const discover = useMutation({
		...orpc.simulator.discover.mutationOptions(),
		onSuccess: async () => {
			await queryClient.invalidateQueries({
				queryKey: orpc.simulator.list.queryKey(),
			});
		},
	});

	const arrange = useMutation({
		...orpc.simulator.arrange.mutationOptions(),
	});

	return (
		<div className="container mx-auto space-y-4 p-4">
			<div className="flex flex-wrap items-center justify-between gap-4">
				<h1 className="font-bold text-xl">模拟器管理</h1>
				<div className="flex gap-2">
					<Button
						onClick={() => arrange.mutate({ layout: "grid", columns: 2 })}
						variant="outline"
					>
						宫格 2x2
					</Button>
					<Button
						onClick={() => arrange.mutate({ layout: "grid", columns: 3 })}
						variant="outline"
					>
						宫格 3x3
					</Button>
					<Button
						onClick={() => arrange.mutate({ layout: "horizontal" })}
						variant="outline"
					>
						横向
					</Button>
					<Button
						onClick={() => arrange.mutate({ layout: "vertical" })}
						variant="outline"
					>
						纵向
					</Button>
				</div>
			</div>

			<DeviceList
				devices={simulators.data || []}
				isDiscovering={discover.isPending}
				onDiscover={() => discover.mutate(undefined)}
			/>
		</div>
	);
}
