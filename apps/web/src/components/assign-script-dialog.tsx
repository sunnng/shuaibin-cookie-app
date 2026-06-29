import { Button } from "@shuaibin-cookie-app/ui/components/button";
import { Checkbox } from "@shuaibin-cookie-app/ui/components/checkbox";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@shuaibin-cookie-app/ui/components/dialog";
import { Label } from "@shuaibin-cookie-app/ui/components/label";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@shuaibin-cookie-app/ui/components/select";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

import { orpc } from "@/utils/orpc";

export function AssignScriptDialog() {
	const [open, setOpen] = useState(false);
	const [selectedSimulators, setSelectedSimulators] = useState<Set<string>>(
		new Set()
	);
	const [selectedScript, setSelectedScript] = useState<string>("");
	const queryClient = useQueryClient();

	const simulators = useQuery(orpc.simulator.list.queryOptions());
	const scripts = useQuery(orpc.script.list.queryOptions());
	const assign = useMutation({
		...orpc.task.assign.mutationOptions(),
		onSuccess: async () => {
			await queryClient.invalidateQueries({
				queryKey: orpc.task.list.queryKey(),
			});
			setOpen(false);
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

	const handleAssign = () => {
		const script = scripts.data?.find((s) => s.id === selectedScript);
		if (!script || selectedSimulators.size === 0) {
			return;
		}

		assign.mutate({
			simulatorIds: Array.from(selectedSimulators),
			scriptName: script.fileName,
			scriptPackage: script.packageName,
		});
	};

	return (
		<Dialog onOpenChange={setOpen} open={open}>
			<Button onClick={() => setOpen(true)} variant="outline">
				分配脚本
			</Button>
			<DialogContent className="max-w-2xl">
				<DialogHeader>
					<DialogTitle>分配脚本</DialogTitle>
					<DialogDescription>选择模拟器和要运行的脚本 APK</DialogDescription>
				</DialogHeader>

				<div className="grid grid-cols-2 gap-6">
					<div className="space-y-3">
						<Label>选择模拟器</Label>
						<div className="max-h-64 space-y-2 overflow-y-auto rounded border p-3">
							{simulators.data?.map((sim) => {
								const checkboxId = `sim-${sim.id}`;
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
										{sim.name}
									</label>
								);
							})}
						</div>
					</div>

					<div className="space-y-3">
						<Label>选择脚本</Label>
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
					</div>
				</div>

				<DialogFooter>
					<Button
						disabled={
							selectedSimulators.size === 0 ||
							!selectedScript ||
							assign.isPending
						}
						onClick={handleAssign}
					>
						确认分配
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
