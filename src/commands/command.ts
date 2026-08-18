/**
 * `/v4j` command family (PRD §11-12, TDD §42-43).
 */
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import type { RuntimeState } from "../state";
import { readV4JSpaceConfig, writeV4JSpaceConfig } from "../config";
import { syncAdapter } from "../anchor/activation";
import { persistV4JSpaceState } from "../jspace/persistence";
import { applyStatus } from "../status";
import { describeModel } from "../model";

const V4J_USAGE =
	"Usage: /v4j, /v4j status, /v4j on, /v4j off, /v4j reanchor, /v4j doctor, /v4j dump on|off";

const V4J_COMPLETIONS = ["status", "on", "off", "reanchor", "doctor", "dump"] as const;

export function formatStatusText(runtime: RuntimeState, modelLabel: string): string {
	const activated = runtime.jspace.activatedCompactionSeq !== null;
	return [
		`pi-v4-jspace ${runtimeVersion()}`,
		"",
		`Enabled: ${runtime.config.enabled ? "yes" : "no"}`,
		`Model matched: ${runtime.matchedModel ? "yes" : "no"}`,
		`Model: ${modelLabel}`,
		`Thinking: ${runtime.actualThinking ?? "n/a"} (desired max)`,
		"",
		"Anchor:",
		`  phase: ${runtime.phase.promoted ? "promoted" : "bootstrap"}`,
		`  compaction epoch: ${runtime.phase.compactionSeq}`,
		`  first tool observed: ${runtime.phase.hasTool ? "yes" : "no"}`,
		"",
		"J-Space:",
		`  bundled skill: ${runtime.jspace.available ? "available" : "unavailable"}`,
		`  activated: ${activated ? "yes" : "no"}`,
		`  resume required: ${runtime.jspace.resumeRequired ? "yes" : "no"}`,
		"",
		"Runtime:",
		`  project: ${runtime.cwd}`,
	].join("\n");
}

function runtimeVersion(): string {
	// 版本号在 package.json；这里保持单点维护，避免运行期读文件。
	return "1.0.0";
}

export function registerV4JCommand(pi: ExtensionAPI, runtime: RuntimeState): void {
	pi.registerCommand("v4j", {
		description: "DeepSeek V4 Minimal Anchor + J-Space runtime (pi-v4-jspace)",
		getArgumentCompletions: (prefix) => {
			const trimmed = prefix.trim().toLowerCase();
			const [head] = trimmed.split(/\s+/, 1);
			return V4J_COMPLETIONS.filter((item) => item.startsWith(head ?? "")).map((value) => ({
				label: value,
				value,
			}));
		},
		handler: async (args, ctx) => {
			// 命令执行时重新读配置，保证外部修改可见
			runtime.config = readV4JSpaceConfig();
			const [rawHead, ...rest] = args.trim().split(/\s+/);
			const head = (rawHead ?? "").toLowerCase();
			const restText = rest.join(" ").trim();

			if (head === "on" || head === "off") {
				const next = { ...runtime.config, enabled: head === "on" };
				const write = writeV4JSpaceConfig(next);
				if (!write.ok) {
					ctx.ui.notify(`Failed to save v4j settings: ${write.error}`, "error");
					return;
				}
				runtime.config = next;
				if (!next.enabled) {
					// 完全退出 DeepSeek 模式：恢复原工具、停止注入（TDD §43）
					runtime.jspace.activationPending = false;
				}
				syncAdapter(pi, ctx, runtime);
				applyStatus(ctx, runtime);
				ctx.ui.notify(`pi-v4-jspace ${head === "on" ? "enabled" : "disabled"}`, "info");
				return;
			}

			if (head === "status") {
				ctx.ui.notify(formatStatusText(runtime, describeModel(ctx.model)), "info");
				return;
			}

			if (head === "reanchor") {
				// 只重置当前 Runtime Epoch，不清 session / 用户消息 / .jspace/（TDD §42）
				runtime.phase.hasAssistant = false;
				runtime.phase.hasTool = false;
				runtime.phase.promoted = false;
				runtime.jspace.activationPending = false;
				runtime.jspace.activatedCompactionSeq = null;
				runtime.jspace.resumeRequired = runtime.config.jspace.resumeAfterCompaction;
				syncAdapter(pi, ctx, runtime);
				persistV4JSpaceState(pi, {
					version: 1,
					compactionSeq: runtime.phase.compactionSeq,
					event: "manual-reanchor",
					timestamp: Date.now(),
				});
				applyStatus(ctx, runtime);
				ctx.ui.notify("pi-v4-jspace re-anchored: next tool call promotes and re-activates J-Space", "info");
				return;
			}

			if (head === "dump") {
				const dumpHead = restText;
				if (dumpHead === "on" || dumpHead === "off") {
					const next = { ...runtime.config, debugDump: dumpHead === "on" };
					const write = writeV4JSpaceConfig(next);
					if (!write.ok) {
						ctx.ui.notify(`Failed to save v4j settings: ${write.error}`, "error");
						return;
					}
					runtime.config = next;
					ctx.ui.notify(
						dumpHead === "on"
							? "Debug dumps enabled. Dump files may contain sensitive project or conversation content."
							: "Debug dumps disabled.",
						"info",
					);
					return;
				}
				ctx.ui.notify("Usage: /v4j dump on|off", "warning");
				return;
			}

			if (head) {
				ctx.ui.notify(V4J_USAGE, "warning");
				return;
			}

			ctx.ui.notify(formatStatusText(runtime, describeModel(ctx.model)), "info");
		},
	});
}
