/**
 * Session resume tests (TDD §55, AC-011).
 *
 * A session that already activated J-Space (persisted entry) must not
 * re-activate on resume — until a new compaction epoch appears.
 */
import { describe, expect, it } from "vitest";
import {
	createMockContext,
	createMockPi,
	fire,
	fireToolCall,
	agentStartEvent,
} from "./helpers/mock-pi";
import v4JSpace from "../src/index";
import type { MockEntry } from "./helpers/mock-pi";

/** 构造一个"已激活于 epoch 0"的历史 session（含 compaction + activated 状态条目）。 */
function resumedSessionEntries(): MockEntry[] {
	return [
		{ type: "message", message: { role: "user", content: "old task" } },
		{
			type: "message",
			message: {
				role: "assistant",
				content: [{ type: "toolCall", toolName: "bash" }],
			},
		},
		{ type: "compaction" },
		{ type: "message", message: { role: "user", content: "continue old task" } },
		{
			type: "message",
			message: {
				role: "assistant",
				content: [{ type: "toolCall", toolName: "bash" }],
			},
		},
		{
			type: "custom",
			customType: "pi-v4-jspace-state",
			data: { version: 1, compactionSeq: 1, event: "activated", timestamp: 123 },
		},
	];
}

describe("session resume", () => {
	it("does not re-activate J-Space on resume of an already-activated epoch", async () => {
		const entries = resumedSessionEntries();
		const mock = createMockPi();
		const ctx = createMockContext({ entries });
		v4JSpace(mock.pi);

		// resume 一个已有 tool call 的 session：scanSessionPhase 恢复 promoted
		await fire(
			mock,
			"session_start",
			{ reason: "resume", previousSessionFile: "x.jsonl" },
			ctx,
		);
		expect(mock.state.userMessages).toHaveLength(0);

		// 后续 tool call 也不会触发（epoch 未变）
		await fire(mock, "before_agent_start", agentStartEvent("继续"), ctx);
		await fireToolCall(mock, ctx);
		expect(mock.state.userMessages).toHaveLength(0);
	});

	it("restored compaction epoch blocks activation until a new epoch", async () => {
		const entries = resumedSessionEntries();
		const mock = createMockPi();
		const ctx = createMockContext({ entries });
		v4JSpace(mock.pi);
		await fire(mock, "session_start", { reason: "resume" }, ctx);

		// fork / reload 同样不重复激活
		const mock2 = createMockPi();
		const ctx2 = createMockContext({ entries });
		v4JSpace(mock2.pi);
		await fire(
			mock2,
			"session_start",
			{ reason: "fork", previousSessionFile: "y.jsonl" },
			ctx2,
		);
		expect(mock2.state.userMessages).toHaveLength(0);
	});

	it("fresh session without persisted state activates on first tool call", async () => {
		const entries: MockEntry[] = [
			{ type: "message", message: { role: "user", content: "fresh task" } },
		];
		const mock = createMockPi();
		const ctx = createMockContext({ entries });
		v4JSpace(mock.pi);
		await fire(mock, "session_start", { reason: "startup" }, ctx);
		await fire(mock, "before_agent_start", agentStartEvent("fresh task"), ctx);
		await fireToolCall(mock, ctx);
		expect(mock.state.userMessages).toHaveLength(1);
	});
});
