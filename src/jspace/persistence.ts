/**
 * J-Space activation state persistence (TDD §10).
 *
 * Custom session entries (`pi.appendEntry`) do not participate in the LLM
 * context but survive reload / resume / fork, letting the extension restore
 * "which compaction epoch already received a J-Space activation" without
 * re-injecting on session restore (AC-011).
 */
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

export const V4JSPACE_STATE_ENTRY = "pi-v4-jspace-state";

export type V4JSpaceStateEvent = "activated" | "compacted" | "manual-reanchor";

export interface V4JSpaceStateEntry {
	version: 1;
	compactionSeq: number;
	event: V4JSpaceStateEvent;
	timestamp: number;
}

export interface RestoredJSpaceState {
	/** compaction epoch that was already activated (from the newest entry). */
	activatedCompactionSeq: number | null;
	resumeRequired: boolean;
}

function isObject(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Persist one state event; failures are logged, never thrown. */
export function persistV4JSpaceState(
	pi: ExtensionAPI,
	entry: V4JSpaceStateEntry,
): void {
	try {
		pi.appendEntry(V4JSPACE_STATE_ENTRY, entry);
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		console.warn(`[pi-v4-jspace] Failed to persist state entry: ${message}`);
	}
}

/**
 * Scan the current session branch for the newest pi-v4-jspace-state entry.
 * Used at session_start (startup / reload / resume / fork) to restore the
 * activation watermark without re-activating J-Space (AC-011).
 */
export function restoreV4JSpaceState(
	entries: readonly { type?: string; customType?: string; data?: unknown }[],
): RestoredJSpaceState {
	let found: V4JSpaceStateEntry | undefined;
	for (const entry of entries) {
		if (
			!entry ||
			entry.type !== "custom" ||
			entry.customType !== V4JSPACE_STATE_ENTRY
		)
			continue;
		if (!isObject(entry.data)) continue;
		if (entry.data.version !== 1) continue;
		const compactionSeq =
			typeof entry.data.compactionSeq === "number" ? entry.data.compactionSeq : -1;
		const event =
			typeof entry.data.event === "string"
				? (entry.data.event as V4JSpaceStateEvent)
				: undefined;
		if (
			event === "activated" ||
			event === "compacted" ||
			event === "manual-reanchor"
		) {
			found = { version: 1, compactionSeq, event, timestamp: 0 };
		}
	}
	if (!found) return { activatedCompactionSeq: null, resumeRequired: false };
	if (found.event === "activated") {
		return { activatedCompactionSeq: found.compactionSeq, resumeRequired: false };
	}
	// compacted / manual-reanchor: the epoch changed and no activation followed.
	return { activatedCompactionSeq: null, resumeRequired: true };
}
