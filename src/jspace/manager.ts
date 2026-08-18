/**
 * J-Space activation manager (TDD §25, §31-32).
 *
 * Rules:
 * - Exactly one steer activation per compaction epoch, even for parallel
 *   multi-tool calls (G-010 / AC-005).
 * - Steer is delivered after the current tool batch, before the next LLM
 *   request; `expandPromptTemplates: true` expands `/skill:j-space`.
 * - Failures mark degraded and are never retried in a loop (TDD §18).
 * - v1.0 ordering after compaction: re-anchor first, then promote, then a
 *   resume-style activation (TDD §32).
 */
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import type { RuntimeState } from "../state";
import { buildNormalActivation, buildResumeActivation } from "./activation";
import { persistV4JSpaceState } from "./persistence";

export function queueJSpaceActivation(
	pi: ExtensionAPI,
	runtime: RuntimeState,
): void {
	if (!runtime.config.enabled) return;
	if (!runtime.config.jspace.enabled) return;
	if (!runtime.config.jspace.activateAfterPromotion) return;
	if (!runtime.jspace.available) return;

	const seq = runtime.phase.compactionSeq;
	if (runtime.jspace.activationPending) return;
	if (runtime.jspace.activatedCompactionSeq === seq) return;

	runtime.jspace.activationPending = true;

	const prompt = runtime.jspace.resumeRequired
		? buildResumeActivation()
		: buildNormalActivation();

	try {
		pi.sendUserMessage(prompt, {
			deliverAs: "steer",
			expandPromptTemplates: true,
		});
		runtime.jspace.activatedCompactionSeq = seq;
		runtime.jspace.activationPending = false;
		runtime.jspace.resumeRequired = false;
		runtime.jspace.lastActivationError = undefined;
		persistV4JSpaceState(pi, {
			version: 1,
			compactionSeq: seq,
			event: "activated",
			timestamp: Date.now(),
		});
	} catch (error) {
		runtime.jspace.activationPending = false;
		runtime.jspace.lastActivationError =
			error instanceof Error ? error.message : String(error);
		console.warn(
			`[pi-v4-jspace] J-Space activation failed: ${runtime.jspace.lastActivationError}`,
		);
	}
}

/** Drop a queued activation (model switched away / disabled). */
export function cancelPendingActivation(runtime: RuntimeState): void {
	runtime.jspace.activationPending = false;
}
