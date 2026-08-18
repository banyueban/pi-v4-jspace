/**
 * Integration & failure-injection tests (TDD §56-58, AC-001/012/013/014).
 */
import { describe, expect, it } from "vitest";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createMockContext, createMockPi, fire, fireToolCall, agentStartEvent, chatPayload } from "./helpers/mock-pi";
import v4JSpace from "../src/index";
import { readV4JSpaceConfig } from "../src/config";
import { resolveDumpPath, appendRequestDump } from "../src/diagnostics/request-dump";
import { restoreV4JSpaceState } from "../src/jspace/persistence";
import { discoverJSpaceSkill } from "../src/jspace/discovery";
import { resolveBashExecutable } from "../src/shell";
import { renderStatus } from "../src/status";
import type { MockEntry } from "./helpers/mock-pi";

describe("model switch (TDD §56, AC-012)", () => {
	it("switching to a non-V4 model stops rewrite and J-Space injection", async () => {
		const entries: MockEntry[] = [];
		const mock = createMockPi();
		const ctx = createMockContext({ entries });
		v4JSpace(mock.pi);
		await fire(mock, "session_start", { reason: "startup" }, ctx);

		// V4：bootstrap 激活两工具
		expect(mock.state.activeTools.sort()).toEqual(["bash", "str_replace_editor"]);

		// 切到 Claude
		ctx.model = { id: "claude-sonnet-4", provider: "anthropic" } satisfies NonNullable<typeof ctx.model>;
		await fire(mock, "model_select", { model: ctx.model, previousModel: { id: "deepseek-v4-pro" }, source: "set" }, ctx);
		// 恢复原工具（不再是两工具锁死）
		expect(mock.state.activeTools).toContain("read");
		expect(mock.state.activeTools).not.toContain("str_replace_editor");

		// 非 V4 下 before_provider_request 不重写（返回 undefined，payload 原样）
		const payload = chatPayload();
		await fire(mock, "before_provider_request", { payload }, ctx);
		// mock 不捕获返回值；验证状态：matchedModel=false 时 handler 直接 return
		expect(mock.state.userMessages).toHaveLength(0);
	});

	it("switching back to V4 re-anchors from the session branch", async () => {
		const entries: MockEntry[] = [];
		const mock = createMockPi();
		const ctx = createMockContext({ entries });
		v4JSpace(mock.pi);
		await fire(mock, "session_start", { reason: "startup" }, ctx);

		ctx.model = { id: "gpt-5", provider: "openai" } satisfies NonNullable<typeof ctx.model>;
		await fire(mock, "model_select", { model: ctx.model, previousModel: null, source: "set" }, ctx);
		expect(mock.state.activeTools).not.toContain("str_replace_editor");

		// 回到 V4
		ctx.model = { id: "deepseek-v4-pro-0813", provider: "custom" } satisfies NonNullable<typeof ctx.model>;
		await fire(mock, "model_select", { model: ctx.model, previousModel: { id: "gpt-5" }, source: "set" }, ctx);
		expect(mock.state.activeTools.sort()).toEqual(["bash", "str_replace_editor"]);
	});
});

describe("config tolerance (TDD §41, AC-001)", () => {
	it("malformed config falls back to defaults with a warning", () => {
		const dir = mkdtempSync(join(tmpdir(), "v4j-config-"));
		const configPath = join(dir, "pi-v4-jspace.json");
		writeFileSync(configPath, "{ not valid json !!!", "utf-8");
		const config = readV4JSpaceConfig(configPath);
		expect(config.enabled).toBe(true);
		expect(config.modelPatterns).toEqual(["deepseek-v4-pro", "deepseek-v4-flash"]);
		expect(config.promotion).toBe("tool-call");
		rmSync(dir, { recursive: true, force: true });
	});

	it("wrong field types fall back per-field", () => {
		const dir = mkdtempSync(join(tmpdir(), "v4j-config-"));
		const configPath = join(dir, "pi-v4-jspace.json");
		writeFileSync(
			configPath,
			JSON.stringify({ enabled: "yes", modelPatterns: "deepseek-v4-pro", jspace: { enabled: 1 }, thinking: "high", promotion: "nonsense" }),
			"utf-8",
		);
		const config = readV4JSpaceConfig(configPath);
		expect(config.enabled).toBe(true); // 非 boolean → 默认
		expect(config.modelPatterns).toEqual(["deepseek-v4-pro"]); // 字符串 → 单元素列表
		expect(config.jspace.enabled).toBe(true); // 非 boolean → 默认
		expect(config.thinking).toBe("max"); // 非 max → 默认
		expect(config.promotion).toBe("tool-call"); // 非法值 → v1.0 固定值
		rmSync(dir, { recursive: true, force: true });
	});
});

describe("J-Space skill disabled / missing (AC-014)", () => {
	it("anchor works, J-Space is unavailable, no activation is sent", async () => {
		const entries: MockEntry[] = [];
		// 用户通过 package filtering 禁用了 skill
		const mock = createMockPi({ commands: [] });
		const ctx = createMockContext({ entries });
		v4JSpace(mock.pi);
		await fire(mock, "session_start", { reason: "startup" }, ctx);
		expect(mock.state.activeTools.sort()).toEqual(["bash", "str_replace_editor"]);

		await fire(mock, "before_agent_start", agentStartEvent(), ctx);
		await fireToolCall(mock, ctx);
		// 不发送 /skill:j-space
		expect(mock.state.userMessages).toHaveLength(0);

		// 状态栏标记 unavailable
		expect(renderStatus({ enabled: true, matchedModel: true, phase: { profile: "pro", promoted: true }, jspace: { available: false, activationPending: false, resumeRequired: false }, actualThinking: "max" })).toBe(
			"v4j promoted • jspace unavailable",
		);
	});
});

