import { Button } from "@shuaibin-cookie-app/ui/components/button";
import { Search, Send } from "lucide-react";

interface ConsoleToolbarProps {
	discoverPending: boolean;
	onDiscover: () => void;
	onSendScript: () => void;
}

export function ConsoleToolbar({
	discoverPending,
	onDiscover,
	onSendScript,
}: ConsoleToolbarProps) {
	return (
		<div className="flex flex-wrap items-center gap-2">
			<Button onClick={onDiscover} size="sm" variant="default">
				<Search aria-hidden="true" className="size-3.5" />
				{discoverPending ? "搜索中..." : "搜索模拟器"}
			</Button>
			<Button onClick={onSendScript} size="sm" variant="outline">
				<Send aria-hidden="true" className="size-3.5" />
				发送脚本
			</Button>
		</div>
	);
}
