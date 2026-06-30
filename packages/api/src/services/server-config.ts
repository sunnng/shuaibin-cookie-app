import { env } from "@shuaibin-cookie-app/env/server";

export function getServerPort(): number {
	return env.SERVER_PORT;
}

export function getScriptWsPath(): string {
	return env.WS_SCRIPT_PATH;
}

export function getScriptWsUrl(): string {
	return `ws://localhost:${getServerPort()}${getScriptWsPath()}`;
}
