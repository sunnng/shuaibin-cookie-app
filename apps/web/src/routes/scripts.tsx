import { Button } from "@shuaibin-cookie-app/ui/components/button";
import {
	Card,
	CardContent,
	CardHeader,
	CardTitle,
} from "@shuaibin-cookie-app/ui/components/card";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";

import { ScriptUpload } from "@/components/script-upload";
import { orpc } from "@/utils/orpc";

export const Route = createFileRoute("/scripts")({
	component: ScriptsComponent,
});

function ScriptsComponent() {
	const queryClient = useQueryClient();
	const scripts = useQuery(orpc.script.list.queryOptions());
	const deleteScript = useMutation({
		...orpc.script.delete.mutationOptions(),
		onSuccess: async () => {
			await queryClient.invalidateQueries({
				queryKey: orpc.script.list.queryKey(),
			});
		},
	});

	return (
		<div className="container mx-auto space-y-6 p-4">
			<h1 className="font-bold text-xl">脚本库</h1>

			<ScriptUpload />

			<div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
				{scripts.data?.map((script) => (
					<Card key={script.id}>
						<CardHeader>
							<CardTitle className="text-base">{script.fileName}</CardTitle>
						</CardHeader>
						<CardContent className="space-y-3">
							<div className="text-muted-foreground text-sm">
								<p>包名: {script.packageName}</p>
								{script.versionName && <p>版本: {script.versionName}</p>}
								<p>上传时间: {new Date(script.uploadedAt).toLocaleString()}</p>
							</div>
							<Button
								disabled={deleteScript.isPending}
								onClick={() => deleteScript.mutate({ id: script.id })}
								size="sm"
								variant="destructive"
							>
								删除
							</Button>
						</CardContent>
					</Card>
				))}
			</div>
		</div>
	);
}
