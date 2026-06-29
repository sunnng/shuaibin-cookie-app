import { Input } from "@shuaibin-cookie-app/ui/components/input";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useCallback, useState } from "react";

import { orpc } from "@/utils/orpc";

export function ScriptUpload() {
	const [isDragging, setIsDragging] = useState(false);
	const queryClient = useQueryClient();

	const upload = useMutation({
		mutationFn: async (file: File) => {
			const formData = new FormData();
			formData.append("file", file);

			const response = await fetch(
				`${import.meta.env.VITE_SERVER_URL}/api/scripts/upload`,
				{
					method: "POST",
					body: formData,
				}
			);

			if (!response.ok) {
				throw new Error("Upload failed");
			}

			return response.json();
		},
		onSuccess: async () => {
			await queryClient.invalidateQueries({
				queryKey: orpc.script.list.queryKey(),
			});
		},
	});

	const handleFile = useCallback(
		(file: File) => {
			if (!file.name.endsWith(".apk")) {
				return;
			}
			upload.mutate(file);
		},
		[upload]
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

	return (
		<div className="space-y-4">
			{/* biome-ignore lint/a11y/noNoninteractiveElementInteractions: drag-and-drop upload zone */}
			<section
				aria-label="APK upload drop zone"
				className={`rounded-lg border-2 border-dashed p-8 text-center transition-colors ${
					isDragging
						? "border-primary bg-primary/5"
						: "border-muted-foreground/25"
				}`}
				onDragLeave={() => setIsDragging(false)}
				onDragOver={(e) => {
					e.preventDefault();
					setIsDragging(true);
				}}
				onDrop={onDrop}
			>
				<p className="text-muted-foreground text-sm">
					拖拽 APK 到此处，或点击选择文件
				</p>
				<Input
					accept=".apk"
					className="mt-2"
					onChange={(e) => {
						const file = e.target.files?.[0];
						if (file) {
							handleFile(file);
						}
					}}
					type="file"
				/>
			</section>
			{upload.isPending && <p className="text-sm">上传中...</p>}
			{upload.isError && <p className="text-red-500 text-sm">上传失败</p>}
		</div>
	);
}
