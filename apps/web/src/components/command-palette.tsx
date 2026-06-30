"use client";

import {
	Command,
	CommandDialog,
	CommandEmpty,
	CommandGroup,
	CommandInput,
	CommandItem,
	CommandList,
	CommandShortcut,
} from "@shuaibin-cookie-app/ui/components/command";
import { Kbd, KbdGroup } from "@shuaibin-cookie-app/ui/components/kbd";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import {
	Computer,
	FolderOpen,
	LayoutDashboard,
	Moon,
	Search,
	Sun,
} from "lucide-react";
import { useTheme } from "next-themes";
import { useEffect, useState } from "react";
import { orpc } from "@/utils/orpc";

interface CommandPaletteProps {
	onOpenChange?: (open: boolean) => void;
	open?: boolean;
}

export function CommandPalette({
	onOpenChange,
	open: controlledOpen,
}: CommandPaletteProps) {
	const [internalOpen, setInternalOpen] = useState(false);
	const open = controlledOpen ?? internalOpen;
	const setOpen = onOpenChange ?? setInternalOpen;
	const navigate = useNavigate();
	const queryClient = useQueryClient();
	const { setTheme, theme } = useTheme();

	const discover = useMutation({
		...orpc.simulator.discover.mutationOptions(),
		onSuccess: async () => {
			await queryClient.invalidateQueries({
				queryKey: orpc.simulator.list.queryKey(),
			});
			setOpen(false);
		},
	});

	useEffect(() => {
		const handleKeyDown = (event: KeyboardEvent) => {
			if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
				event.preventDefault();
				setOpen(!open);
			}
		};

		document.addEventListener("keydown", handleKeyDown);
		return () => document.removeEventListener("keydown", handleKeyDown);
	}, [open, setOpen]);

	const navigationCommands = [
		{
			icon: LayoutDashboard,
			label: "前往控制台",
			onSelect: async () => {
				await navigate({ to: "/console" });
				setOpen(false);
			},
			shortcut: "⌘1",
		},
		{
			icon: FolderOpen,
			label: "前往脚本库",
			onSelect: async () => {
				await navigate({ to: "/scripts" });
				setOpen(false);
			},
			shortcut: "⌘2",
		},
	];

	const actionCommands = [
		{
			icon: Search,
			label: "搜索模拟器",
			onSelect: () => discover.mutate(undefined),
			shortcut: "⌘D",
		},
	];

	const themeCommands = [
		{
			icon: Sun,
			label: "切换为浅色主题",
			onSelect: () => {
				setTheme("light");
				setOpen(false);
			},
			visible: theme !== "light",
		},
		{
			icon: Moon,
			label: "切换为深色主题",
			onSelect: () => {
				setTheme("dark");
				setOpen(false);
			},
			visible: theme !== "dark",
		},
		{
			icon: Computer,
			label: "跟随系统主题",
			onSelect: () => {
				setTheme("system");
				setOpen(false);
			},
			visible: theme !== "system",
		},
	];

	return (
		<CommandDialog onOpenChange={setOpen} open={open}>
			<Command>
				<CommandInput placeholder="输入命令或搜索..." />
				<CommandList>
					<CommandEmpty>未找到命令</CommandEmpty>
					<CommandGroup heading="导航">
						{navigationCommands.map((command) => (
							<CommandItem key={command.label} onSelect={command.onSelect}>
								<command.icon aria-hidden="true" className="size-4" />
								<span>{command.label}</span>
								<CommandShortcut>
									<KbdGroup>
										<Kbd>{command.shortcut}</Kbd>
									</KbdGroup>
								</CommandShortcut>
							</CommandItem>
						))}
					</CommandGroup>
					<CommandGroup heading="操作">
						{actionCommands.map((command) => (
							<CommandItem key={command.label} onSelect={command.onSelect}>
								<command.icon aria-hidden="true" className="size-4" />
								<span>{command.label}</span>
								{command.shortcut && (
									<CommandShortcut>
										<KbdGroup>
											<Kbd>{command.shortcut}</Kbd>
										</KbdGroup>
									</CommandShortcut>
								)}
							</CommandItem>
						))}
					</CommandGroup>
					<CommandGroup heading="主题">
						{themeCommands
							.filter((command) => command.visible)
							.map((command) => (
								<CommandItem key={command.label} onSelect={command.onSelect}>
									<command.icon aria-hidden="true" className="size-4" />
									<span>{command.label}</span>
								</CommandItem>
							))}
					</CommandGroup>
				</CommandList>
			</Command>
		</CommandDialog>
	);
}
