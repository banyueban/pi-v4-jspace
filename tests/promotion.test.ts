/**
 * Promotion tests (TDD §51, AC-004).
 *
 * Session start → not promoted. Assistant text only → still not promoted
 * (v1.0 promotion is fixed to tool-call). First tool call → promoted.
 */
import { describe, expect, it } from "vitest";
import { isPromoted, scanSessionPhase } from "../src/anchor/promotion";
import type { SessionEntry } from "@earendil-works/pi-coding-agent";

function entry(type: string, message?: { role: string; content?: unknown }): SessionEntry {
	if (type === "compaction") return { type: "compaction" } as SessionEntry;
	return { type: "message", message } as SessionEntry;
}

describe("isPromoted with tool-call policy (v1.0 fixed)", () => {
	it("requires a tool call", () => {
		expect(isPromoted({ hasAssistant: true, hasTool: false }, "tool-call")).toBe(false);
		expect(isPromoted({ hasAssistant: true, hasTool: true }, "tool-call")).toBe(true);
	});
});

describe("scanSessionPhase", () => {
	it("empty session is not promoted", () => {
		const scan = scanSessionPhase([], "tool-call");
		expect(scan.promoted).toBe(false);
		expect(scan.compactionSeq).toBe(-1);
	});

	it("user + assistant text does not promote (text-only first round)", () => {
		const entries = [
			entry("message", { role: "user", content: "hello" }),
			entry("message", { role: "assistant", content: [{ type: "text", text: "hi there" }] }),
		];
		const scan = scanSessionPhase(entries, "tool-call");
		expect(scan.promoted).toBe(false);
		expect(scan.hasAssistant).toBe(true);
		expect(scan.hasTool).toBe(false);
		expect(scan.userRounds).toBe(1);
		expect(scan.firstUserText).toBe("hello");
	});

	it("assistant tool call promotes", () => {
		const entries = [
			entry("message", { role: "user", content: "do the work" }),
			entry("message", {
				role: "assistant",
				content: [{ type: "toolCall", toolName: "bash", toolCallId: "c1" }],
			}),
		];
		const scan = scanSessionPhase(entries, "tool-call");
		expect(scan.promoted).toBe(true);
		expect(scan.hasTool).toBe(true);
	});

	it("toolResult alone promotes (restored sessions)", () => {
		const entries = [
			entry("message", { role: "user", content: "run it" }),
			entry("message", { role: "toolResult", content: "done" }),
		];
		expect(scanSessionPhase(entries, "tool-call").promoted).toBe(true);
	});

	it("compaction resets the epoch and phase", () => {
		const entries = [
			entry("message", { role: "user", content: "first task" }),
			entry("message", { role: "assistant", content: [{ type: "toolCall", toolName: "bash" }] }),
			entry("compaction"),
			entry("message", { role: "user", content: "continue" }),
		];
		const scan = scanSessionPhase(entries, "tool-call");
		expect(scan.compactionSeq).toBe(2);
		expect(scan.promoted).toBe(false);
		expect(scan.hasTool).toBe(false);
		expect(scan.hasAssistant).toBe(false);
		expect(scan.firstUserText).toBe("continue");
	});

	it("multiple compactions advance the sequence", () => {
		const entries = [
			entry("compaction"),
			entry("message", { role: "user", content: "a" }),
			entry("compaction"),
			entry("message", { role: "user", content: "b" }),
		];
		expect(scanSessionPhase(entries, "tool-call").compactionSeq).toBe(2);
	});
});
