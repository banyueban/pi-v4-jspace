/**
 * Runtime state for pi-v4-jspace.
 *
 * `RuntimeState` composes the ported adapter state (`AdapterState`) with the
 * J-Space activation state and model-match bookkeeping.
 */
import type { AdapterState } from "./anchor/state";
import { createPersistentBashSession } from "./anchor/tools/bash-session";
import { emptyPromptResources } from "./anchor/prompt";
import { emptySessionPhase } from "./anchor/state";
import { cloneConfig, readV4JSpaceConfig } from "./config";

export interface JSpaceState {
	/** Whether the `j-space` skill command was discovered via pi.getCommands(). */
	available: boolean;
	/** A steer activation is queued but not yet delivered. */
	activationPending: boolean;
	/** Compaction epoch that already received a J-Space activation (null = none). */
	activatedCompactionSeq: number | null;
	/** Next activation must use long-gap recovery semantics. */
	resumeRequired: boolean;
	/** Last activation failure (present => degraded, do not retry). */
	lastActivationError?: string;
}

export interface RuntimeState extends AdapterState {
	/** Model matched DeepSeek V4 patterns (G-002). */
	matchedModel: boolean;
	desiredThinking: "max";
	/** Last observed thinking level (pi.getThinkingLevel()); may lag until a session starts. */
	actualThinking?: string;
	jspace: JSpaceState;
}

export function createRuntimeState(cwd: string): RuntimeState {
	return {
		enabled: false,
		cwd,
		config: readV4JSpaceConfig(),
		shell: createPersistentBashSession(cwd),
		bashOverrideInstalled: false,
		surface: "off",
		phase: emptySessionPhase(),
		promptResources: emptyPromptResources(),
		matchedModel: false,
		desiredThinking: "max",
		jspace: {
			available: false,
			activationPending: false,
			activatedCompactionSeq: null,
			resumeRequired: false,
		},
	};
}

export function cloneJSpaceState(state: JSpaceState): JSpaceState {
	return { ...state };
}

export { cloneConfig };
