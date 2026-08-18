/**
 * pi-v4-jspace — DeepSeek V4 Minimal Anchor + J-Space runtime for Pi.
 *
 * Core flow (TDD §66):
 *   first provider request = exact DSH minimal surface (payload rewrite)
 *   → first real tool call → promote (restore full Pi surface)
 *   → steer `/skill:j-space` (once per compaction epoch)
 *   → J-Space runs its own fast/full/loop gate.
 *
 * Non-matched models are completely untouched (G-003).
 */
import type { AgentMessage } from "@earendil-works/pi-agent-core";
import type {
	ExtensionAPI,
	ExtensionContext,
} from "@earendil-works/pi-coding-agent";
import { readV4JSpaceConfig } from "./config";
import { createRuntimeState, type RuntimeState } from "./state";
import { applyStatus } from "./status";
import { resolveAdapterProfile } from "./anchor/profile";
import { syncAdapter } from "./anchor/activation";
import {
	extractRequestSurface,
	rewriteProviderRequest,
} from "./anchor/payload-rewrite";
import {
	composeAnchoredPrompt,
	promptResourcesFrom,
	toolResourcesFromLiveTools,
} from "./anchor/prompt";
import { scanSessionPhase } from "./anchor/promotion";
import { emptyPromptResources } from "./anchor/prompt";
import { emptySessionPhase } from "./anchor/state";
import { registerStrReplaceEditorTool } from "./anchor/tools/str-replace-editor";
import { discoverJSpaceSkill } from "./jspace/discovery";
import {
	queueJSpaceActivation,
	cancelPendingActivation,
} from "./jspace/manager";
import {
	persistV4JSpaceState,
	restoreV4JSpaceState,
} from "./jspace/persistence";
import { registerV4JCommand } from "./commands/command";
import { appendRequestDump, resolveDumpPath } from "./diagnostics/request-dump";

function sessionEntries(ctx: ExtensionContext) {
	try {
		return ctx.sessionManager.buildContextEntries();
	} catch {
		try {
			return ctx.sessionManager.getEntries();
		} catch {
			return [];
		}
	}
}

function refreshPhase(
	pi: ExtensionAPI,
	ctx: ExtensionContext,
	runtime: RuntimeState,
): void {
	const scan = scanSessionPhase(sessionEntries(ctx), runtime.config.promotion);
	if (scan.firstUserText && !runtime.phase.firstUserText)
		runtime.phase.firstUserText = scan.firstUserText;
	runtime.phase.userRounds = Math.max(runtime.phase.userRounds, scan.userRounds);
	runtime.phase.hasAssistant = runtime.phase.hasAssistant || scan.hasAssistant;
	runtime.phase.hasTool = runtime.phase.hasTool || scan.hasTool;
	runtime.phase.compactionSeq = scan.compactionSeq;

	const profile = resolveAdapterProfile(ctx, runtime.config);
	runtime.phase.profile = profile;
	runtime.matchedModel = profile !== "inactive";
	runtime.phase.promoted = runtime.matchedModel && scan.promoted;
	syncAdapter(pi, ctx, runtime);
}

function composeCurrentPrompt(
	pi: ExtensionAPI,
	runtime: RuntimeState,
	assembledPrompt?: string,
): string {
	// Promote 时从 live catalog 刷新 tools-guide：bootstrap 快照可能只有稀疏
	// toolSnippets，导致 re-anchored guide 渲染 "(none)"（上游已验证的修复）。
	const liveResources = runtime.phase.promoted
		? toolResourcesFromLiveTools(pi.getAllTools())
		: {};
	return composeAnchoredPrompt({
		...runtime.promptResources,
		...liveResources,
		selectedTools: runtime.phase.promoted
			? pi.getActiveTools()
			: runtime.promptResources.selectedTools,
		includeWorkspace: runtime.phase.promoted,
		assembledPrompt,
	});
}

function noteUserText(runtime: RuntimeState, text: string | undefined): void {
	const trimmed = text?.trim();
	if (!trimmed) return;
	if (!runtime.phase.firstUserText) runtime.phase.firstUserText = trimmed;
	if (runtime.phase.userRounds === 0) runtime.phase.userRounds = 1;
}

function noteAssistant(
	runtime: RuntimeState,
	message: AgentMessage | undefined,
): void {
	if (!message || message.role !== "assistant") return;
	runtime.phase.hasAssistant = true;
	if (
		Array.isArray(message.content) &&
		message.content.some((part) => part?.type === "toolCall")
	) {
		runtime.phase.hasTool = true;
	}
}

/** 仅在匹配模型时设置一次 max thinking；用户手动降级只警告，不循环抢占（G-004）。 */
function applyThinking(pi: ExtensionAPI, runtime: RuntimeState): void {
	try {
		pi.setThinkingLevel("max");
	} catch {
		// 模型不支持 reasoning 等场景：记录实际值即可
	}
	try {
		runtime.actualThinking = pi.getThinkingLevel();
	} catch {
		runtime.actualThinking = undefined;
	}
}

