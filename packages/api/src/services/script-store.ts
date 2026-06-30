import { exists } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { promisify } from "node:util";

declare const Bun: typeof import("bun");

const DATA_DIR = join(process.cwd(), "data", "scripts");
const META_FILE = join(process.cwd(), "data", "scripts.json");

const existsAsync = promisify(exists);

export interface ScriptMeta {
	fileName: string;
	filePath: string;
	id: string;
	mainActivity?: string;
	packageName: string;
	uploadedAt: string;
	versionName?: string;
}

export async function ensureScriptDataDir(): Promise<void> {
	await mkdir(DATA_DIR, { recursive: true });
}

export function getScriptFilePath(id: string): string {
	return join(DATA_DIR, `${id}.apk`);
}

function resolveScriptMeta(meta: ScriptMeta): ScriptMeta {
	return {
		...meta,
		filePath: getScriptFilePath(meta.id),
	};
}

export async function loadScripts(): Promise<ScriptMeta[]> {
	if (!(await existsAsync(META_FILE))) {
		return [];
	}

	const data = await readFile(META_FILE, "utf-8");
	return (JSON.parse(data) as ScriptMeta[]).map(resolveScriptMeta);
}

export async function saveScripts(scripts: ScriptMeta[]): Promise<void> {
	await ensureScriptDataDir();
	await writeFile(META_FILE, JSON.stringify(scripts, null, "\t"));
}

export async function addScript(meta: ScriptMeta): Promise<ScriptMeta> {
	const scripts = await loadScripts();
	scripts.push(meta);
	await saveScripts(scripts);
	return meta;
}

export async function getScript(id: string): Promise<ScriptMeta | undefined> {
	const scripts = await loadScripts();
	return scripts.find((script) => script.id === id);
}

export async function findScriptByPackage(
	packageName: string
): Promise<ScriptMeta | undefined> {
	const scripts = await loadScripts();
	return scripts.find((script) => script.packageName === packageName);
}

export async function deleteScript(
	id: string
): Promise<ScriptMeta | undefined> {
	const scripts = await loadScripts();
	const index = scripts.findIndex((script) => script.id === id);

	if (index === -1) {
		return;
	}

	const [script] = scripts.splice(index, 1);
	if (!script) {
		return;
	}

	await saveScripts(scripts);

	try {
		await Bun.file(getScriptFilePath(script.id)).delete();
	} catch {
		// Ignore file deletion errors
	}

	return script;
}
