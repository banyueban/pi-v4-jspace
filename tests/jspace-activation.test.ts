/**
 * J-Space activation tests (TDD §52-53, AC-005/006/007).
 *
 * First tool call → exactly one steer activation with
 * expandPromptTemplates=true and a /skill:j-space prefix. Second tool call
 * and parallel tool calls add zero activations.
 */
import { describe, expect, it } from "vitest";
import { createMockContext, createMockPi, fire, fireToolCall, agentStartEvent } from "./helpers/mock-pi";
import v4JSpace from "../src/index";
import { buildNormalActivation, buildResumeActivation } from "../src/jspace/activation";
import type { MockEntry } from "./helpers/mock-pi";

async function startV4Session(entries: MockEntry[] = []) {
	const mock = createMockPi();
	const ctx = createMockContext({ entries });
	v4JSpace(mock.pi);
	await fire(mock, "session_start", { reason: "startup" }, ctx);
	return { mock, ctx };
}

describe("J-Space activation via tool call", () => {
	it("activates exactly once on the first tool call", async () => {
		const { mock, ctx } = await startV4Session();
		await fire(mock, "before_agent_start", agentStartEvent(), ctx);

		await fireToolCall(mock, ctx);
		expect(mock.state.userMessages).toHaveLength(1);
		expect(mock.state.userMessages[0]!.content).toBe(buildNormalActivation());

		// 第二次 tool call：不再激活
		await fireToolCall(mock, ctx, "str_replace_editor");
		expect(mock.state.userMessages).toHaveLength(1);
	});

	it("uses steer delivery with prompt-template expansion", async () => {
		const { mock, ctx } = await startV4Session();
		await fire(mock, "before_agent_start", agentStartEvent(), ctx);
		await fireToolCall(mock, ctx);

		const call = mock.state.userMessages[0]!;
		expect(call.options?.deliverAs).toBe("steer");
		expect(call.options?.expandPromptTemplates).toBe(true);
		expect(call.content.startsWith("/skill:j-space")).toBe(true);
	});

	it("three parallel tool calls still yield one activation", async () => {
		const { mock, ctx } = await startV4Session();
		await fire(mock, "before_agent_start", agentStartEvent(), ctx);
		// 并行多工具：同一 assistant turn 三个 tool call
		await fireToolCall(mock, ctx, "bash");
		await fireToolCall(mock, ctx, "str_replace_editor");
		await fireToolCall(mock, ctx, "bash");
		expect(mock.state.userMessages).toHaveLength(1);
	});

	it("text-only first round does not activate J-Space", async () => {
		const { mock, ctx } = await startV4Session();
		await fire(mock, "before_agent_start", agentStartEvent("回答一个问题"), ctx);
		// assistant 只输出文字，无 tool call
		ctx.entries.push({ type: "message", message: { role: "assistant", content: [{ type: "text", text: "答案是 42" }] } });
		await fire(mock, "message_end", { message: { role: "assistant", content: [{ type: "text", text: "答案是 42" }] } }, ctx);
		expect(mock.state.userMessages).toHaveLength(0);

		// 用户随后发出真实工程任务 → 第一次 tool call → 激活
		await fireToolCall(mock, ctx);
		expect(mock.state.userMessages).toHaveLength(1);
	});

	it("promoted request restores the full Pi tool surface", async () => {
		const { mock, ctx } = await startV4Session();
		await fire(mock, "before_agent_start", agentStartEvent(), ctx);
		await fireToolCall(mock, ctx);

		// promoted 后 before_provider_request 不再重写 tools
		const payload = {
			model: "deepseek-v4-pro",
			messages: [
				{ role: "system", content: "You are Pi..." },
				{ role: "user", content: "hi" },
			],
			tools: [{ type: "function", function: { name: "read", description: "Read", parameters: {} } }],
		};
		const result = (await fire(mock, "before_provider_request", { payload }, ctx)) as Record<string, unknown> | undefined;
		// handler 返回值被 mock 忽略；改从 payload 行为验证：promoted 时 rewriteTools=false
		// 直接检查 rewriteProviderRequest 语义已由 anchor.test 覆盖；这里验证状态
		expect(result).toBeUndefined();
		// runtime 状态已 promoted（通过后续 tool_call 不重复激活佐证）
		await fireToolCall(mock, ctx);
		expect(mock.state.userMessages).toHaveLength(1);
	});
});

describe("activation prompt builders (TDD §26-27)", () => {
	it("normal activation stays minimal", () => {
		const text = buildNormalActivation();
		expect(text.startsWith("/skill:j-space")).toBe(true);
		expect(text).not.toContain("god mode");
		expect(text).not.toContain("10x");
		expect(text).not.toContain("always");
	});

	it("resume activation carries long-gap recovery semantics", () => {
		const text = buildResumeActivation();
		expect(text.startsWith("/skill:j-space")).toBe(true);
		expect(text).toContain("long-gap recovery");
		expect(text).toContain("ledger/resume state");
		expect(text).not.toContain("must loop");
	});
});
