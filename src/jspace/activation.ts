/**
 * J-Space activation prompts (TDD §26-27).
 *
 * Normal activation stays minimal — no persona fluff, no "always loop"
 * instructions. Resume activation only tells J-Space a long gap happened;
 * J-Space itself decides whether the task needs its ledger/resume protocol.
 */
export function buildNormalActivation(): string {
	return [
		"/skill:j-space Continue the current task from the existing conversation state.",
		"Do not restart work that is already complete.",
	].join("\n");
}

export function buildResumeActivation(): string {
	return [
		"/skill:j-space Continue the current task after a long-gap recovery.",
		"If this task is using J-Space loop state, restore its existing ledger/resume state",
		"before continuing further task work.",
		"Do not restart completed work.",
	].join("\n");
}
