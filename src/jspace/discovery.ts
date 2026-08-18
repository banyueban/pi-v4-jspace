/**
 * J-Space skill discovery (TDD §29-30).
 *
 * Never assume the skill exists: resolve it through `pi.getCommands()` and
 * use `sourceInfo` as provenance instead of guessing from file paths. When
 * the package skill is filtered out by the user, the anchor still works and
 * the manager simply marks J-Space unavailable (AC-014).
 */
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

export const JSPACE_SKILL_COMMAND = "skill:j-space";

export interface JSpaceDiscovery {
	available: boolean;
	/** Exact invokable command name (may carry a numeric suffix on collisions). */
	commandName?: string;
	path?: string;
}

export function discoverJSpaceSkill(pi: ExtensionAPI): JSpaceDiscovery {
	try {
		const commands = pi.getCommands();
		const found = commands.find(
			(command) =>
				command.source === "skill" &&
				(command.name === JSPACE_SKILL_COMMAND ||
					command.name.startsWith(`${JSPACE_SKILL_COMMAND}:`)),
		);
		if (!found) return { available: false };
		return {
			available: true,
			commandName: found.name,
			path: found.sourceInfo.path,
		};
	} catch {
		return { available: false };
	}
}