export default function v4JSpace(pi: ExtensionAPI) {
	const runtime = createRuntimeState(process.cwd());

	// Anchor 工具注册（str_replace_editor 始终注册；只有 bootstrap 阶段才激活）
	registerStrReplaceEditorTool(pi);
	registerV4JCommand(pi, runtime);

	pi.on("session_start", async (_event, ctx) => {
		runtime.cwd = ctx.cwd;
		runtime.shell.setCwd(ctx.cwd);
		runtime.config = readV4JSpaceConfig();
		runtime.phase = emptySessionPhase();
		runtime.promptResources = emptyPromptResources();
		runtime.jspace.available = discoverJSpaceSkill(pi).available;
		// 恢复持久化状态：reload / resume / fork 不重复激活 J-Space（AC-011）
		const restored = restoreV4JSpaceState(ctx.sessionManager.getEntries());
		runtime.jspace.activatedCompactionSeq = restored.activatedCompactionSeq;
		runtime.jspace.resumeRequired = restored.resumeRequired;
		refreshPhase(pi, ctx, runtime);
		if (runtime.matchedModel && runtime.config.setThinkingOnModelSelect) {
			applyThinking(pi, runtime);
		}
		applyStatus(ctx, runtime);
	});

	pi.on("model_select", async (_event, ctx) => {
		runtime.cwd = ctx.cwd;
		runtime.shell.setCwd(ctx.cwd);
		const wasMatched = runtime.matchedModel;
		refreshPhase(pi, ctx, runtime);
		if (runtime.matchedModel) {
			if (runtime.config.setThinkingOnModelSelect) applyThinking(pi, runtime);
		} else if (wasMatched) {
			// 切到非 V4：取消排队中的激活；syncAdapter 已恢复原工具（AC-012）
			cancelPendingActivation(runtime);
		}
		applyStatus(ctx, runtime);
	});

	pi.on("session_compact", async (_event, ctx) => {
		// 回到 bootstrap，进入新 epoch（G-011 / AC-009）
		runtime.phase.hasAssistant = false;
		runtime.phase.hasTool = false;
		runtime.phase.promoted = false;
		runtime.jspace.activationPending = false;
		runtime.jspace.activatedCompactionSeq = null;
		runtime.jspace.resumeRequired = runtime.config.jspace.resumeAfterCompaction;
		refreshPhase(pi, ctx, runtime);
		persistV4JSpaceState(pi, {
			version: 1,
			compactionSeq: runtime.phase.compactionSeq,
			event: "compacted",
			timestamp: Date.now(),
		});
		applyStatus(ctx, runtime);
	});

	pi.on("session_shutdown", async () => {
		// Session-scoped persistent bash 必须清理（TDD §35）
		await runtime.shell.reset("session shutdown");
	});

	pi.on("input", async (event) => {
		noteUserText(runtime, event.text);
		return undefined;
	});

	pi.on("before_agent_start", async (event, ctx) => {
		noteUserText(runtime, event.prompt);
		refreshPhase(pi, ctx, runtime);
		if (runtime.phase.profile === "inactive") return undefined;
		// Bootstrap 只缓存 prompt resources；真正的 wipe 延迟到
		// before_provider_request，避免抹掉其他扩展的追加（TDD §18）
		runtime.promptResources = promptResourcesFrom(event.systemPromptOptions);
		if (!runtime.phase.promoted) return undefined;
		return {
			systemPrompt: composeCurrentPrompt(pi, runtime, event.systemPrompt),
		};
	});

	pi.on("message_end", async (event, ctx) => {
		noteAssistant(runtime, event.message);
		if (runtime.phase.hasAssistant || runtime.phase.hasTool)
			refreshPhase(pi, ctx, runtime);
	});

	pi.on("tool_call", async (_event, ctx) => {
		if (!runtime.matchedModel) return;
		const wasPromoted = runtime.phase.promoted;
		runtime.phase.hasTool = true;
		refreshPhase(pi, ctx, runtime);
		// 先 Promote，后 queue J-Space；顺序不可颠倒（TDD §23）
		if (!wasPromoted && runtime.phase.promoted) {
			queueJSpaceActivation(pi, runtime);
		}
		applyStatus(ctx, runtime);
	});

	pi.on("thinking_level_select", async (event, ctx) => {
		runtime.actualThinking = event.level;
		applyStatus(ctx, runtime);
	});

	pi.on("before_provider_request", async (event, ctx) => {
		refreshPhase(pi, ctx, runtime);
		if (runtime.phase.profile === "inactive") return undefined;

		const assembled =
			extractRequestSurface(event.payload).system ?? ctx.getSystemPrompt();
		const rewritten = rewriteProviderRequest(event.payload, {
			persona: composeCurrentPrompt(pi, runtime, assembled),
			// Bootstrap：payload 级重写为 DSH 两工具；Promoted：恢复原样（G-008）
			rewriteTools: runtime.phase.profile === "pro" && !runtime.phase.promoted,
		});

		const dumpPath = resolveDumpPath(runtime.config.debugDump);
		if (dumpPath) {
			const surface = extractRequestSurface(rewritten);
			appendRequestDump(dumpPath, {
				timestamp: Date.now(),
				matched: runtime.matchedModel,
				anchorPhase: runtime.phase.promoted ? "promoted" : "bootstrap",
				compactionSeq: runtime.phase.compactionSeq,
				jspaceActivated:
					runtime.jspace.activatedCompactionSeq === runtime.phase.compactionSeq,
				system: surface.system,
				tools: surface.toolNames,
			});
		}

		return rewritten;
	});
}
