/**
 * `/v4j doctor` (TDD §13).
 *
 * Checks the package extension, model match, thinking level, J-Space skill
 * discovery, vendored skill files, anchor tool registration, and provider
 * rewrite enablement. When Python exists, optionally runs the vendored
 * `verify_suite.py`. Missing Python is a WARN, never an ERROR.
 */
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { spawnSync } from "node:child_process";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import type { RuntimeState } from "../state";
import { discoverJSpaceSkill } from "../jspace/discovery";
import { STR_REPLACE_EDITOR_TOOL_NAME } from "../anchor/tool-set";

export interface DoctorResult {
	checks: { label: string; ok: boolean; warn?: boolean; detail?: string }[];
	verifySuite?: { ran: boolean; ok: boolean; output?: string };
}

/** Fallback skill root relative to this source file (src/commands/doctor.ts). */
function vendoredSkillRoot(): string {
	return join(import.meta.dirname, "..", "..", "skills", "j-space");
}

function findPython(): string | undefined {
	for (const candidate of ["python3", "python"]) {
		try {
			const probe = spawnSync(candidate, ["--version"], {
				encoding: "utf-8",
				timeout: 10_000,
				windowsHide: true,
			});
			if (probe.status === 0) return candidate;
		} catch {
			// try next
		}
	}
	return undefined;
}

export function runDoctor(
	pi: ExtensionAPI,
	runtime: RuntimeState,
): DoctorResult {
	const checks: DoctorResult["checks"] = [];

	checks.push({
		label: "Package extension loaded",
		ok: true,
		detail: "pi-v4-jspace extension is running",
	});

	checks.push({
		label: "DeepSeek V4 model matched",
		ok: runtime.matchedModel,
		detail: runtime.matchedModel
			? "model id/name matches configured patterns"
			: "current model is not a matched DeepSeek V4 model",
	});

	checks.push({
		label: "Thinking = max",
		ok: runtime.actualThinking === "max",
		warn: runtime.actualThinking !== "max",
		detail: `current thinking level: ${runtime.actualThinking ?? "n/a"} (desired max)`,
	});

	const discovery = discoverJSpaceSkill(pi);
	checks.push({
		label: "J-Space skill command available",
		ok: discovery.available,
		detail: discovery.available
			? `command: ${discovery.commandName}`
			: "skill command not discovered (package filtering?)",
	});

	// 优先用 skill 实际加载路径，找不到再退回 vendored 路径
	const skillRoot = discovery.path
		? dirname(discovery.path)
		: vendoredSkillRoot();
	const skillFile = join(skillRoot, "SKILL.md");
	const modulesDir = join(skillRoot, "modules");
	const verifySuite = join(skillRoot, "scripts", "verify_suite.py");

	checks.push({
		label: "J-Space SKILL.md exists",
		ok: existsSync(skillFile),
		detail: skillFile,
	});
	checks.push({
		label: "J-Space modules directory exists",
		ok: existsSync(modulesDir),
		detail: modulesDir,
	});
	checks.push({
		label: "J-Space verify_suite.py exists",
		ok: existsSync(verifySuite),
		detail: verifySuite,
	});

	const tools = pi.getAllTools();
	checks.push({
		label: "Anchor tool definitions loaded",
		ok: tools.some((tool) => tool.name === STR_REPLACE_EDITOR_TOOL_NAME),
		detail: `str_replace_editor registered: ${tools.some((tool) => tool.name === STR_REPLACE_EDITOR_TOOL_NAME)}`,
	});
	checks.push({
		label: "Provider rewrite enabled",
		ok: runtime.config.enabled,
		detail: runtime.config.enabled
			? "before_provider_request rewrite active when matched"
			: "disabled via config",
	});

	const result: DoctorResult = { checks };

	// Python 可选：存在则跑 verify_suite.py（TDD §13 / G-013）
	const python = findPython();
	if (!python) {
		checks.push({
			label: "Python controller",
			ok: true,
			warn: true,
			detail:
				"Python not found; J-Space controller is optional (dialogue ledger fallback works)",
		});
		return result;
	}

	if (existsSync(verifySuite)) {
		try {
			const run = spawnSync(python, [verifySuite], {
				encoding: "utf-8",
				timeout: 120_000,
				windowsHide: true,
				cwd: dirname(verifySuite),
			});
			result.verifySuite = {
				ran: true,
				ok: run.status === 0,
				output: `${run.stdout ?? ""}${run.stderr ?? ""}`.trim().slice(0, 4000),
			};
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			result.verifySuite = { ran: true, ok: false, output: message };
		}
	}
	return result;
}

export function formatDoctor(result: DoctorResult): string {
	const lines = result.checks.map((check) => {
		let tag: string;
		if (!check.ok) tag = "[ERROR]";
		else if (check.warn) tag = "[WARN]";
		else tag = "[ OK ]";
		const detail = check.detail ? ` ${check.detail}` : "";
		return `${tag} ${check.label}${detail}`;
	});
	if (result.verifySuite) {
		lines.push("");
		lines.push(`verify_suite.py: ${result.verifySuite.ok ? "PASS" : "FAIL"}`);
		if (result.verifySuite.output)
			lines.push(result.verifySuite.output.slice(0, 2000));
	}
	return lines.join("\n");
}
