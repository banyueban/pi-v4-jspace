/**
 * Test doubles for the pi ExtensionAPI surface used by pi-v4-jspace.
 * Kept minimal: only the members the extension actually calls.
 */
import type {
	ExtensionAPI,
	ExtensionContext,
} from "@earendil-works/pi-coding-agent";

export interface MockEntry {
	type: string;
	customType?: string;
	data?: unknown;
	message?: { role: string; content?: unknown };
}

export interface MockToolDef {
	name: string;
	description?: string;
	promptGuidelines?: readonly string[];
}

export interface MockCommand {
	name: string;
	source: string;
	sourceInfo: { path: string; source: string; scope: string; origin: string };
}

export interface MockPiState {
	userMessages: { content: string; options?: Record<string, unknown> }[];
	activeTools: string[];
	tools: MockToolDef[];
	thinkingLevel: string | undefined;
	entries: MockEntry[];
	commands: MockCommand[];
	statusCalls: { key: string; text: string | undefined }[];
}

export interface MockPi {
	pi: ExtensionAPI;
	state: MockPiState;
	handlers: Record<
		string,
		((event: unknown, ctx: ExtensionContext) => Promise<unknown> | unknown)[]
	>;
	failSend: boolean;
}

export function createMockPi(
	overrides: { commands?: MockCommand[]; failSend?: boolean } = {},
): MockPi {
	const state: MockPiState = {
		userMessages: [],
		activeTools: [],
		tools: [],
		thinkingLevel: undefined,
		entries: [],
		commands: overrides.commands ?? [
			{
				name: "skill:j-space",
				source: "skill",
				sourceInfo: {
					path: "E:/ai_dev/pi-v4-jspace/skills/j-space/SKILL.md",
					source: "npm:pi-v4-jspace",
					scope: "user",
					origin: "package",
				},
			},
		],
		statusCalls: [],
	};
	const handlers: MockPi["handlers"] = {};

	const pi = {
		on: (
			event: string,
			handler: (event: unknown, ctx: ExtensionContext) => unknown,
		) => {
			if (!handlers[event]) handlers[event] = [];
			handlers[event].push(handler);
		},
		registerTool: (def: MockToolDef) => {
			const existing = state.tools.findIndex((tool) => tool.name === def.name);
			if (existing >= 0) state.tools[existing] = def;
			else state.tools.push(def);
		},
		registerCommand: () => {},
		getActiveTools: () => [...state.activeTools],
		getAllTools: () => [...state.tools],
		setActiveTools: (names: string[]) => {
			state.activeTools = [...names];
		},
		setThinkingLevel: (level: string) => {
			state.thinkingLevel = level;
		},
		getThinkingLevel: () => state.thinkingLevel ?? "max",
		sendUserMessage: (content: string, options?: Record<string, unknown>) => {
			if (mock.failSend) throw new Error("send failed (mock)");
			state.userMessages.push({ content, options });
		},
		appendEntry: (customType: string, data?: unknown) => {
			state.entries.push({ type: "custom", customType, data });
		},
		getCommands: () => [...state.commands],
	} as unknown as ExtensionAPI;

	const mock: MockPi = {
		pi,
		state,
		handlers,
		failSend: overrides.failSend ?? false,
	};
	return mock;
}

export interface MockContextOptions {
	cwd?: string;
	model?: { id?: string; name?: string; provider?: string } | null;
	entries?: MockEntry[];
	systemPrompt?: string;
	hasUI?: boolean;
}

/** 宽松的 ctx：只包含扩展实际访问的成员，model 用简化形状便于测试切换模型。 */
export interface MockContext {
	cwd: string;
	model: { id?: string; name?: string; provider?: string } | null;
	hasUI: boolean;
	ui: {
		setStatus: (key: string, text: string | undefined) => void;
		notify: () => void;
	};
	sessionManager: {
		getEntries: () => MockEntry[];
		getBranch: () => MockEntry[];
		buildContextEntries: () => MockEntry[];
	};
	entries: MockEntry[];
	getSystemPrompt: () => string;
}

