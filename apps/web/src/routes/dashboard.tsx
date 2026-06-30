import { createFileRoute, Navigate } from "@tanstack/react-router";

export const Route = createFileRoute("/dashboard")({
	component: DashboardRedirect,
});

function DashboardRedirect() {
	return <Navigate replace to="/console" />;
}
