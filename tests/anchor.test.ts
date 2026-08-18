/**
 * Anchor / payload-rewrite tests (TDD §50, §45, AC-002/003).
 */
import { describe, expect, it } from "vitest";
import {
	extractRequestSurface,
	isNonAgentProviderPayload,
	rewriteProviderRequest,
} from "../src/anchor/payload-rewrite";
import {
	DSH_MINIMAL_TOOLS,
	MINIMAL_BASH_DESCRIPTION,
	MINIMAL_PROMPT,
	STR_REPLACE_EDITOR_DESCRIPTION,
} from "../src/anchor/dsh/official";
import { composeAnchoredPrompt, isAnchoredSystemPrompt, reanchorPersona } from "../src/anchor/prompt";
import { chatPayload } from "./helpers/mock-pi";

describe("bootstrap provider rewrite (chat-completions shape)", () => {
	it("replaces system message with the exact official minimal persona", () => {
		const payload = chatPayload();
		const rewritten = rewriteProviderRequest(payload, { persona: MINIMAL_PROMPT, rewriteTools: true });
		const surface = extractRequestSurface(rewritten);
		expect(surface.system).toBe(MINIMAL_PROMPT);
	});

	it("exposes exactly bash + str_replace_editor with official schemas", () => {
		const rewritten = rewriteProviderRequest(chatPayload(), { persona: MINIMAL_PROMPT, rewriteTools: true });
		const surface = extractRequestSurface(rewritten);
		expect(surface.toolNames).toEqual(["bash", "str_replace_editor"]);

		const tools = surface.tools as { type: string; function: { name: string; description: string; parameters: unknown } }[];
		expect(tools).toHaveLength(2);
		expect(tools[0]!.function.name).toBe("bash");
		expect(tools[0]!.function.description).toBe(MINIMAL_BASH_DESCRIPTION);
		expect(tools[1]!.function.name).toBe("str_replace_editor");
		expect(tools[1]!.function.description).toBe(STR_REPLACE_EDITOR_DESCRIPTION);
	});

	it("keeps schemas identical to the vendored DSH definitions", () => {
		const rewritten = rewriteProviderRequest(chatPayload(), { persona: MINIMAL_PROMPT, rewriteTools: true });
		const surface = extractRequestSurface(rewritten);
		const tools = surface.tools as { function: { parameters: unknown } }[];
		expect(tools[0]!.function.parameters).toEqual(DSH_MINIMAL_TOOLS[0]!.parameters);
		expect(tools[1]!.function.parameters).toEqual(DSH_MINIMAL_TOOLS[1]!.parameters);
	});

	it("does not leak Pi identity, skills, or AGENTS content into request #1", () => {
		const rewritten = rewriteProviderRequest(chatPayload(), { persona: MINIMAL_PROMPT, rewriteTools: true });
		const surface = extractRequestSurface(rewritten);
		expect(surface.system).not.toContain("available_skills");
		expect(surface.system).not.toContain("<available_skills>");
		expect(surface.system).not.toContain("AGENTS.md");
		expect(surface.system).not.toContain("coding agent harness");
		expect(surface.system).not.toContain("j-space");
	});
});

describe("bootstrap provider rewrite (anthropic shape)", () => {
	it("rewrites anthropic system/tools shape", () => {
		const payload = {
			model: "deepseek-v4-pro",
			system: "You are Pi with tools.",
			messages: [{ role: "user", content: "hi" }],
			tools: [{ name: "read", description: "Read", input_schema: { type: "object", properties: {} } }],
		};
		const rewritten = rewriteProviderRequest(payload, { persona: MINIMAL_PROMPT, rewriteTools: true });
		const surface = extractRequestSurface(rewritten);
		expect(surface.system).toBe(MINIMAL_PROMPT);
		expect(surface.toolNames).toEqual(["bash", "str_replace_editor"]);
		const tools = surface.tools as { name: string; input_schema: unknown }[];
		expect(tools[0]!.name).toBe("bash");
		expect("input_schema" in tools[0]!).toBe(true);
	});
});

