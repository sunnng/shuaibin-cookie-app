import { readdir } from "node:fs/promises";
import { join } from "node:path";
import { promisify } from "node:util";
import { inflateRaw } from "node:zlib";
import type { BunFile } from "bun";
import { $ } from "bun";

declare const Bun: typeof import("bun");

const AAPT_PACKAGE_REGEX = /package: name='([^']+)'.*versionName='([^']*)'/;
const AAPT_ACTIVITY_REGEX = /launchable-activity: name='([^']+)'/;
const TRAILING_NULL_REGEX = /\0+$/;

const inflateRawAsync = promisify(inflateRaw);

async function findAaptPath(): Promise<string | undefined> {
	if (process.env.AAPT_PATH) {
		return process.env.AAPT_PATH;
	}

	const userHome =
		process.env.USERPROFILE || `C:\\Users\\${process.env.USERNAME ?? "User"}`;
	const sdkRoots = [
		process.env.ANDROID_HOME,
		process.env.ANDROID_SDK_ROOT,
		`${userHome}\\AppData\\Local\\Android\\Sdk`,
		"C:\\Android\\Sdk",
		"D:\\Android\\Sdk",
	].filter((root): root is string => Boolean(root));

	for (const root of sdkRoots) {
		const buildToolsDir = join(root, "build-tools");
		try {
			const entries = await readdir(buildToolsDir, { withFileTypes: true });
			const versions = entries
				.filter((entry) => entry.isDirectory())
				.map((entry) => entry.name)
				.sort();

			for (const version of versions.reverse()) {
				for (const name of ["aapt.exe", "aapt2.exe"]) {
					const candidate = join(buildToolsDir, version, name);
					if (await Bun.file(candidate).exists()) {
						return candidate;
					}
				}
			}
		} catch {
			// SDK path not found
		}
	}

	return;
}

export interface ApkInfo {
	mainActivity?: string;
	packageName: string;
	versionName?: string;
}

export async function parseApkInfo(apkPath: string): Promise<ApkInfo> {
	try {
		return await parseWithAapt(apkPath);
	} catch (aaptError) {
		try {
			return await parseWithAxml(apkPath);
		} catch {
			throw aaptError;
		}
	}
}

async function parseWithAapt(apkPath: string): Promise<ApkInfo> {
	const aapt = (await findAaptPath()) ?? "aapt";
	const output = await $`"${aapt}" dump badging ${apkPath}`.text();

	const packageMatch = output.match(AAPT_PACKAGE_REGEX);
	if (!packageMatch?.[1]) {
		throw new Error("aapt output did not contain package info");
	}

	const activityMatch = output.match(AAPT_ACTIVITY_REGEX);

	return {
		packageName: packageMatch[1],
		versionName: packageMatch[2] || undefined,
		mainActivity: activityMatch?.[1] || undefined,
	};
}

async function parseWithAxml(apkPath: string): Promise<ApkInfo> {
	const file = Bun.file(apkPath);
	const zipReader = new ZipReader(file);
	const manifestBuffer = await zipReader.extract("AndroidManifest.xml");

	if (!manifestBuffer) {
		throw new Error("AndroidManifest.xml not found in APK");
	}

	const info = parseAxml(Buffer.from(manifestBuffer));
	if (info.packageName === "unknown") {
		throw new Error("Failed to parse package name from AndroidManifest.xml");
	}

	return info;
}

function parseAxml(buffer: Buffer): ApkInfo {
	let offset = 8;
	let strings: string[] = [];
	let packageName = "unknown";
	let versionName: string | undefined;
	const launcherFinder = new LauncherActivityFinder();

	while (offset < buffer.length) {
		const chunkType = buffer.readUInt16LE(offset);
		const chunkSize = buffer.readUInt32LE(offset + 4);

		if (chunkSize === 0) {
			break;
		}

		if (chunkType === 0x00_01) {
			strings = parseStringPool(buffer, offset);
		} else if (chunkType === 0x01_02) {
			const { elementName, attrs } = parseStartElement(buffer, offset, strings);

			if (elementName === "manifest") {
				packageName = attrs.package ?? packageName;
				versionName = attrs.versionName;
			} else {
				launcherFinder.onStartElement(elementName, attrs);
			}
		} else if (chunkType === 0x01_03) {
			const elementName = parseEndElementName(buffer, offset, strings);
			launcherFinder.onEndElement(elementName);
		}

		offset += chunkSize;
	}

	return {
		packageName,
		versionName,
		mainActivity: launcherFinder.mainActivity,
	};
}

function parseStartElement(
	buffer: Buffer,
	offset: number,
	strings: string[]
): {
	attrs: Record<string, string | undefined>;
	elementName: string | undefined;
} {
	const headerSize = buffer.readUInt16LE(offset + 2);
	const nameIdx = buffer.readUInt32LE(offset + 20);
	const attrStartField = buffer.readUInt16LE(offset + 24);
	const attrSize = buffer.readUInt16LE(offset + 26);
	const attrCount = buffer.readUInt16LE(offset + 28);
	const attrStart = offset + headerSize + attrStartField;

	const attrs: Record<string, string | undefined> = {};
	for (let i = 0; i < attrCount; i++) {
		const attrOffset = attrStart + i * attrSize;
		const attrNameIdx = buffer.readUInt32LE(attrOffset + 4);
		const rawValueIdx = buffer.readUInt32LE(attrOffset + 8);
		const attrName = strings[attrNameIdx];
		const attrValue =
			rawValueIdx < strings.length ? strings[rawValueIdx] : undefined;
		if (attrName) {
			attrs[attrName] = attrValue;
		}
	}

	return { elementName: strings[nameIdx], attrs };
}

