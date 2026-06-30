import type { AppRouterClient } from "@shuaibin-cookie-app/api/routers/index";
import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
	AlertDialogTrigger,
} from "@shuaibin-cookie-app/ui/components/alert-dialog";
import { Badge } from "@shuaibin-cookie-app/ui/components/badge";
import { Button } from "@shuaibin-cookie-app/ui/components/button";
import {
	Card,
	CardContent,
	CardFooter,
	CardHeader,
	CardTitle,
} from "@shuaibin-cookie-app/ui/components/card";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import {
	FileArchive,
	LayoutDashboard,
	Package,
	Send,
	Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { EmptyState } from "@/components/empty-state";
import { ScriptUpload } from "@/components/script-upload";
import { orpc } from "@/utils/orpc";

type Script = Awaited<ReturnType<AppRouterClient["script"]["list"]>>[number];

export const Route = createFileRoute("/scripts")({
	component: ScriptsComponent,
});

function ScriptsComponent() {
	const queryClient = useQueryClient();
	const scripts = useQuery(orpc.script.list.queryOptions());
	const deleteScript = useMutation({
		...orpc.script.delete.mutationOptions(),
		onError: (error) => {
			toast.error("删除失败", {
				description: error instanceof Error ? error.message : "未知错误",
			});
		},
		onSuccess: async () => {
			toast.success("脚本已删除");
			await queryClient.invalidateQueries({
				queryKey: orpc.script.list.queryKey(),
			});
		},
	});

	const list = scripts.data ?? [];
	const hasScripts = list.length > 0;

	return (
		<div className="space-y-6 p-4 sm:p-6">
			<div className="flex flex-wrap items-start justify-between gap-4">
				<div>
					<h1 className="font-semibold text-lg tracking-tight">脚本库</h1>
					<p className="text-muted-foreground text-sm">
						共 {list.length} 个已上传脚本
					</p>
				</div>
				<Button render={<Link to="/console" />} size="sm" variant="outline">
					<LayoutDashboard aria-hidden="true" className="size-3.5" />
					返回控制台
				</Button>
			</div>

			<ScriptUpload />

			{renderScriptsBody({
				hasScripts,
				list,
				loading: scripts.isLoading,
				onDelete: (id) => deleteScript.mutate({ id }),
				deletePending: deleteScript.isPending,
			})}
		</div>
	);
}

interface ScriptsBodyProps {
	deletePending: boolean;
	hasScripts: boolean;
	list: Script[];
	loading: boolean;
	onDelete: (id: string) => void;
}

function renderScriptsBody({
	deletePending,
	hasScripts,
	list,
	loading,
	onDelete,
}: ScriptsBodyProps) {
	if (loading) {
		return <p className="text-muted-foreground text-sm">加载中...</p>;
	}
	if (!hasScripts) {
		return (
			<EmptyState
				description="还没有上传任何脚本。拖拽 APK 到上方区域开始上传,系统会自动解析包名与版本。"
				icon={Package}
				title="暂无脚本"
			/>
		);
	}
	return (
		<div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
			{list.map((script) => (
				<ScriptCard
					deletePending={deletePending}
					key={script.id}
					onDelete={() => onDelete(script.id)}
					script={script}
				/>
			))}
		</div>
	);
}

interface ScriptCardProps {
	deletePending: boolean;
	onDelete: () => void;
	script: Script;
}

function ScriptCard({ deletePending, onDelete, script }: ScriptCardProps) {
	return (
		<Card>
			<CardHeader>
				<div className="flex items-start gap-3">
					<div
						aria-hidden="true"
						className="flex size-8 shrink-0 items-center justify-center border border-border bg-muted text-muted-foreground"
					>
						<FileArchive className="size-4" />
					</div>
					<div className="min-w-0 flex-1">
						<CardTitle className="truncate text-sm">
							{script.fileName}
						</CardTitle>
						<div className="mt-1 flex flex-wrap items-center gap-1.5">
							{script.versionName && (
								<Badge variant="secondary">v{script.versionName}</Badge>
							)}
						</div>
					</div>
				</div>
			</CardHeader>
			<CardContent className="space-y-1 text-muted-foreground text-xs">
				<p className="flex items-center gap-1.5">
					<Package aria-hidden="true" className="size-3" />
					<span className="truncate">{script.packageName}</span>
				</p>
				{script.mainActivity && (
					<p className="truncate">
						<span className="text-muted-foreground/70">Activity:</span>{" "}
						{script.mainActivity}
					</p>
				)}
				<p>
					<span className="text-muted-foreground/70">上传于</span>{" "}
					{new Date(script.uploadedAt).toLocaleString()}
				</p>
			</CardContent>
			<CardFooter className="flex gap-2">
				<Button
					className="flex-1"
					render={<Link search={{ scriptId: script.id }} to="/console" />}
					size="sm"
					variant="default"
				>
					<Send aria-hidden="true" className="size-3.5" />
					发送到设备
				</Button>
				<AlertDialog>
					<AlertDialogTrigger
						render={
							<Button size="sm" variant="destructive">
								<Trash2 aria-hidden="true" className="size-3.5" />
							</Button>
						}
					/>
					<AlertDialogContent>
						<AlertDialogHeader>
							<AlertDialogTitle>删除脚本?</AlertDialogTitle>
							<AlertDialogDescription>
								将永久删除 {script.fileName}({script.packageName}) 及其 APK
								文件。如有活跃任务将无法删除。
							</AlertDialogDescription>
						</AlertDialogHeader>
						<AlertDialogFooter>
							<AlertDialogCancel>取消</AlertDialogCancel>
							<AlertDialogAction
								disabled={deletePending}
								onClick={onDelete}
								variant="destructive"
							>
								确认删除
							</AlertDialogAction>
						</AlertDialogFooter>
					</AlertDialogContent>
				</AlertDialog>
			</CardFooter>
		</Card>
	);
}