export function createMockContext(
	options: MockContextOptions = {},
): MockContext {
	const entries = options.entries ?? [];
	const ctx: MockContext = {
		entries,
		cwd: options.cwd ?? "E:/ai_dev/pi-v4-jspace",
		model: options.model ?? {
			id: "deepseek-v4-pro-0813",
			name: "DeepSeek V4 Pro",
			provider: "custom",
		},
		hasUI: options.hasUI ?? false,
		ui: {
			setStatus: (_key: string, _text: string | undefined) => {
				// 记录最后一条即可
			},
			notify: () => {},
		},
		sessionManager: {
			getEntries: () => [...entries],
			getBranch: () => [...entries],
			buildContextEntries: () => [...entries],
		},
		getSystemPrompt: () =>
			options.systemPrompt ??
			"You are an expert coding assistant operating inside pi.\n\n<project_context>...</project_context>\n\n<available_skills>...</available_skills>",
	};
	return ctx;
}

export async function fire(
	mock: MockPi,
	event: string,
	eventData: unknown,
	ctx: MockContext,
): Promise<void> {
	for (const handler of mock.handlers[event] ?? []) {
		await handler(eventData, ctx as never);
	}
}

/** 模拟一次真实 tool call：session 里先出现 assistant-with-toolCall，再触发 tool_call 事件。 */
export async function fireToolCall(
	mock: MockPi,
	ctx: MockContext,
	toolName = "bash",
): Promise<void> {
	ctx.entries.push({
		type: "message",
		message: {
			role: "assistant",
			content: [{ type: "toolCall", toolName }],
		},
	});
	await fire(
		mock,
		"tool_call",
		{ toolName, toolCallId: "call_1", input: {} },
		ctx,
	);
}

/** 触发一次 compaction（event + session entry）。 */
export async function fireCompact(
	mock: MockPi,
	ctx: MockContext,
): Promise<void> {
	ctx.entries.push({ type: "compaction" });
	await fire(mock, "session_compact", { reason: "manual" }, ctx);
}

/** 标准 chat-completions 风格 payload。 */
export function chatPayload(
	overrides: Record<string, unknown> = {},
): Record<string, unknown> {
	return {
		model: "deepseek-v4-pro-0813",
		messages: [
			{
				role: "system",
				content:
					"You are Pi, an expert coding assistant with many tools and AGENTS.md context.",
			},
			{ role: "user", content: "hi" },
		],
		tools: [
			{
				type: "function",
				function: {
					name: "read",
					description: "Read a file",
					parameters: { type: "object", properties: {} },
				},
			},
		],
		...overrides,
	};
}

export function chatSystemPromptPayload(): Record<string, unknown> {
	return chatPayload({
		system: "You are Pi, an expert coding assistant with many tools.",
	});
}

/** before_agent_start 事件的最小 systemPromptOptions。 */
export function agentStartEvent(prompt = "重构下载模块，实现断点续传") {
	return {
		prompt,
		systemPrompt:
			"You are an expert coding assistant operating inside pi, a coding agent harness.\n\nAvailable tools:...\n\n<project_context>\nProject-specific instructions\n</project_context>\n\n<available_skills>\n  <skill><name>j-space</name><description>...</description></skill>\n</available_skills>",
		systemPromptOptions: {
			customPrompt: undefined,
			selectedTools: ["read", "bash", "edit", "write", "grep"],
			toolSnippets: {
				read: "Read file contents",
				bash: "Execute bash commands",
				edit: "Edit files",
				write: "Write files",
				grep: "Search",
			},
			promptGuidelines: ["Use read to examine files instead of cat or sed."],
			appendSystemPrompt: undefined,
			cwd: "E:/ai_dev/pi-v4-jspace",
			contextFiles: [
				{
					path: "E:/ai_dev/pi-v4-jspace/AGENTS.md",
					content: "project instructions",
				},
			],
			skills: [
				{
					name: "j-space",
					description: "Inner workspace cognition suite",
					filePath: "E:/ai_dev/pi-v4-jspace/skills/j-space/SKILL.md",
				},
			],
		},
	};
}