function parseEndElementName(
	buffer: Buffer,
	offset: number,
	strings: string[]
): string | undefined {
	const nameIdx = buffer.readUInt32LE(offset + 20);
	return strings[nameIdx];
}

function parseStringPool(buffer: Buffer, start: number): string[] {
	const stringCount = buffer.readUInt32LE(start + 8);
	const flags = buffer.readUInt32LE(start + 16);
	const stringsStart = buffer.readUInt32LE(start + 20);
	// biome-ignore lint/suspicious/noBitwiseOperators: AXML string pool flags use bitwise check
	const isUtf8 = (flags & 0x1_00) !== 0;

	const strings: string[] = [];
	let offset = start + stringsStart;

	for (let i = 0; i < stringCount; i++) {
		if (isUtf8) {
			buffer.readUInt8(offset); // skip length prefix
			const actualLength = buffer.readUInt8(offset + 1);
			const end = offset + 2 + actualLength;
			strings.push(
				buffer
					.toString("utf-8", offset + 2, end)
					.replace(TRAILING_NULL_REGEX, "")
			);
			offset = end + 1;
		} else {
			const length = buffer.readUInt16LE(offset) * 2;
			const end = offset + 2 + length;
			strings.push(
				buffer
					.toString("utf-16le", offset + 2, end)
					.replace(TRAILING_NULL_REGEX, "")
			);
			offset = end + 2;
		}
	}

	return strings;
}

class LauncherActivityFinder {
	currentActivity: string | undefined;
	hasMainAction = false;
	hasLauncherCategory = false;
	mainActivity: string | undefined;

	onStartElement(
		elementName: string | undefined,
		attrs: Record<string, string | undefined>
	): void {
		if (elementName === "activity") {
			this.currentActivity = attrs.name;
			this.hasMainAction = false;
			this.hasLauncherCategory = false;
		} else if (
			elementName === "action" &&
			attrs.name === "android.intent.action.MAIN"
		) {
			this.hasMainAction = true;
		} else if (
			elementName === "category" &&
			attrs.name === "android.intent.category.LAUNCHER"
		) {
			this.hasLauncherCategory = true;
		}
	}

	onEndElement(elementName: string | undefined): void {
		if (elementName !== "activity") {
			return;
		}

		if (
			this.currentActivity &&
			this.hasMainAction &&
			this.hasLauncherCategory
		) {
			this.mainActivity = this.currentActivity;
		}

		this.currentActivity = undefined;
		this.hasMainAction = false;
		this.hasLauncherCategory = false;
	}
}

class ZipReader {
	private data!: ArrayBuffer;
	private view!: DataView;
	private readonly file: BunFile;

	constructor(file: BunFile) {
		this.file = file;
	}

	async extract(name: string): Promise<ArrayBuffer | null> {
		this.data = await this.file.arrayBuffer();
		this.view = new DataView(this.data);

		const entries = this.parseCentralDirectory();
		const entry = entries.get(name);
		if (!entry) {
			return null;
		}

		const localOffset = entry.offset;
		const fileNameLength = this.view.getUint16(localOffset + 26, true);
		const extraFieldLength = this.view.getUint16(localOffset + 28, true);
		const dataOffset = localOffset + 30 + fileNameLength + extraFieldLength;
		const compressed = new Uint8Array(
			this.data,
			dataOffset,
			entry.compressedSize
		);

		if (entry.method === 0) {
			return compressed.buffer.slice(
				compressed.byteOffset,
				compressed.byteOffset + compressed.byteLength
			);
		}

		const inflated = await inflateRawAsync(compressed);
		return inflated.buffer.slice(
			inflated.byteOffset,
			inflated.byteOffset + inflated.byteLength
		);
	}

	private parseCentralDirectory(): Map<
		string,
		{
			compressedSize: number;
			method: number;
			offset: number;
			uncompressedSize: number;
		}
	> {
		const entries = new Map<
			string,
			{
				compressedSize: number;
				method: number;
				offset: number;
				uncompressedSize: number;
			}
		>();

		const eocdOffset = this.findEocd();
		if (eocdOffset < 0) {
			return entries;
		}

		const centralDirOffset = this.view.getUint32(eocdOffset + 16, true);
		const centralDirSize = this.view.getUint32(eocdOffset + 12, true);
		let offset = centralDirOffset;
		const end = centralDirOffset + centralDirSize;

		while (offset < end) {
			const signature = this.view.getUint32(offset, true);
			if (signature !== 0x02_01_4b_50) {
				break;
			}

			const compressedSize = this.view.getUint32(offset + 20, true);
			const uncompressedSize = this.view.getUint32(offset + 24, true);
			const fileNameLength = this.view.getUint16(offset + 28, true);
			const extraFieldLength = this.view.getUint16(offset + 30, true);
			const commentLength = this.view.getUint16(offset + 32, true);
			const localHeaderOffset = this.view.getUint32(offset + 42, true);
			const method = this.view.getUint16(offset + 10, true);
			const fileName = new TextDecoder().decode(
				new Uint8Array(this.data, offset + 46, fileNameLength)
			);

			entries.set(fileName, {
				offset: localHeaderOffset,
				compressedSize,
				uncompressedSize,
				method,
			});

			offset += 46 + fileNameLength + extraFieldLength + commentLength;
		}

		return entries;
	}

	private findEocd(): number {
		const maxBack = Math.min(this.data.byteLength, 65_536);
		for (let i = 0; i < maxBack - 21; i++) {
			const offset = this.data.byteLength - 22 - i;
			if (this.view.getUint32(offset, true) === 0x06_05_4b_50) {
				return offset;
			}
		}
		return -1;
	}
}
