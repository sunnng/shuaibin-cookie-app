import { Badge } from "@shuaibin-cookie-app/ui/components/badge";
import { Separator } from "@shuaibin-cookie-app/ui/components/separator";
import { ArrowDown, ArrowUp, type LucideIcon } from "lucide-react";

export interface StatItem {
	delta?: string;
	icon: LucideIcon;
	label: string;
	positive?: boolean;
	value: string | number;
}

interface StatsBandProps {
	stats: StatItem[];
}

export function StatsBand({ stats }: StatsBandProps) {
	return (
		<section className="w-full">
			<Separator />
			<dl className="grid grid-cols-2 md:grid-cols-4">
				{stats.map(({ delta, icon: Icon, label, positive, value }, index) => (
					<div
						className={[
							"flex flex-col items-center border-border px-6 py-6 text-center",
							index % 2 === 0 ? "border-r" : "",
							index >= 2 ? "border-t md:border-t-0" : "",
							index === 1 ? "md:border-r" : "",
						]
							.filter(Boolean)
							.join(" ")}
						key={label}
					>
						<div
							aria-hidden="true"
							className="mb-2 flex size-8 items-center justify-center border border-border bg-card text-muted-foreground"
						>
							<Icon className="size-4" />
						</div>
						<dt className="font-bold text-3xl tabular-nums tracking-tight sm:text-4xl">
							{value}
						</dt>
						<dd className="mt-1 text-muted-foreground text-sm">{label}</dd>
						{delta && (
							<Badge className="mt-2" variant="secondary">
								{positive ? (
									<ArrowUp aria-hidden="true" className="size-3" />
								) : (
									<ArrowDown aria-hidden="true" className="size-3" />
								)}
								{delta}
							</Badge>
						)}
					</div>
				))}
			</dl>
			<Separator />
		</section>
	);
}