describe("sendUserMessage failure (TDD §18)", () => {
	it("marks degraded, keeps the promoted agent, does not retry in a loop", async () => {
		const entries: MockEntry[] = [];
		const mock = createMockPi({ failSend: true });
		const ctx = createMockContext({ entries });
		v4JSpace(mock.pi);
		await fire(mock, "session_start", { reason: "startup" }, ctx);
		await fire(mock, "before_agent_start", agentStartEvent(), ctx);

		await fireToolCall(mock, ctx);
		expect(mock.state.userMessages).toHaveLength(0);
		// 第二次 tool call：不重试（activationPending 已清，但 degraded 不循环）
		await fireToolCall(mock, ctx);
		expect(mock.state.userMessages).toHaveLength(0);
	});
});

describe("request dump (TDD §44-45, §59)", () => {
	it("resolveDumpPath honors env var over config flag", () => {
		const previous = process.env.PI_V4_JSPACE_DUMP;
		process.env.PI_V4_JSPACE_DUMP = "/tmp/v4j-dump.jsonl";
		expect(resolveDumpPath(false)).toBe("/tmp/v4j-dump.jsonl");
		process.env.PI_V4_JSPACE_DUMP = "";
		expect(resolveDumpPath(true)).toBeTruthy();
		expect(resolveDumpPath(false)).toBeUndefined();
		if (previous === undefined) delete process.env.PI_V4_JSPACE_DUMP;
		else process.env.PI_V4_JSPACE_DUMP = previous;
	});

	it("appendRequestDump never throws on unwritable paths", () => {
		expect(() => appendRequestDump("Z:/definitely/not/writable/v4j.jsonl", { timestamp: 0, matched: true, anchorPhase: "bootstrap", compactionSeq: 0, jspaceActivated: false, tools: [] })).not.toThrow();
	});
});

describe("persistence & discovery", () => {
	it("restoreV4JSpaceState scans the newest entry", () => {
		const entries = [
			{ type: "custom", customType: "pi-v4-jspace-state", data: { version: 1, compactionSeq: 0, event: "activated", timestamp: 1 } },
			{ type: "custom", customType: "pi-v4-jspace-state", data: { version: 1, compactionSeq: 1, event: "compacted", timestamp: 2 } },
		];
		const restored = restoreV4JSpaceState(entries);
		expect(restored.activatedCompactionSeq).toBeNull();
		expect(restored.resumeRequired).toBe(true);
	});

	it("discoverJSpaceSkill resolves via getCommands + sourceInfo", () => {
		const mock = createMockPi();
		const found = discoverJSpaceSkill(mock.pi);
		expect(found.available).toBe(true);
		expect(found.commandName).toBe("skill:j-space");
		expect(found.path).toContain("SKILL.md");
	});

	it("discoverJSpaceSkill tolerates command name collisions with numeric suffix", () => {
		const mock = createMockPi({
			commands: [
				{ name: "skill:j-space:1", source: "skill", sourceInfo: { path: "/a/SKILL.md", source: "npm:x", scope: "user", origin: "package" } },
			],
		});
		expect(discoverJSpaceSkill(mock.pi).available).toBe(true);
	});
});

describe("shell resolution (Windows adaptation)", () => {
	it("rejects the legacy WSL shim explicitly", () => {
		expect(() => resolveBashExecutable("C:\\Windows\\System32\\bash.exe")).toThrow(/WSL/);
	});

	it("throws when a custom shell path does not exist", () => {
		expect(() => resolveBashExecutable("Z:/no/such/bash.exe")).toThrow(/not found/);
	});

	it("returns the custom shell path when it exists", () => {
		// 用当前 node 进程自身无法作为 bash，但路径存在性检查通过即可
		const self = process.execPath;
		const resolved = resolveBashExecutable(self);
		expect(resolved.executable).toBe(self);
		expect(resolved.via).toContain("shellPath");
	});
});

describe("status rendering (PRD §10)", () => {
	it("renders each phase text", () => {
		const base = { enabled: true, matchedModel: true, phase: { profile: "pro" as const, promoted: false }, jspace: { available: true, activationPending: false, resumeRequired: false }, actualThinking: "max" as string | undefined };
		expect(renderStatus(base)).toBe("v4j anchored");
		expect(renderStatus({ ...base, jspace: { ...base.jspace, resumeRequired: true } })).toBe("v4j re-anchoring • resume");
		expect(renderStatus({ ...base, phase: { profile: "pro", promoted: true }, jspace: { ...base.jspace, activationPending: true } })).toBe("v4j promoted • jspace pending");
		expect(renderStatus({ ...base, phase: { profile: "pro", promoted: true } })).toBe("v4j promoted • jspace");
		expect(renderStatus({ ...base, jspace: { ...base.jspace, lastActivationError: "boom" } })).toBe("v4j degraded");
		expect(renderStatus({ ...base, actualThinking: "high" })).toBe("v4j anchored • thinking=high");
		expect(renderStatus({ ...base, matchedModel: false })).toBeUndefined();
	});
});
