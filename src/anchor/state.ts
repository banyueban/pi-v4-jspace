import type { PersistentBashSession } from "./tools/bash-session";
import type { V4JSpaceConfig } from "../config";
import type { AdapterProfile } from "./profile";
import type { PromptResources } from "./prompt";

export type ToolSurface = "off" | "bootstrap" | "promoted";

export interface SessionPhase {
	profile: AdapterProfile;
	promoted: boolean;
	compactionSeq: number;
	firstUserText?: string;
	userRounds: number;
	hasAssistant: boolean;
	hasTool: boolean;
}

export function emptySessionPhase(): SessionPhase {
	return {
		profile: "inactive",
		promoted: false,
		compactionSeq: -1,
		userRounds: 0,
		hasAssistant: false,
		hasTool: false,
	};
}

export interface AdapterState {
	enabled: boolean;
	cwd: string;
	previousToolNames?: string[];
	config: V4JSpaceConfig;
	shell: PersistentBashSession;
	bashOverrideInstalled: boolean;
	surface: ToolSurface;
	phase: SessionPhase;
	promptResources: PromptResources;
}
