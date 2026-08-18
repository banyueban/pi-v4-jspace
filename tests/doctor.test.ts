/**
 * `/v4j doctor` checks (TDD §13, AC-014).
 */
import { describe, expect, it } from "vitest";
import { createMockContext, createMockPi, fire } from "./helpers/mock-pi";
import v4JSpace from "../src/index";
import { runDoctor, formatDoctor } from "../src/commands/doctor";
import { createRuntimeState, type RuntimeState } from "../src/state";

function createRuntimeStub(): RuntimeState {
	// runDoctor 只读这些字段；直接用真实构造器，避免手工拼桩
	const runtime = createRuntimeState("E:/ai_dev/pi-v4-jspace");
	runtime.actualThinking = "max";
	return runtime;
}

describe("runDoctor", () => {
	it("reports OK for a healthy setup", async () => {
		const mock = createMockPi();
		const ctx = createMockContext({ entries: [] });
		v4JSpace(mock.pi);
		await fire(mock, "session_start", { reason: "startup" }, ctx);

		const runtime = createRuntimeStub();
		runtime.matchedModel = true;
		runtime.actualThinking = "max";
		runtime.jspace.available = true;

		const result = runDoctor(mock.pi, runtime);
		const byLabel = new Map(result.checks.map((check) => [check.label, check]));
		expect(byLabel.get("Package extension loaded")!.ok).toBe(true);
		expect(byLabel.get("DeepSeek V4 model matched")!.ok).toBe(true);
		expect(byLabel.get("Thinking = max")!.ok).toBe(true);
		expect(byLabel.get("J-Space skill command available")!.ok).toBe(true);
		expect(byLabel.get("J-Space SKILL.md exists")!.ok).toBe(true);
		expect(byLabel.get("J-Space modules directory exists")!.ok).toBe(true);
		expect(byLabel.get("Anchor tool definitions loaded")!.ok).toBe(true);
		expect(byLabel.get("Provider rewrite enabled")!.ok).toBe(true);
	});

	it("reports ERROR when the skill command is missing (AC-014)", async () => {
		const mock = createMockPi({ commands: [] });
		const ctx = createMockContext({ entries: [] });
		v4JSpace(mock.pi);
		await fire(mock, "session_start", { reason: "startup" }, ctx);

		const runtime = createRuntimeStub();
		runtime.matchedModel = true;
		runtime.actualThinking = "max";
		runtime.jspace.available = false;

		const result = runDoctor(mock.pi, runtime);
		const skillCheck = result.checks.find((check) => check.label === "J-Space skill command available")!;
		expect(skillCheck.ok).toBe(false);
		expect(formatDoctor(result)).toContain("[ERROR] J-Space skill command available");
	});

	it("warns (not errors) when thinking is not max", async () => {
		const mock = createMockPi();
		const ctx = createMockContext({ entries: [] });
		v4JSpace(mock.pi);
		await fire(mock, "session_start", { reason: "startup" }, ctx);

		const runtime = createRuntimeStub();
		runtime.matchedModel = true;
		runtime.actualThinking = "high";

		const result = runDoctor(mock.pi, runtime);
		const thinkingCheck = result.checks.find((check) => check.label === "Thinking = max")!;
		expect(thinkingCheck.ok).toBe(false);
		expect(thinkingCheck.warn).toBe(true);
	});

	it("non-matched model reports model check but keeps everything else running", async () => {
		const mock = createMockPi();
		const ctx = createMockContext({ model: { id: "claude-sonnet-4", provider: "anthropic" }, entries: [] });
		v4JSpace(mock.pi);
		await fire(mock, "session_start", { reason: "startup" }, ctx);

		const runtime = createRuntimeStub();
		runtime.matchedModel = false;
		runtime.actualThinking = "max";

		const result = runDoctor(mock.pi, runtime);
		expect(result.checks.find((check) => check.label === "DeepSeek V4 model matched")!.ok).toBe(false);
		expect(result.checks.find((check) => check.label === "Package extension loaded")!.ok).toBe(true);
	});
});

describe("formatDoctor", () => {
	it("renders [OK], [WARN], [ERROR] tags", () => {
		const text = formatDoctor({
			checks: [
				{ label: "a", ok: true },
				{ label: "b", ok: true, warn: true, detail: "optional" },
				{ label: "c", ok: false, detail: "missing" },
			],
		});
		expect(text).toContain("[ OK ] a");
		expect(text).toContain("[WARN] b optional");
		expect(text).toContain("[ERROR] c missing");
	});
});