describe("rewriteTools=false keeps the tool list (promoted)", () => {
	it("keeps the original tools untouched", () => {
		const payload = chatPayload();
		const rewritten = rewriteProviderRequest(payload, {
			persona: "You are a helpful software engineer assistant.\n\nPi tools guide...",
			rewriteTools: false,
		});
		const surface = extractRequestSurface(rewritten);
		expect(surface.toolNames).toEqual(["read"]);
		expect(surface.system).toContain(MINIMAL_PROMPT);
	});
});

describe("fail-safe behavior (TDD §58)", () => {
	it("returns the payload unchanged when it is not an object", () => {
		expect(rewriteProviderRequest(null, { persona: MINIMAL_PROMPT, rewriteTools: true })).toBeNull();
		expect(rewriteProviderRequest("nope", { persona: MINIMAL_PROMPT, rewriteTools: true })).toBe("nope");
		expect(rewriteProviderRequest(undefined, { persona: MINIMAL_PROMPT, rewriteTools: true })).toBeUndefined();
	});

	it("does not rewrite summarization / compaction payloads", () => {
		const payload = chatPayload({
			system: "You are a context summarization assistant.",
			messages: [
				{ role: "system", content: "You are a context summarization assistant." },
				{ role: "user", content: "<conversation>...</conversation>" },
			],
		});
		expect(isNonAgentProviderPayload(payload)).toBe(true);
		const rewritten = rewriteProviderRequest(payload, { persona: MINIMAL_PROMPT, rewriteTools: true });
		expect(rewritten).toBe(payload);
	});

	it("extractRequestSurface tolerates unknown payloads", () => {
		expect(extractRequestSurface(undefined).toolNames).toEqual([]);
		expect(extractRequestSurface("x").tools).toBeUndefined();
		expect(extractRequestSurface({}).toolNames).toEqual([]);
	});
});

describe("prompt composition (TDD §36)", () => {
	it("bootstrap prompt is exactly the official one-liner", () => {
		expect(composeAnchoredPrompt()).toBe(MINIMAL_PROMPT);
		expect(composeAnchoredPrompt({ includeWorkspace: false })).toBe(MINIMAL_PROMPT);
	});

	it("promoted prompt keeps the official persona as first sentence", () => {
		const prompt = composeAnchoredPrompt({
			includeWorkspace: true,
			assembledPrompt:
				"You are an expert coding assistant operating inside pi, a coding agent harness. You help users by reading files, executing commands, editing code, and writing new files.",
			selectedTools: ["read", "bash", "edit", "write", "grep"],
			toolSnippets: { read: "Read file contents", bash: "Execute bash commands", edit: "Edit files", write: "Write files", grep: "Search" },
			promptGuidelines: ["Use read to examine files instead of cat or sed."],
			contextFiles: [{ path: "/proj/AGENTS.md", content: "project rules" }],
			skills: [{ name: "j-space", description: "Cognition suite", filePath: "/skills/j-space/SKILL.md" }],
			cwd: "/proj",
		});
		expect(prompt.startsWith(MINIMAL_PROMPT)).toBe(true);
		expect(prompt).toContain("Available tools:");
		expect(prompt).toContain("<project_context>");
		expect(prompt).toContain("<available_skills>");
		expect(prompt).toContain("j-space");
		expect(prompt).toContain("Current working directory: /proj");
		// Pi identity paragraph must be dropped
		expect(prompt).not.toContain("operating inside pi, a coding agent harness");
	});

	it("reanchorPersona prepends official persona and strips Pi identity", () => {
		const reanchored = reanchorPersona(
			"You are an expert coding assistant operating inside pi, a coding agent harness. You help users by reading files, executing commands, editing code, and writing new files. Hello world.",
		);
		expect(reanchored).toBe(`${MINIMAL_PROMPT} Hello world.`);
		expect(isAnchoredSystemPrompt(reanchored)).toBe(true);
	});
});
