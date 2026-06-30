import { createFileRoute, Navigate } from "@tanstack/react-router";

export const Route = createFileRoute("/devices")({
	component: DevicesRedirect,
});

function DevicesRedirect() {
	return <Navigate replace to="/console" />;
}
