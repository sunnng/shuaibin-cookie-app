import { cors } from "@elysiajs/cors";
import { OpenAPIHandler } from "@orpc/openapi/fetch";
import { OpenAPIReferencePlugin } from "@orpc/openapi/plugins";
import { onError } from "@orpc/server";
import { RPCHandler } from "@orpc/server/fetch";
import { ZodToJsonSchemaConverter } from "@orpc/zod/zod4";
import { createContext } from "@shuaibin-cookie-app/api/context";
import { appRouter } from "@shuaibin-cookie-app/api/routers/index";
import { parseApkInfo } from "@shuaibin-cookie-app/api/services/apk-parser";
import {
	addScript,
	ensureScriptDataDir,
	getScriptFilePath,
} from "@shuaibin-cookie-app/api/services/script-store";
import { startWatchdog } from "@shuaibin-cookie-app/api/services/watchdog";
import {
	addLog,
	broadcastToMonitors,
	findDeviceIdBySend,
	registerDevice,
	registerMonitor,
	sendCommand,
	unregisterDevice,
	unregisterMonitor,
	updateHeartbeat,
} from "@shuaibin-cookie-app/api/services/websocket-store";
import { db } from "@shuaibin-cookie-app/db";
import { tasks } from "@shuaibin-cookie-app/db/schema";
import { env } from "@shuaibin-cookie-app/env/server";
import { eq } from "drizzle-orm";
import { Elysia } from "elysia";

declare const Bun: typeof import("bun");

const rpcHandler = new RPCHandler(appRouter, {
	interceptors: [
		onError((error) => {
			console.error(error);
		}),
	],
});
const apiHandler = new OpenAPIHandler(appRouter, {
	plugins: [
		new OpenAPIReferencePlugin({
			schemaConverters: [new ZodToJsonSchemaConverter()],
		}),
	],
	interceptors: [
		onError((error) => {
			console.error(error);
		}),
	],
});

async function updateTaskStatus(
	deviceId: string,
	update: {
		status?: string;
		progress?: number;
		currentMessage?: string;
	}
): Promise<void> {
	const task = await db
		.select()
		.from(tasks)
		.where(eq(tasks.simulatorId, deviceId))
		.orderBy(tasks.createdAt)
		.limit(1)
		.get();

	if (!task) {
		return;
	}

	const set: Partial<typeof tasks.$inferInsert> = {};
	if (update.status) {
		set.status = update.status as typeof task.status;
	}
	if (update.progress !== undefined) {
		set.progress = update.progress;
	}
	if (update.currentMessage !== undefined) {
		set.currentMessage = update.currentMessage;
	}

	if (Object.keys(set).length > 0) {
		await db.update(tasks).set(set).where(eq(tasks.id, task.id));
	}
}

function parseMessage(raw: unknown): Record<string, unknown> | null {
	const message = typeof raw === "string" ? raw : "";
	try {
		return JSON.parse(message) as Record<string, unknown>;
	} catch {
		return null;
	}
}

async function handleStatusMessage(
	deviceId: string,
	data: Record<string, unknown>
): Promise<void> {
	updateHeartbeat(deviceId);
	const progress =
		typeof data.progress === "number" ? data.progress : undefined;
	const status = typeof data.status === "string" ? data.status : undefined;
	const currentMessage =
		typeof data.message === "string" ? data.message : undefined;

	if (status || progress !== undefined || currentMessage) {
		await updateTaskStatus(deviceId, {
			status,
			progress,
			currentMessage,
		});
	}

	broadcastToMonitors({
		type: "status",
		deviceId,
		progress,
		status,
		message: currentMessage,
		timestamp: Date.now(),
	});
}

function handleLogMessage(
	deviceId: string,
	data: Record<string, unknown>
): void {
	updateHeartbeat(deviceId);
	const level = ["info", "warn", "error"].includes(data.level as string)
		? (data.level as "info" | "warn" | "error")
		: "info";
	const logMessage = typeof data.message === "string" ? data.message : "";

	addLog(deviceId, {
		timestamp: Date.now(),
		level,
		message: logMessage,
	});

	broadcastToMonitors({
		type: "log",
		deviceId,
		level,
		message: logMessage,
		timestamp: Date.now(),
	});
}

function handleScriptMessage(
	ws: { send: (data: string) => void },
	raw: unknown
): void {
	const data = parseMessage(raw);
	if (!data) {
		return;
	}

	const deviceId = typeof data.deviceId === "string" ? data.deviceId : "";
	if (!deviceId) {
		return;
	}

	if (data.type === "register") {
		registerDevice(deviceId, ws);
	} else if (data.type === "heartbeat") {
		updateHeartbeat(deviceId);
	} else if (data.type === "status") {
		handleStatusMessage(deviceId, data);
	} else if (data.type === "log") {
		handleLogMessage(deviceId, data);
	}
}

function handleMonitorMessage(raw: unknown): void {
	const data = parseMessage(raw);
	if (!data) {
		return;
	}

	if (data.type === "sendCommand") {
		const deviceId = typeof data.deviceId === "string" ? data.deviceId : "";
		const command = typeof data.command === "string" ? data.command : "";
		if (deviceId && command) {
			sendCommand(deviceId, command, data.payload);
		}
	}
}

new Elysia()
	.use(
		cors({
			origin: env.CORS_ORIGIN,
			methods: ["GET", "POST", "OPTIONS"],
		})
	)
	.all(
		"/rpc*",
		async (context) => {
			const { response } = await rpcHandler.handle(context.request, {
				prefix: "/rpc",
				context: await createContext({ context }),
			});
			return response ?? new Response("Not Found", { status: 404 });
		},
		{
			parse: "none",
		}
	)
	.all(
		"/api-reference*",
		async (context) => {
			const { response } = await apiHandler.handle(context.request, {
				prefix: "/api-reference",
				context: await createContext({ context }),
			});
			return response ?? new Response("Not Found", { status: 404 });
		},
		{
			parse: "none",
		}
	)
	.get("/", () => "OK")
	.post("/api/scripts/upload", async (context) => {
		const formData = await context.request.formData();
		const file = formData.get("file");

		if (!(file instanceof File)) {
			return new Response("No file uploaded", { status: 400 });
		}

		await ensureScriptDataDir();

		const id = crypto.randomUUID();
		const filePath = getScriptFilePath(id);
		await Bun.write(filePath, file);

		let info: Awaited<ReturnType<typeof parseApkInfo>>;
		try {
			info = await parseApkInfo(filePath);
		} catch (error) {
			const message =
				error instanceof Error ? error.message : "Failed to parse APK";
			return new Response(message, { status: 400 });
		}

		const meta = await addScript({
			id,
			fileName: file.name,
			packageName: info.packageName,
			versionName: info.versionName,
			mainActivity: info.mainActivity,
			uploadedAt: new Date().toISOString(),
			filePath,
		});

		return meta;
	})
	.ws("/ws/script", {
		open(_ws) {
			console.log("[ws/script] connected:", _ws.id);
		},
		message(ws, raw) {
			handleScriptMessage(ws, raw);
		},
		close(ws) {
			const deviceId = findDeviceIdBySend(ws.send);
			if (deviceId) {
				unregisterDevice(deviceId);
			}
		},
	})
	.ws("/ws/monitor", {
		open(ws) {
			registerMonitor(ws);
		},
		close(ws) {
			unregisterMonitor(ws);
		},
		message(_ws, raw) {
			handleMonitorMessage(raw);
		},
	})
	.listen(3000, () => {
		console.log("Server is running on http://localhost:3000");
		startWatchdog();
	});
