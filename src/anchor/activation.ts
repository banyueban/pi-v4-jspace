import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { createBashToolDefinition } from "@earendil-works/pi-coding-agent";
import { resolveAdapterProfile, type AdapterProfile } from "./profile";
import type { RuntimeState } from "../state";
import type { ToolSurface } from "./state";
import {
	ADAPTER_TOOL_NAMES,
	BASH_TOOL_NAME,
	DEFAULT_TOOL_NAMES,
	restoreTools,
	stripOwnedTools,
} from "./tool-set";
import { MINIMAL_BASH_DESCRIPTION } from "./dsh/official";
import { registerDshBashTool } from "./tools/bash";
import { applyStatus } from "../status";

export function desiredSurface(profile: AdapterProfile, promoted: boolean): ToolSurface {
	if (profile === "inactive") return "off";
	return promoted ? "promoted" : "bootstrap";
}

export function syncAdapter(pi: ExtensionAPI, ctx: ExtensionContext, state: RuntimeState): void {
	const profile = resolveAdapterProfile(ctx, state.config);
	state.phase.profile = profile;
	const nextSurface = desiredSurface(profile, state.phase.promoted);
	applySurface(pi, ctx, state, nextSurface);
}

function applySurface(pi: ExtensionAPI, ctx: ExtensionContext, state: RuntimeState, surface: ToolSurface): void {
	if (surface === state.surface) {
		if (surface === "off") deactivateOwnedTools(pi);
		setStatus(ctx, state);
		return;
	}

	if (surface === "bootstrap") {
		enterBootstrap(pi, state);
	} else if (state.surface === "bootstrap") {
		leaveBootstrap(pi, state);
	}

	if (surface === "off") deactivateOwnedTools(pi);

	state.surface = surface;
	state.enabled = surface !== "off";
	setStatus(ctx, state);
}

function enterBootstrap(pi: ExtensionAPI, state: RuntimeState): void {
	if (state.surface !== "bootstrap") {
		state.previousToolNames = stripOwnedTools(pi.getActiveTools());
	}
	if (!state.bashOverrideInstalled) {
		registerDshBashTool(pi, state);
		state.bashOverrideInstalled = true;
	}
	pi.setActiveTools([...ADAPTER_TOOL_NAMES]);
}

function leaveBootstrap(pi: ExtensionAPI, state: RuntimeState): void {
	if (state.bashOverrideInstalled) {
		if (bashStillOurs(pi)) restorePiBash(pi, state.cwd);
		state.bashOverrideInstalled = false;
	}
	const previousToolNames =
		state.previousToolNames && state.previousToolNames.length > 0 ? state.previousToolNames : DEFAULT_TOOL_NAMES;
	pi.setActiveTools(restoreTools(previousToolNames, pi.getActiveTools()));
}

function deactivateOwnedTools(pi: ExtensionAPI): void {
	const active = pi.getActiveTools();
	const next = stripOwnedTools(active);
	if (next.length !== active.length) pi.setActiveTools(next);
}

function bashStillOurs(pi: ExtensionAPI): boolean {
	const bash = pi.getAllTools().find((tool) => tool.name === BASH_TOOL_NAME);
	return !bash || bash.description === MINIMAL_BASH_DESCRIPTION;
}

function restorePiBash(pi: ExtensionAPI, cwd: string): void {
	const builtin = createBashToolDefinition(cwd);
	pi.registerTool({
		name: builtin.name,
		label: builtin.label,
		description: builtin.description,
		parameters: builtin.parameters,
		promptSnippet: builtin.promptSnippet,
		promptGuidelines: builtin.promptGuidelines,
		constrainedSampling: builtin.constrainedSampling,
		renderShell: builtin.renderShell,
		prepareArguments: builtin.prepareArguments,
		executionMode: builtin.executionMode,
		execute: builtin.execute,
		renderCall: builtin.renderCall,
		renderResult: builtin.renderResult,
	});
}

function setStatus(ctx: ExtensionContext, state: RuntimeState): void {
	applyStatus(ctx, state);
}

export function rememberPreviousTools(pi: ExtensionAPI, state: RuntimeState): void {
	if (!state.previousToolNames || state.previousToolNames.length === 0) {
		state.previousToolNames = stripOwnedTools(pi.getActiveTools());
	}
}
