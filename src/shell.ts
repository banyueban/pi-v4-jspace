/**
 * Bash executable resolution for the persistent bootstrap shell.
 *
 * Mirrors Pi's own resolution order (`dist/utils/shell.js`) so the anchored
 * bash behaves like the host bash on every platform:
 *
 *   1. settings.json `shellPath`
 *   2. Windows: Git Bash known locations (`%ProgramFiles%\Git\bin\bash.exe`)
 *   3. `where bash.exe` / `which bash` on PATH
 *
 * The persistent-session transport (stdin command streaming) requires a real
 * bash; the legacy WSL shim (`C:\Windows\System32\bash.exe`) is rejected with
 * an explicit error instead of hanging.
 */
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

export interface ResolvedShell {
	executable: string;
	/** Where the executable came from, for diagnostics. */
	via: string;
}

/** settings.json shellPath override (mirrors pi's settings lookup). */
export function readSettingsShellPath(): string | undefined {
	try {
		const settingsPath = join(homedir(), ".pi", "agent", "settings.json");
		if (!existsSync(settingsPath)) return undefined;
		const parsed = JSON.parse(
			requireFs().readFileSync(settingsPath, "utf-8"),
		) as unknown;
		if (!parsed || typeof parsed !== "object" || Array.isArray(parsed))
			return undefined;
		const shellPath = (parsed as Record<string, unknown>).shellPath;
		return typeof shellPath === "string" && shellPath.length > 0
			? shellPath
			: undefined;
	} catch {
		return undefined;
	}
}

function requireFs(): typeof import("node:fs") {
	// 延迟 require，避免顶层副作用；node:fs 本身无副作用，仅为可测试性留口。
	return require("node:fs") as typeof import("node:fs");
}

function isLegacyWslBashPath(value: string): boolean {
	const normalized = value.replace(/\//g, "\\").toLowerCase();
	return /^[a-z]:\\windows\\(?:system32|sysnative)\\bash\.exe$/.test(normalized);
}

function findBashOnPath(): string | undefined {
	try {
		const probe = process.platform === "win32" ? "where" : "which";
		const result = spawnSync(probe, ["bash.exe"], {
			encoding: "utf-8",
			timeout: 5000,
			windowsHide: true,
		});
		if (result.status === 0 && result.stdout) {
			const firstMatch = result.stdout.trim().split(/\r?\n/)[0];
			if (firstMatch && existsSync(firstMatch)) return firstMatch;
		}
	} catch {
		// ignore
	}
	return undefined;
}

export function resolveBashExecutable(customShellPath?: string): ResolvedShell {
	// 1. User-specified shell path (settings.json)
	const configured = customShellPath ?? readSettingsShellPath();
	if (configured && configured.trim().length > 0) {
		if (isLegacyWslBashPath(configured)) {
			throw new Error(
				`[pi-v4-jspace] shellPath ${configured} is the WSL shim; the persistent bootstrap bash needs a real bash (Git Bash / Cygwin / MSYS2).`,
			);
		}
		if (existsSync(configured))
			return { executable: configured, via: "settings.json shellPath" };
		throw new Error(`[pi-v4-jspace] Custom shell path not found: ${configured}`);
	}

	// 2. Git Bash in known locations (Windows)
	if (process.platform === "win32") {
		const candidates: string[] = [];
		const programFiles = process.env.ProgramFiles;
		if (programFiles) candidates.push(`${programFiles}\\Git\\bin\\bash.exe`);
		const programFilesX86 = process.env["ProgramFiles(x86)"];
		if (programFilesX86)
			candidates.push(`${programFilesX86}\\Git\\bin\\bash.exe`);
		for (const candidate of candidates) {
			if (existsSync(candidate))
				return { executable: candidate, via: "Git Bash known location" };
		}
	}

	// 3. bash on PATH
	const onPath = findBashOnPath();
	if (onPath) return { executable: onPath, via: "PATH" };

	throw new Error(
		"[pi-v4-jspace] No bash shell found for the persistent bootstrap session. " +
			"Install Git for Windows (https://git-scm.com/download/win), add a real bash to PATH, or set shellPath in ~/.pi/agent/settings.json. " +
			"The anchor keeps working; only the bootstrap bash tool is unavailable.",
	);
}
