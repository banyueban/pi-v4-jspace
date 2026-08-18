/**
 * Status line rendering (TDD §10 / §46).
 *
 * All UI failure is silent: a broken status bar must never crash the host.
 */
import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import type { RuntimeState } from "./state";

export const STATUS_KEY = "v4j";

export function renderStatus(runtime: {
	enabled: boolean;
	matchedModel: boolean;
	phase: { profile: "inactive" | "pro"; promoted: boolean };
	jspace: {
		available: boolean;
		activationPending: boolean;
		resumeRequired: boolean;
		lastActivationError?: string;
	};
	actualThinking?: string;
}): string | undefined {
	if (!runtime.enabled || !runtime.matchedModel) return undefined;
	if (runtime.phase.profile === "inactive") return undefined;

	const base = statusBase(runtime);
	if (runtime.actualThinking && runtime.actualThinking !== "max") {
		return `${base} • thinking=${runtime.actualThinking}`;
	}
	return base;
}

function statusBase(runtime: {
	phase: { profile: "inactive" | "pro"; promoted: boolean };
	jspace: {
		available: boolean;
		activationPending: boolean;
		resumeRequired: boolean;
		lastActivationError?: string;
	};
}): string {
	const degraded = runtime.jspace.lastActivationError !== undefined;
	if (degraded) return "v4j degraded";

	if (!runtime.phase.promoted) {
		return runtime.jspace.resumeRequired
			? "v4j re-anchoring • resume"
			: "v4j anchored";
	}

	if (!runtime.jspace.available) {
		return "v4j promoted • jspace unavailable";
	}

	if (runtime.jspace.activationPending) {
		return "v4j promoted • jspace pending";
	}

	return "v4j promoted • jspace";
}

export function applyStatus(
	ctx: ExtensionContext,
	runtime: RuntimeState,
): void {
	try {
		if (!ctx.hasUI) return;
		if (!runtime.config.statusLine) {
			ctx.ui.setStatus(STATUS_KEY, undefined);
			return;
		}
		ctx.ui.setStatus(STATUS_KEY, renderStatus(runtime));
	} catch {
		// 状态栏失败静默忽略（TDD §18）
	}
}
