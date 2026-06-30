import { Button } from "@shuaibin-cookie-app/ui/components/button";
import { Kbd } from "@shuaibin-cookie-app/ui/components/kbd";
import {
	Sidebar,
	SidebarContent,
	SidebarFooter,
	SidebarGroup,
	SidebarGroupContent,
	SidebarGroupLabel,
	SidebarHeader,
	SidebarInset,
	SidebarMenu,
	SidebarMenuButton,
	SidebarMenuItem,
	SidebarProvider,
	SidebarTrigger,
} from "@shuaibin-cookie-app/ui/components/sidebar";
import { useQuery } from "@tanstack/react-query";
import { Link, useMatchRoute } from "@tanstack/react-router";
import {
	Command,
	LayoutDashboard,
	type LucideIcon,
	Package,
	Smartphone,
} from "lucide-react";
import type { ReactNode } from "react";
import { useState } from "react";
import { orpc } from "@/utils/orpc";
import { CommandPalette } from "./command-palette";
import { ModeToggle } from "./mode-toggle";
import { useMonitor } from "./monitor-provider";

interface NavItem {
	icon: LucideIcon;
	label: string;
	title: string;
	to: string;
}

const NAV_ITEMS: NavItem[] = [
	{
		icon: LayoutDashboard,
		label: "控制台",
		title: "设备控制台",
		to: "/console",
	},
	{ icon: Package, label: "脚本库", title: "脚本库", to: "/scripts" },
];

interface AppShellProps {
	children: ReactNode;
}

export function AppShell({ children }: AppShellProps) {
	const { connected } = useMonitor();
	const simulators = useQuery(orpc.simulator.list.queryOptions());
	const tasks = useQuery(orpc.task.list.queryOptions());
	const matchRoute = useMatchRoute();

	const navItems = NAV_ITEMS.map((item) => ({
		...item,
		active: Boolean(matchRoute({ to: item.to, fuzzy: true })),
	}));
	const activeItem = navItems.find((item) => item.active);
	const pageTitle = activeItem?.title ?? "Cookie 中控";

	const onlineCount =
		simulators.data?.filter((s) => s.status === "online").length ?? 0;
	const errorCount =
		tasks.data?.filter(({ task }) => task.status === "error").length ?? 0;
	const [commandOpen, setCommandOpen] = useState(false);

	return (
		<SidebarProvider className="min-h-svh" defaultOpen>
			<Sidebar collapsible="icon">
				<SidebarHeader>
					<div className="flex h-10 items-center gap-2.5 px-2">
						<div aria-hidden="true" className="grid grid-cols-2 gap-0.5">
							<div className="size-2 bg-primary" />
							<div className="size-2 bg-primary" />
							<div className="size-2 bg-primary" />
							<div className="size-2 bg-primary" />
						</div>
						<span className="font-bold tracking-tight group-data-[collapsible=icon]:hidden">
							Cookie 中控
						</span>
					</div>
				</SidebarHeader>

				<SidebarContent>
					<SidebarGroup>
						<SidebarGroupLabel>导航</SidebarGroupLabel>
						<SidebarGroupContent>
							<SidebarMenu>
								{navItems.map((item) => (
									<SidebarMenuItem key={item.to}>
										<SidebarMenuButton
											isActive={item.active}
											render={<Link to={item.to} />}
											tooltip={item.label}
										>
											<item.icon aria-hidden="true" />
											<span>{item.label}</span>
										</SidebarMenuButton>
									</SidebarMenuItem>
								))}
							</SidebarMenu>
						</SidebarGroupContent>
					</SidebarGroup>
				</SidebarContent>

				<SidebarFooter>
					<div className="flex items-center gap-2 px-2 py-1 text-xs group-data-[collapsible=icon]:hidden">
						<span
							aria-hidden="true"
							className={`inline-block size-2 rounded-full ${
								connected ? "bg-emerald-500" : "bg-muted-foreground/40"
							}`}
						/>
						<span className="text-muted-foreground">
							{connected ? "监控已连接" : "监控未连接"}
						</span>
					</div>
				</SidebarFooter>
			</Sidebar>

			<SidebarInset>
				<header className="flex h-14 items-center gap-4 border-border border-b px-4 sm:px-6">
					<SidebarTrigger className="-ml-1" />
					<div className="flex items-center gap-2">
						<span className="text-muted-foreground text-xs">Cookie 中控</span>
						<span className="text-muted-foreground/40 text-xs">/</span>
						<span className="font-semibold text-xs">{pageTitle}</span>
					</div>
					<div className="ml-auto flex items-center gap-2">
						<Button
							aria-label="打开命令面板"
							className="hidden items-center gap-1.5 text-muted-foreground sm:inline-flex"
							onClick={() => setCommandOpen(true)}
							size="sm"
							variant="outline"
						>
							<Command aria-hidden="true" className="size-3.5" />
							<span>命令面板</span>
							<Kbd>⌘K</Kbd>
						</Button>
						<Button
							aria-label="打开命令面板"
							className="sm:hidden"
							onClick={() => setCommandOpen(true)}
							size="icon-sm"
							variant="outline"
						>
							<Command aria-hidden="true" className="size-3.5" />
						</Button>
						<Link to="/console">
							<Button aria-label="在线设备数" size="sm" variant="outline">
								<Smartphone aria-hidden="true" />
								<span className="tabular-nums">{onlineCount}</span>
								<span className="hidden text-muted-foreground sm:inline">
									在线
								</span>
							</Button>
						</Link>
						<Link to="/console">
							<Button
								aria-label="异常任务数"
								size="sm"
								variant={errorCount > 0 ? "destructive" : "outline"}
							>
								<span className="tabular-nums">{errorCount}</span>
								<span className="hidden text-muted-foreground sm:inline">
									异常
								</span>
							</Button>
						</Link>
						<ModeToggle />
					</div>
				</header>

				<main className="flex-1 bg-background text-foreground">{children}</main>
				<CommandPalette onOpenChange={setCommandOpen} open={commandOpen} />
			</SidebarInset>
		</SidebarProvider>
	);
}
