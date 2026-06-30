import {
	Attachment,
	AttachmentAction,
	AttachmentActions,
	AttachmentContent,
	AttachmentDescription,
	AttachmentMedia,
	AttachmentTitle,
} from "@shuaibin-cookie-app/ui/components/attachment";
import { Button } from "@shuaibin-cookie-app/ui/components/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@shuaibin-cookie-app/ui/components/card";
import { Spinner } from "@shuaibin-cookie-app/ui/components/spinner";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Check, UploadCloud, X } from "lucide-react";
import { type ReactNode, useCallback, useRef, useState } from "react";
import { toast } from "sonner";

import { orpc } from "@/utils/orpc";

interface UploadEntry {
	error?: string;
	file: File;
	id: number;
	name: string;
	progress: number;
	size: string;
	status: "done" | "error" | "uploading";
}

function formatSize(bytes: number): string {
	if (bytes < 1024) {
		return `${bytes} B`;
	}
	if (bytes < 1024 * 1024) {
		return `${(bytes / 1024).toFixed(1)} KB`;
	}
	return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function ScriptUpload() {
	const [files, setFiles] = useState<UploadEntry[]>([]);
	const [isDragging, setIsDragging] = useState(false);
	const inputRef = useRef<HTMLInputElement>(null);
	const nextId = useRef(1);
	const queryClient = useQueryClient();

	const upload = useMutation({
		mutationFn: async (entry: UploadEntry): Promise<void> => {
			const formData = new FormData();
			formData.append("file", entry.file);

			const response = await fetch(
				`${import.meta.env.VITE_SERVER_URL}/api/scripts/upload`,
				{
					body: formData,
					method: "POST",
				}
			);

			if (!response.ok) {
				const text = await response.text();
				throw new Error(text || "上传失败");
			}

			await response.json();
		},
		onSuccess: async () => {
			await queryClient.invalidateQueries({
				queryKey: orpc.script.list.queryKey(),
			});
		},
	});

	const startUpload = useCallback(
		(entry: UploadEntry) => {
			const tick = setInterval(() => {
				setFiles((prev) =>
					prev.map((f) =>
						f.id === entry.id && f.status === "uploading"
							? { ...f, progress: Math.min(95, f.progress + 8) }
							: f
					)
				);
			}, 180);

			upload.mutate(entry, {
				onError: (error) => {
					clearInterval(tick);
					const message = error instanceof Error ? error.message : "上传失败";
					setFiles((prev) =>
						prev.map((f) =>
							f.id === entry.id
								? { ...f, progress: 100, status: "error", error: message }
								: f
						)
					);
					toast.error("APK 上传失败", { description: message });
				},
				onSuccess: () => {
					clearInterval(tick);
					setFiles((prev) =>
						prev.map((f) =>
							f.id === entry.id ? { ...f, progress: 100, status: "done" } : f
						)
					);
					toast.success("APK 上传成功", {
						description: `${entry.name} 已加入脚本库`,
					});
				},
			});
		},
		[upload]
	);

	const handleFile = useCallback(
		(file: File) => {
			if (!file.name.endsWith(".apk")) {
				toast.error("仅支持 .apk 文件");
				return;
			}
			const entry: UploadEntry = {
				file,
				id: nextId.current++,
				name: file.name,
				progress: 0,
				size: formatSize(file.size),
				status: "uploading",
			};
			setFiles((prev) => [...prev, entry]);
			startUpload(entry);
		},
		[startUpload]
	);

	const onDrop = useCallback(
		(e: React.DragEvent) => {
			e.preventDefault();
			setIsDragging(false);
			const file = e.dataTransfer.files[0];
			if (file) {
				handleFile(file);
			}
		},
		[handleFile]
	);

	const removeFile = (id: number) => {
		setFiles((prev) => prev.filter((f) => f.id !== id));
	};

	const clearAll = () => setFiles([]);

	return (
		<Card className="w-full">
			<CardHeader>
				<CardTitle>上传 APK 脚本</CardTitle>
				<CardDescription>
					拖拽 APK 到下方区域,或点击选择文件。上传后会自动解析包名与版本。
				</CardDescription>
			</CardHeader>
			<CardContent className="flex flex-col gap-4">
				<input
					accept=".apk"
					className="sr-only"
					onChange={(e) => {
						const file = e.target.files?.[0];
						if (file) {
							handleFile(file);
						}
						e.target.value = "";
					}}
					ref={inputRef}
					type="file"
				/>
				{/* biome-ignore lint/a11y/noNoninteractiveElementInteractions: drag-and-drop upload zone */}
				{/* biome-ignore lint/a11y/noStaticElementInteractions: drag-and-drop upload zone */}
				<div
					className={[
						"flex flex-col items-center justify-center gap-3 border border-border border-dashed bg-muted/40 px-6 py-10 transition-colors",
						isDragging ? "border-primary bg-muted" : "",
					]
						.filter(Boolean)
						.join(" ")}
					onDragLeave={(e) => {
						e.preventDefault();
						setIsDragging(false);
					}}
					onDragOver={(e) => {
						e.preventDefault();
						setIsDragging(true);
					}}
					onDrop={onDrop}
				>
					<div className="flex size-10 items-center justify-center border border-border bg-background">
						<UploadCloud
							aria-hidden="true"
							className="size-5 text-muted-foreground"
						/>
					</div>
					<div className="flex flex-col items-center gap-1 text-center">
						<p className="font-medium text-foreground text-sm">
							拖拽 APK 到此处,或点击浏览
						</p>
						<p className="text-muted-foreground text-xs">仅支持 .apk 文件</p>
					</div>
					<Button
						onClick={() => inputRef.current?.click()}
						size="sm"
						variant="outline"
					>
						<UploadCloud aria-hidden="true" />
						浏览文件
					</Button>
				</div>

				{files.length > 0 && (
					<div className="flex flex-col gap-2">
						<div className="flex items-center justify-between">
							<p className="text-muted-foreground text-xs tabular-nums">
								<span className="font-medium text-foreground">
									{files.length}
								</span>{" "}
								个文件
							</p>
							<button
								className="font-medium text-muted-foreground text-xs transition-colors hover:text-foreground"
								onClick={clearAll}
								type="button"
							>
								清除全部
							</button>
						</div>
						<ul className="flex flex-col gap-2">
							{files.map((file) => (
								<li key={file.id}>
									<UploadAttachment
										file={file}
										onRemove={() => removeFile(file.id)}
									/>
								</li>
							))}
						</ul>
					</div>
				)}
			</CardContent>
		</Card>
	);
}

interface UploadAttachmentProps {
	file: UploadEntry;
	onRemove: () => void;
}

function UploadAttachment({ file, onRemove }: UploadAttachmentProps) {
	const media = renderMedia(file);
	const description = renderDescription(file);
	return (
		<Attachment
			className="w-full"
			size="sm"
			state={file.status === "done" ? "done" : "uploading"}
		>
			<AttachmentMedia>{media}</AttachmentMedia>
			<AttachmentContent>
				<AttachmentTitle>{file.name}</AttachmentTitle>
				<AttachmentDescription className="tabular-nums">
					{description}
				</AttachmentDescription>
			</AttachmentContent>
			<AttachmentActions>
				<AttachmentAction aria-label={`移除 ${file.name}`} onClick={onRemove}>
					<X aria-hidden="true" />
				</AttachmentAction>
			</AttachmentActions>
		</Attachment>
	);
}

function renderMedia(file: UploadEntry): ReactNode {
	if (file.status === "done") {
		return <Check aria-hidden="true" className="text-primary" />;
	}
	if (file.status === "error") {
		return <X aria-hidden="true" className="text-destructive" />;
	}
	return <Spinner />;
}

function renderDescription(file: UploadEntry): string {
	if (file.status === "done") {
		return `已上传 ${file.size}`;
	}
	if (file.status === "error") {
		return file.error ?? "上传失败";
	}
	return `上传中 ${file.progress}%`;
}
