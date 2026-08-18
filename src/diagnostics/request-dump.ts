/**
 * Debug request dump (TDD §44-45).
 *
 * Off by default. Enabled via `PI_V4_JSPACE_DUMP=/path/to/file.jsonl` or
 * `/v4j dump on` (writes `~/.pi/agent/pi-v4-jspace-dump.jsonl`).
 * Dump files may contain provider request surfaces — the help text warns
 * about sensitive content (PRD §17).
 */
import { appendFileSync } from "node:fs";
import { join } from "node:path";
import { getAgentDir } from "@earendil-works/pi-coding-agent";

export const DEFAULT_DUMP_BASENAME = "pi-v4-jspace-dump.jsonl";

export function resolveDumpPath(configDebugDump: boolean): string | undefined {
	const env = process.env.PI_V4_JSPACE_DUMP;
	if (env && env.trim().length > 0) return env.trim();
	if (configDebugDump) return join(getAgentDir(), DEFAULT_DUMP_BASENAME);
	return undefined;
}

export interface RequestDumpEntry {
	timestamp: number;
	matched: boolean;
	anchorPhase: "bootstrap" | "promoted" | "off";
	compactionSeq: number;
	jspaceActivated: boolean;
	system?: string;
	tools: string[];
}

/** Append one dump line. Any failure is a warning, never a crash. */
export function appendRequestDump(path: string, entry: RequestDumpEntry): void {
	try {
		appendFileSync(path, `${JSON.stringify(entry)}\n`, { encoding: "utf8" });
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		console.warn(`[pi-v4-jspace] Failed to write request dump ${path}: ${message}`);
	}
}
