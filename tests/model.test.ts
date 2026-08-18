/**
 * Model matching tests (TDD §49).
 *
 * Matrix: deepseek-v4-pro / DEEPSEEK-V4-PRO / foo/deepseek-v4-pro-0813 /
 * deepseek-v4-flash / foo-v4-other / claude / gpt.
 */
import { describe, expect, it } from "vitest";
import { modelMatchesPatterns } from "../src/model";
import { DEFAULT_MODEL_PATTERNS } from "../src/config";

describe("modelMatchesPatterns", () => {
	it("matches deepseek-v4-pro by id", () => {
		expect(
			modelMatchesPatterns({ id: "deepseek-v4-pro" }, DEFAULT_MODEL_PATTERNS),
		).toBe(true);
	});

	it("matches case-insensitively", () => {
		expect(
			modelMatchesPatterns({ id: "DEEPSEEK-V4-PRO" }, DEFAULT_MODEL_PATTERNS),
		).toBe(true);
		expect(
			modelMatchesPatterns({ name: "DeepSeek V4 Pro" }, DEFAULT_MODEL_PATTERNS),
		).toBe(true);
	});

	it("matches prefixed ids (provider/model + revision suffix)", () => {
		expect(
			modelMatchesPatterns(
				{ id: "foo/deepseek-v4-pro-0813", provider: "foo" },
				DEFAULT_MODEL_PATTERNS,
			),
		).toBe(true);
		expect(
			modelMatchesPatterns(
				{ id: "deepseek-v4-pro-0813", name: "DeepSeek V4 Pro" },
				DEFAULT_MODEL_PATTERNS,
			),
		).toBe(true);
	});

	it("matches deepseek-v4-flash", () => {
		expect(
			modelMatchesPatterns({ id: "deepseek-v4-flash" }, DEFAULT_MODEL_PATTERNS),
		).toBe(true);
		expect(
			modelMatchesPatterns(
				{ id: "deepseek-v4-flash-latest" },
				DEFAULT_MODEL_PATTERNS,
			),
		).toBe(true);
	});

	it("matches via name when id differs", () => {
		expect(
			modelMatchesPatterns(
				{ id: "some-other-id", name: "deepseek-v4-pro (0813)" },
				DEFAULT_MODEL_PATTERNS,
			),
		).toBe(true);
	});

	it("rejects similar-but-different models", () => {
		expect(
			modelMatchesPatterns({ id: "foo-v4-other" }, DEFAULT_MODEL_PATTERNS),
		).toBe(false);
		expect(
			modelMatchesPatterns({ id: "deepseek-v3" }, DEFAULT_MODEL_PATTERNS),
		).toBe(false);
		expect(
			modelMatchesPatterns({ id: "deepseek-v4" }, DEFAULT_MODEL_PATTERNS),
		).toBe(false);
	});

	it("rejects non-DeepSeek models", () => {
		expect(
			modelMatchesPatterns(
				{ id: "claude-sonnet-4", provider: "anthropic" },
				DEFAULT_MODEL_PATTERNS,
			),
		).toBe(false);
		expect(
			modelMatchesPatterns(
				{ id: "gpt-5", provider: "openai" },
				DEFAULT_MODEL_PATTERNS,
			),
		).toBe(false);
	});

	it("rejects missing model and empty patterns", () => {
		expect(modelMatchesPatterns(null, DEFAULT_MODEL_PATTERNS)).toBe(false);
		expect(modelMatchesPatterns(undefined, DEFAULT_MODEL_PATTERNS)).toBe(false);
		expect(modelMatchesPatterns({ id: "deepseek-v4-pro" }, [])).toBe(false);
	});

	it("matches custom patterns from config", () => {
		expect(
			modelMatchesPatterns({ id: "my-proxy/deepseek-v4-pro" }, [
				"deepseek-v4-pro",
			]),
		).toBe(true);
		expect(
			modelMatchesPatterns({ id: "my-proxy/deepseek-v4-flash" }, [
				"deepseek-v4-flash",
			]),
		).toBe(true);
	});
});
