import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import type { V4JSpaceConfig } from "../config";
import { modelMatchesPatterns, type ModelDescriptor } from "../model";

/**
 * Profile resolution. Only models matching the configured patterns run the
 * anchored-standard adapter; every other model is untouched (G-003).
 */
export type AdapterProfile = "inactive" | "pro";

function contextModel(
	ctx: { model?: ModelDescriptor | null } | Pick<ExtensionContext, "model">,
): ModelDescriptor | undefined {
	if (!("model" in ctx)) return undefined;
	return ctx.model ?? undefined;
}

export function resolveAdapterProfile(
	ctx: { model?: ModelDescriptor | null } | Pick<ExtensionContext, "model">,
	config: V4JSpaceConfig,
): AdapterProfile {
	if (!config.enabled) return "inactive";
	const model = contextModel(ctx);
	if (modelMatchesPatterns(model, config.modelPatterns)) return "pro";
	return "inactive";
}

export function shouldUseAdapter(
	ctx: { model?: ModelDescriptor | null } | Pick<ExtensionContext, "model">,
	config: V4JSpaceConfig,
): boolean {
	return resolveAdapterProfile(ctx, config) !== "inactive";
}
