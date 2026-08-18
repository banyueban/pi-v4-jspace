/**
 * Compaction epoch tests (TDD §54, G-011/012, AC-009/010).
 *
 * bootstrap → tool → promoted → activated(epoch 0)
 * → compact → bootstrap → tool → promoted → activated again (resume, epoch 1)
 * Total activations: 2. The second uses the long-gap recovery prompt.
 */
import { describe, expect, it } from "vitest";
import {
	createMockContext,
	createMockPi,
	fire,
	fireToolCall,
	fireCompact,
	agentStartEvent,
} from "./helpers/mock-pi";
import v4JSpace from "../src/index";
import { buildResumeActivation } from "../src/jspace/activation";
import type { MockEntry } from "./helpers/mock-pi";

describe("compaction re-anchor cycle", () => {
	it("activates once per epoch with resume semantics after compaction", async () => {
		const entries: MockEntry[] = [];
		const mock = createMockPi();
		const ctx = createMockContext({ entries });
		v4JSpace(mock.pi);
		await fire(mock, "session_start", { reason: "startup" }, ctx);
		await fire(mock, "before_agent_start", agentStartEvent(), ctx);

		// Epoch 0: first activation (normal)
		await fireToolCall(mock, ctx);
		expect(mock.state.userMessages).toHaveLength(1);
		expect(mock.state.userMessages[0]!.content).not.toContain("long-gap");

		// 同一 epoch 内不再激活
		await fireToolCall(mock, ctx, "bash");
		expect(mock.state.userMessages).toHaveLength(1);

		// Compaction → 新 epoch
		await fireCompact(mock, ctx);

		// Epoch 1: 重新 minimal → tool call → promoted → resume activation
		await fire(mock, "before_agent_start", agentStartEvent("继续任务"), ctx);
		await fireToolCall(mock, ctx);
		expect(mock.state.userMessages).toHaveLength(2);
		expect(mock.state.userMessages[1]!.content).toBe(buildResumeActivation());
		expect(mock.state.userMessages[1]!.content).toContain("long-gap recovery");

		// epoch 1 内第二次 tool call 不再激活
		await fireToolCall(mock, ctx);
		expect(mock.state.userMessages).toHaveLength(2);
	});

	it("persists activated + compacted state entries", async () => {
		const entries: MockEntry[] = [];
		const mock = createMockPi();
		const ctx = createMockContext({ entries });
		v4JSpace(mock.pi);
		await fire(mock, "session_start", { reason: "startup" }, ctx);
		await fire(mock, "before_agent_start", agentStartEvent(), ctx);

		await fireToolCall(mock, ctx);
		const stateEntries = mock.state.entries.filter(
			(e) => e.customType === "pi-v4-jspace-state",
		);
		expect(stateEntries).toHaveLength(1);
		expect(stateEntries[0]!.data).toMatchObject({
			event: "activated",
			version: 1,
			compactionSeq: -1,
		});

		await fireCompact(mock, ctx);
		const afterCompact = mock.state.entries.filter(
			(e) => e.customType === "pi-v4-jspace-state",
		);
		expect(afterCompact).toHaveLength(2);
		expect(afterCompact[1]!.data).toMatchObject({ event: "compacted" });
	});
});
