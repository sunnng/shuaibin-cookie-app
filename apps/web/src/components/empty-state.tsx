import { Button } from "@shuaibin-cookie-app/ui/components/button";
import {
	Empty,
	EmptyContent,
	EmptyDescription,
	EmptyHeader,
	EmptyMedia,
	EmptyTitle,
} from "@shuaibin-cookie-app/ui/components/empty";
import type { LucideIcon } from "lucide-react";
import type { ComponentProps, ReactNode } from "react";

interface EmptyStateProps {
	action?: {
		onClick?: () => void;
		label: string;
		render?: ComponentProps<typeof Button>["render"];
	};
	description: ReactNode;
	icon: LucideIcon;
	title: string;
}

export function EmptyState({
	action,
	description,
	icon: Icon,
	title,
}: EmptyStateProps) {
	return (
		<Empty className="py-16">
			<EmptyHeader>
				<EmptyMedia variant="icon">
					<Icon aria-hidden="true" />
				</EmptyMedia>
				<EmptyTitle>{title}</EmptyTitle>
				<EmptyDescription>{description}</EmptyDescription>
			</EmptyHeader>
			{action && (
				<EmptyContent>
					<Button
						onClick={action.onClick}
						render={action.render}
						variant="outline"
					>
						{action.label}
					</Button>
				</EmptyContent>
			)}
		</Empty>
	);
}
