import { readdir } from "node:fs/promises";
import { join } from "node:path";
import type { BunFile } from "bun";
import { $ } from "bun";

declare const Bun: typeof import("bun");

const AAPT_PACKAGE_REGEX = /package: name='([^']+)'.*versionName='([^']*)'/;
const AAPT_ACTIVITY_REGEX = /launchable-activity: name='([^']+)'/;
const ACTIVITY_NAME_REGEX = /\w+Activity$/;

async function findAaptPath(): Promise<string | undefined> {
	if (process.env.AAPT_PATH) {
		return process.env.AAPT_PATH;
	}

	const userHome =
		process.env.USERPROFILE || `C:\\Users\\${process.env.USERNAME ?? "User"}`;
	const buildToolsDir = `${userHome}\\AppData\\Local\\Android\\Sdk\\build-tools`;

	try {
		const entries = await readdir(buildToolsDir, { withFileTypes: true });
		const versions = entries
			.filter((entry) => entry.isDirectory())
			.map((entry) => entry.name)
			.sort();

		for (const version of versions.reverse()) {
			const candidate = join(buildToolsDir, version, "aapt.exe");
			if (await Bun.file(candidate).exists()) {
				return candidate;
			}
		}
	} catch {
		// Android SDK not found
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
	} catch {
		return parseWithAxml(apkPath);
	}
}

async function parseWithAapt(apkPath: string): Promise<ApkInfo> {
	const aapt = (await findAaptPath()) ?? "aapt";
	const output = await $`"${aapt}" dump badging ${apkPath}`.text();

	const packageMatch = output.match(AAPT_PACKAGE_REGEX);
	if (!packageMatch) {
		throw new Error("aapt output did not contain package info");
	}

	const activityMatch = output.match(AAPT_ACTIVITY_REGEX);

	return {
		packageName: packageMatch[1] ?? "unknown",
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

	return parseAxml(Buffer.from(manifestBuffer));
}

function parseAxml(buffer: Buffer): ApkInfo {
	let offset = 8;
	let strings: string[] = [];
	let packageName = "unknown";
	let versionName: string | undefined;
	let mainActivity: string | undefined;

	while (offset < buffer.length) {
		const chunkType = buffer.readUInt16LE(offset);
		const chunkSize = buffer.readUInt32LE(offset + 4);

		if (chunkType === 0x00_01) {
			strings = parseStringPool(buffer, offset);
			mainActivity ??= strings.find((s) => ACTIVITY_NAME_REGEX.test(s));
		} else if (chunkType === 0x01_02) {
			const attrCount = buffer.readUInt16LE(offset + 28);
			const attrStart = offset + 32;

			for (let i = 0; i < attrCount; i++) {
				const attrOffset = attrStart + i * 20;
				const nameIdx = buffer.readUInt32LE(attrOffset + 4);
				const valueIdx = buffer.readUInt32LE(attrOffset + 8);
				const name = strings[nameIdx];

				if (name === "package") {
					packageName = strings[valueIdx] ?? packageName;
				} else if (name === "versionName") {
					versionName = strings[valueIdx];
				}
			}
		}

		offset += chunkSize;
		if (chunkSize === 0) {
			break;
		}
	}

	return { packageName, versionName, mainActivity };
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
			strings.push(buffer.toString("utf-8", offset + 2, end));
			offset = end + 1;
		} else {
			const length = buffer.readUInt16LE(offset) * 2;
			const end = offset + 2 + length;
			strings.push(buffer.toString("utf-16le", offset + 2, end));
			offset = end + 2;
		}
	}

	return strings;
}

class ZipReader {
	private readonly file: BunFile;

	constructor(file: BunFile) {
		this.file = file;
	}

	async extract(name: string): Promise<ArrayBuffer | null> {
		const data = await this.file.arrayBuffer();
		const view = new DataView(data);
		let offset = 0;

		while (offset < data.byteLength) {
			const signature = view.getUint32(offset, true);

			if (signature === 0x04_03_4b_50) {
				const compressedSize = view.getUint32(offset + 18, true);
				const uncompressedSize = view.getUint32(offset + 22, true);
				const fileNameLength = view.getUint16(offset + 26, true);
				const extraFieldLength = view.getUint16(offset + 28, true);
				const fileName = new TextDecoder().decode(
					new Uint8Array(data, offset + 30, fileNameLength)
				);

				const dataOffset = offset + 30 + fileNameLength + extraFieldLength;

				if (fileName === name) {
					const compressed = new Uint8Array(data, dataOffset, compressedSize);

					if (compressedSize === uncompressedSize) {
						return compressed.buffer.slice(
							compressed.byteOffset,
							compressed.byteOffset + compressed.byteLength
						);
					}

					const { inflateRaw } = await import("node:zlib");
					return new Promise((resolve, reject) => {
						inflateRaw(compressed, (err, result) => {
							if (err) {
								reject(err);
							} else {
								resolve(result.buffer);
							}
						});
					});
				}

				offset = dataOffset + compressedSize;
			} else if (signature === 0x02_01_4b_50 || signature === 0x06_05_4b_50) {
				break;
			} else {
				offset++;
			}
		}

		return null;
	}
}
