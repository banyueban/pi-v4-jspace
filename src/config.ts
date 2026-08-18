/**
 * pi-v4-jspace configuration.
 *
 * File: `~/.pi/agent/pi-v4-jspace.json`
 *
 * Any read failure (missing file, malformed JSON, wrong field types) must
 * fall back to DEFAULT_CONFIG with a warning — never crash the host agent.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { getAgentDir } from "@earendil-works/pi-coding-agent";
import { normalizePromoteOn, type PromoteOn } from "./anchor/promotion";

export interface JSpaceConfigSection {
	enabled: boolean;
	activateAfterPromotion: boolean;
	resumeAfterCompaction: boolean;
}

export interface V4JSpaceConfig {
	enabled: boolean;
	modelPatterns: string[];
	thinking: "max";
	setThinkingOnModelSelect: boolean;
	/** v1.0 only supports "tool-call"; kept for forward compatibility. */
	promotion: PromoteOn;
	jspace: JSpaceConfigSection;
	statusLine: boolean;
	debugDump: boolean;
}

export const V4JSPACE_CONFIG_BASENAME = "pi-v4-jspace.json";

export const DEFAULT_MODEL_PATTERNS = ["deepseek-v4-pro", "deepseek-v4-flash"];

export const DEFAULT_CONFIG: V4JSpaceConfig = {
	enabled: true,
	modelPatterns: [...DEFAULT_MODEL_PATTERNS],
	thinking: "max",
	setThinkingOnModelSelect: true,
	promotion: "tool-call",
	jspace: {
		enabled: true,
		activateAfterPromotion: true,
		resumeAfterCompaction: true,
	},
	statusLine: true,
	debugDump: false,
};

function isObject(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function normalizePatternList(value: unknown, fallback: string[]): string[] {
	if (typeof value === "string") {
		const trimmed = value.trim();
		return trimmed.length > 0 ? [trimmed] : [...fallback];
	}
	if (!Array.isArray(value)) return [...fallback];
	const patterns = value
		.filter((entry): entry is string => typeof entry === "string")
		.map((entry) => entry.trim())
		.filter((entry) => entry.length > 0);
	return patterns.length > 0 ? [...new Set(patterns)] : [...fallback];
}

function normalizeJSpaceSection(value: unknown): JSpaceConfigSection {
	if (!isObject(value)) return { ...DEFAULT_CONFIG.jspace };
	return {
		enabled: typeof value.enabled === "boolean" ? value.enabled : DEFAULT_CONFIG.jspace.enabled,
		activateAfterPromotion:
			typeof value.activateAfterPromotion === "boolean"
				? value.activateAfterPromotion
				: DEFAULT_CONFIG.jspace.activateAfterPromotion,
		resumeAfterCompaction:
			typeof value.resumeAfterCompaction === "boolean"
				? value.resumeAfterCompaction
				: DEFAULT_CONFIG.jspace.resumeAfterCompaction,
	};
}

export function getV4JSpaceConfigPath(agentDir: string = getAgentDir()): string {
	return join(agentDir, V4JSPACE_CONFIG_BASENAME);
}

export function readV4JSpaceConfig(configPath: string = getV4JSpaceConfigPath()): V4JSpaceConfig {
	if (!existsSync(configPath)) return cloneConfig(DEFAULT_CONFIG);

	try {
		const parsed = JSON.parse(readFileSync(configPath, "utf-8")) as unknown;
		if (!isObject(parsed)) return cloneConfig(DEFAULT_CONFIG);
		return {
			enabled: typeof parsed.enabled === "boolean" ? parsed.enabled : DEFAULT_CONFIG.enabled,
			modelPatterns: normalizePatternList(parsed.modelPatterns, DEFAULT_MODEL_PATTERNS),
			thinking: parsed.thinking === "max" ? "max" : DEFAULT_CONFIG.thinking,
			setThinkingOnModelSelect:
				typeof parsed.setThinkingOnModelSelect === "boolean"
					? parsed.setThinkingOnModelSelect
					: DEFAULT_CONFIG.setThinkingOnModelSelect,
			promotion: normalizePromoteOn(parsed.promotion),
			jspace: normalizeJSpaceSection(parsed.jspace),
			statusLine: typeof parsed.statusLine === "boolean" ? parsed.statusLine : DEFAULT_CONFIG.statusLine,
			debugDump: typeof parsed.debugDump === "boolean" ? parsed.debugDump : DEFAULT_CONFIG.debugDump,
		};
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		console.warn(`[pi-v4-jspace] Failed to read ${configPath}: ${message}`);
		return cloneConfig(DEFAULT_CONFIG);
	}
}

export function writeV4JSpaceConfig(
	config: V4JSpaceConfig,
	configPath: string = getV4JSpaceConfigPath(),
): { ok: true } | { ok: false; error: string } {
	try {
		mkdirSync(dirname(configPath), { recursive: true });
		writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`, "utf-8");
		return { ok: true };
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		console.warn(`[pi-v4-jspace] Failed to write ${configPath}: ${message}`);
		return { ok: false, error: message };
	}
}

export function cloneConfig(config: V4JSpaceConfig): V4JSpaceConfig {
	return {
		...config,
		modelPatterns: [...config.modelPatterns],
		jspace: { ...config.jspace },
	};
}
