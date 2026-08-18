# pi-v4-jspace v1.0 技术设计文档（TDD）

**文档版本：** 1.0  
**对应 PRD：** `pi-v4-jspace v1.0 产品需求文档`  
**目标：** 开发者不需要预先了解 Pi Extension、`pi-dsh-minimal` 或 J-Space，即可依据本文实现完整插件。

---

# 1. 架构决策

v1.0 采用：

> **单 Pi Package + 内置 Anchor Engine + Bundled J-Space Skill**

而不是：

```text
pi-v4-jspace
+
外部 pi-dsh-minimal
+
外部 J-Space
```

最终依赖关系：

```text
                  pi-v4-jspace
                       │
          ┌────────────┴────────────┐
          │                         │
          ▼                         ▼
    Anchor Engine             J-Space Skill
          │                         │
    port/vendor from           exact upstream
    pi-dsh-minimal            V3.6 snapshot
          │                         │
          └────────────┬────────────┘
                       │
                       ▼
                  Pi Runtime
```

原因：

1. 避免两个 Extension 的 hook 注册顺序问题；
2. 可以精确控制 Promote 和 J-Space activation 的先后；
3. 用户只安装一个 Package；
4. 可以统一管理 Compaction Epoch；
5. 可以写完整 integration test。

Pi Package 官方支持同一个包声明 Extension 和 Skill。

---

# 2. 依赖处理原则

## 2.1 pi-dsh-minimal

不要把 `pi-dsh-minimal` 当 runtime npm dependency。

优先方式：

```text
复制/移植经过验证的 Anchor 核心实现
→ src/anchor/
```

必须保持语义一致。

重点上游源码目录：

```text
src/adapter/
  activation.ts
  config.ts
  model.ts
  payload-rewrite.ts
  profile.ts
  promotion.ts
  prompt.ts
  state.ts
  tool-set.ts

src/dsh/
  official.ts

src/tools/
  bash-session.ts
  bash.ts
  str-replace-editor.ts
```

这些目录和文件目前确实构成 `pi-dsh-minimal` Anchor 实现主体。

---

# 3. 为什么必须移植 Provider Rewrite

错误实现：

```ts
pi.setActiveTools(["bash", "edit"]);
```

或者：

```ts
return {
    systemPrompt: "You are a helpful software engineer assistant."
};
```

不够。

真正的 `pi-dsh-minimal` 会在：

```text
before_provider_request
```

读取 provider 已组装完成的最终 payload，然后执行：

```text
extractRequestSurface()
rewriteProviderRequest()
```

使真正发送给模型的：

```text
system
tools
```

符合 Minimal surface。

Pi 官方说明 `before_provider_request` 就发生在 provider-specific payload 已构建完成之后、真正发请求之前，并允许 handler 替换整个 payload。

因此 Anchor Engine 必须保留这一层。

---

# 4. J-Space 依赖方式

将 upstream：

```text
J-Space-Cognition-Suite-V3.6/j-space/
```

完整复制到：

```text
skills/j-space/
```

禁止修改里面的：

```text
SKILL.md
modules/*
references/*
scripts/*
```

原因：

J-Space 目前仍有快速迭代，甚至已有公开 issue 指出 controller 中复制的 premise/invariants 与 `SKILL.md` 存在 drift，因此 `pi-v4-jspace` 不应该制造第三份协议副本。

我们的插件必须：

```text
依赖协议
而不是复制协议内容到 TS 常量
```

---

# 5. Vendoring 元数据

建立：

```text
vendor-meta/j-space.json
```

示例：

```json
{
  "name": "J-Space-Cognition-Suite",
  "version": "3.6",
  "repository": "https://github.com/Tiger3807861189/J-Space-Cognition-Suite-V3.6",
  "commit": "<vendoring时实际git rev-parse HEAD>",
  "license": "Apache-2.0",
  "vendoredAt": "YYYY-MM-DD"
}
```

建立：

```text
vendor-meta/pi-dsh-minimal.json
```

示例：

```json
{
  "name": "pi-dsh-minimal",
  "repository": "https://github.com/Averyyy/pi-dsh-minimal",
  "commit": "<移植时实际git rev-parse HEAD>",
  "license": "MIT",
  "purpose": "DeepSeek V4 anchored-standard adapter baseline"
}
```

**禁止写一个猜测的 commit hash。**

开发时必须实际获取并记录。

---

# 6. 推荐项目结构

```text
pi-v4-jspace/
├── package.json
├── tsconfig.json
├── LICENSE
├── THIRD_PARTY_NOTICES.md
├── README.md
├── README.zh-CN.md
│
├── src/
│   ├── index.ts
│   ├── config.ts
│   ├── state.ts
│   ├── model.ts
│   ├── status.ts
│   │
│   ├── anchor/
│   │   ├── activation.ts
│   │   ├── payload-rewrite.ts
│   │   ├── promotion.ts
│   │   ├── prompt.ts
│   │   ├── state.ts
│   │   ├── tool-set.ts
│   │   │
│   │   ├── dsh/
│   │   │   └── official.ts
│   │   │
│   │   └── tools/
│   │       ├── bash-session.ts
│   │       ├── bash.ts
│   │       └── str-replace-editor.ts
│   │
│   ├── jspace/
│   │   ├── manager.ts
│   │   ├── activation.ts
│   │   ├── discovery.ts
│   │   └── persistence.ts
│   │
│   ├── commands/
│   │   ├── command.ts
│   │   ├── doctor.ts
│   │   └── dump.ts
│   │
│   └── diagnostics/
│       └── request-dump.ts
│
├── skills/
│   └── j-space/
│       ├── SKILL.md
│       ├── modules/
│       ├── references/
│       └── scripts/
│
├── vendor-meta/
│   ├── j-space.json
│   └── pi-dsh-minimal.json
│
└── tests/
    ├── model.test.ts
    ├── anchor.test.ts
    ├── promotion.test.ts
    ├── jspace-activation.test.ts
    ├── compaction.test.ts
    ├── session-resume.test.ts
    └── integration.test.ts
```

---

# 7. package.json

推荐：

```json
{
  "name": "pi-v4-jspace",
  "version": "1.0.0",
  "description": "DeepSeek V4 Minimal Anchor + J-Space runtime integration for Pi",
  "type": "module",
  "keywords": [
    "pi-package",
    "pi",
    "deepseek",
    "deepseek-v4",
    "j-space",
    "agent"
  ],
  "pi": {
    "extensions": [
      "./src/index.ts"
    ],
    "skills": [
      "./skills"
    ]
  },
  "peerDependencies": {
    "@earendil-works/pi-ai": "*",
    "@earendil-works/pi-agent-core": "*",
    "@earendil-works/pi-coding-agent": "*",
    "@earendil-works/pi-tui": "*",
    "typebox": "*"
  }
}
```

Pi 官方要求 core packages 作为 peer dependencies，而 Package 中的 runtime dependency 才放入 `dependencies`。

---

# 8. Runtime State

定义：

```ts
export type AnchorPhase =
    | "inactive"
    | "bootstrap"
    | "promoted";

export interface AnchorState {
    phase: AnchorPhase;

    profile: "inactive" | "v4";

    firstUserText?: string;

    hasAssistant: boolean;
    hasTool: boolean;

    promoted: boolean;

    compactionSeq: number;
}

export interface JSpaceState {
    available: boolean;

    activationPending: boolean;

    /**
     * 当前哪个 compaction epoch 已激活 J-Space。
     */
    activatedCompactionSeq: number | null;

    resumeRequired: boolean;

    lastActivationError?: string;
}

export interface RuntimeState {
    enabled: boolean;

    cwd: string;

    matchedModel: boolean;

    anchor: AnchorState;

    jspace: JSpaceState;

    desiredThinking: "max";
}
```

---

# 9. 什么是 Compaction Epoch

不要使用：

```text
boolean jspaceActivated
```

作为唯一状态。

正确做法：

```text
compactionSeq
```

定义当前 Anchor Epoch。

例如：

```text
Session Start

compactionSeq = 0
JSpace activated = 0

       ↓ compact

compactionSeq = 1
JSpace activated = null

       ↓ promote

JSpace activated = 1
```

这样可以自然解决：

```text
Session 很长
多次 compact
每次只重新注入一次 J-Space
```

`pi-dsh-minimal` 本身已经维护 compaction sequence 并通过扫描 session phase 恢复状态。

---

# 10. State Persistence

仅使用内存状态不足以正确处理：

```text
/reload
session resume
fork
tree navigation
```

因此 J-Space activation 状态应该通过：

```ts
pi.appendEntry(...)
```

写入 Session。

Pi 的 custom entry 不参与模型上下文，但可以用于恢复 Extension 状态。

推荐：

```ts
interface V4JSpaceStateEntry {
    version: 1;

    compactionSeq: number;

    event:
        | "activated"
        | "compacted"
        | "manual-reanchor";

    timestamp: number;
}
```

写：

```ts
pi.appendEntry(
    "pi-v4-jspace-state",
    data
);
```

Session Start 时扫描当前 branch 的最新状态。

---

# 11. Anchor 状态恢复

不要重新发明 promotion scan。

应基于 `pi-dsh-minimal` 当前：

```text
scanSessionPhase()
isPromoted()
```

逻辑进行移植。

其现有实现会扫描：

```text
user
assistant
tool call
compaction
```

恢复当前 phase。

---

# 12. Model Match

建议：

```ts
function modelMatches(ctx: ExtensionContext, patterns: string[]): boolean {
    const model = ctx.model;

    if (!model) {
        return false;
    }

    const values = [
        model.id ?? "",
        model.name ?? ""
    ].map(v => v.toLowerCase());

    return patterns.some(pattern => {
        const p = pattern.toLowerCase();

        return values.some(v => v.includes(p));
    });
}
```

默认：

```ts
[
  "deepseek-v4-pro",
  "deepseek-v4-flash"
]
```

---

# 13. Thinking Level

Session Start 和 Model Select：

```ts
if (matchedModel && config.setThinkingOnModelSelect) {
    pi.setThinkingLevel("max");
}
```

然后记录：

```ts
const actual = pi.getThinkingLevel();
```

Pi 支持：

```text
off
minimal
low
medium
high
xhigh
max
```

并会根据模型能力进行 clamp。

如果：

```text
actual !== "max"
```

只警告：

```text
v4j thinking=<actual>
```

不要递归反复 `setThinkingLevel()`。

---

# 14. Extension 事件总览

Pi 关键生命周期近似：

```text
session_start
resources_discover

USER
 │
 ▼
input
 │
 ▼
before_agent_start
 │
 ▼
context
 │
 ▼
before_provider_request
 │
 ▼
LLM
 │
 ▼
tool_call
 │
 ▼
tool execution
 │
 ▼
next LLM request
```

Pi 官方说明 `context` 在每次 LLM call 前运行，而 `before_provider_request` 位于 provider payload 构建之后。

---

# 15. 注册事件

`index.ts`：

```ts
export default function v4JSpace(pi: ExtensionAPI) {
    const runtime = createRuntimeState();

    registerAnchorTools(pi, runtime);
    registerCommands(pi, runtime);

    pi.on("session_start", ...);
    pi.on("model_select", ...);
    pi.on("session_compact", ...);
    pi.on("session_shutdown", ...);

    pi.on("input", ...);

    pi.on("before_agent_start", ...);

    pi.on("message_end", ...);

    pi.on("tool_call", ...);

    pi.on("before_provider_request", ...);
}
```

---

# 16. Event：session_start

职责：

```text
1. cwd 更新
2. config reload
3. persistent shell cwd 更新
4. 扫描 session 当前 branch
5. 恢复 Anchor phase
6. 恢复 J-Space activation state
7. 识别当前模型
8. 如匹配，设置 max thinking
9. 更新状态栏
```

伪代码：

```ts
pi.on("session_start", async (_event, ctx) => {
    runtime.cwd = ctx.cwd;

    runtime.config = readConfig();

    anchor.resetEphemeralState();
    anchor.restoreFromSession(ctx);

    jspace.restoreFromSession(ctx);

    runtime.matchedModel =
        shouldActivateForModel(ctx, runtime.config);

    applyThinking(pi, ctx, runtime);

    syncRuntimeSurface(pi, ctx, runtime);

    updateStatus(ctx, runtime);
});
```

---

# 17. Event：model_select

切换模型时必须立即重新计算。

```ts
pi.on("model_select", async (_event, ctx) => {
    runtime.matchedModel =
        shouldActivateForModel(ctx, runtime.config);

    if (runtime.matchedModel) {
        applyThinking(...);
        anchor.refresh(...);
    } else {
        anchor.disableAndRestoreOriginalTools(...);
        jspace.cancelPendingActivation();
    }

    updateStatus(...);
});
```

---

# 18. Event：before_agent_start

使用 Anchor upstream 的策略。

Bootstrap 时：

```text
不要在这里直接替换 System Prompt
```

原因：

如果在 `before_agent_start` 把 chained prompt 直接抹掉，后面 Extension 的 additions 也会丢失，Promote 后难以正确恢复。

`pi-dsh-minimal` 当前实现明确在 Bootstrap 时只缓存 prompt resources，并将真正 wipe 延迟到 `before_provider_request`。

因此：

```ts
pi.on("before_agent_start", async (event, ctx) => {
    if (!runtime.matchedModel) {
        return;
    }

    anchor.capturePromptResources(
        event.systemPromptOptions
    );

    anchor.refreshPhase(...);

    if (!anchor.isPromoted()) {
        return;
    }

    return {
        systemPrompt:
            anchor.composePromotedPrompt(...)
    };
});
```

---

# 19. Event：before_provider_request

这是 Anchor 最核心部分。

```ts
pi.on("before_provider_request", async (event, ctx) => {
    if (!runtime.matchedModel) {
        return undefined;
    }

    anchor.refreshPhase(...);

    const assembled =
        extractRequestSurface(event.payload).system
        ?? ctx.getSystemPrompt();

    const rewritten =
        rewriteProviderRequest(event.payload, {
            persona: anchor.composePrompt(
                pi,
                assembled
            ),

            rewriteTools:
                anchor.phase === "bootstrap"
        });

    return rewritten;
});
```

Bootstrap：

```text
rewriteTools = true
```

Promoted：

```text
rewriteTools = false
```

---

# 20. DSH Official Tool Surface

必须从 upstream `official.ts` / tool implementation 移植。

不要在设计文档中重新手写一份“类似 schema”然后让开发者猜。

开发实现步骤：

```text
1. checkout 指定 pi-dsh-minimal commit
2. 获取：
   src/dsh/official.ts
   src/tools/*
   src/adapter/*
3. 保留单元测试
4. 重命名 namespace
5. 只修改与项目 config/state/UI 对接部分
6. 工具 schema 与 payload rewrite 不做语义修改
```

原因是 `pi-dsh-minimal` 已明确说明其工具 schema 是为了避免 Pi/TypeBox 对 schema 形态产生差异。

---

# 21. Persistent Bash

Bootstrap 的 `bash` 不是简单：

```ts
exec(command)
```

而应保持 persistent session。

上游行为：

```text
cd
export
```

会在 Bootstrap 生命周期内保持，直到：

```text
Promote
Session end
Timeout
```

`pi-dsh-minimal` 当前 README 明确说明这一点。

因此必须保留：

```text
bash-session.ts
```

语义。

---

# 22. str_replace_editor

Bootstrap Tool：

```text
str_replace_editor
```

需要保持：

```text
官方名称
官方 schema
官方操作语义
绝对路径要求
```

上游目前要求 absolute path。

---

# 23. Tool Call 事件——整个插件的连接点

这是 Anchor → J-Space 的关键。

伪代码：

```ts
pi.on("tool_call", async (_event, ctx) => {
    if (!runtime.matchedModel) {
        return;
    }

    const wasPromoted =
        runtime.anchor.promoted;

    runtime.anchor.hasTool = true;

    refreshAnchorPhase(
        pi,
        ctx,
        runtime
    );

    const justPromoted =
        !wasPromoted
        && runtime.anchor.promoted;

    if (justPromoted) {
        queueJSpaceActivation(
            pi,
            ctx,
            runtime
        );
    }
});
```

注意顺序：

```text
先 Promote
后 queue J-Space
```

不能反过来。

---

# 24. 为什么使用 steer

Pi 的：

```ts
pi.sendUserMessage(
    text,
    {
        deliverAs: "steer",
        expandPromptTemplates: true
    }
);
```

在 assistant 正在执行 Tool Calls 时，会等到当前 assistant turn 的工具执行完，再在下一次 LLM request 前投递。

这正好形成：

```text
Tool Call
   │
   ├─ Anchor Promoted
   │
   ├─ J-Space queued
   │
   ▼
Tool executes
   │
   ▼
J-Space steer delivered
   │
   ▼
Next LLM Request
```

---

# 25. J-Space Activation Manager

核心：

```ts
function queueJSpaceActivation(
    pi: ExtensionAPI,
    ctx: ExtensionContext,
    runtime: RuntimeState
): void {
    const seq =
        runtime.anchor.compactionSeq;

    if (!runtime.jspace.available) {
        return;
    }

    if (
        runtime.jspace.activationPending
        || runtime.jspace.activatedCompactionSeq === seq
    ) {
        return;
    }

    runtime.jspace.activationPending = true;

    const prompt =
        runtime.jspace.resumeRequired
            ? buildResumeActivation()
            : buildNormalActivation();

    try {
        pi.sendUserMessage(
            prompt,
            {
                deliverAs: "steer",
                expandPromptTemplates: true
            }
        );

        runtime.jspace.activatedCompactionSeq =
            seq;

        runtime.jspace.activationPending = false;

        runtime.jspace.resumeRequired = false;

        persistActivation(...);
    } catch (error) {
        runtime.jspace.activationPending = false;
        runtime.jspace.lastActivationError =
            String(error);

        markDegraded(...);
    }
}
```

---

# 26. 正常 Activation Prompt

保持很短：

```text
/skill:j-space Continue the current task from the existing conversation state.
Do not restart work that is already complete.
```

不要添加：

```text
You are god mode
Think 10x harder
Always loop
Always deeply reason
```

这些都是额外 persona 干扰。

---

# 27. Resume Activation Prompt

```text
/skill:j-space Continue the current task after a long-gap recovery.
If this task is using J-Space loop state, restore its existing ledger/resume state
before continuing further task work.
Do not restart completed work.
```

目的：

```text
告诉 J-Space 发生了 long gap
```

而不是替 J-Space决定：

```text
必须 loop
```

---

# 28. Skill Expansion

Pi 的 Skill command 形式是：

```text
/skill:name
```

例如：

```text
/skill:j-space
```

完整 Skill 内容只有在模型 read 或 Skill command expansion 时才进入上下文。

因此一定要：

```ts
expandPromptTemplates: true
```

---

# 29. J-Space Discovery

不要假设 Skill 一定存在。

初始化后通过：

```ts
const commands = pi.getCommands();
```

Pi 的 `getCommands()` 会返回：

```text
extension
prompt
skill
```

命令及 source metadata。

检查：

```ts
const jspace = commands.find(
    command =>
        command.source === "skill"
        && command.name === "skill:j-space"
);
```

如果当前 Pi 实际返回的 Skill command naming 与此不同，应根据官方 API 返回值适配，**不得仅靠文件路径猜测 command ownership**；Pi 官方要求以 `sourceInfo` 作为 provenance。

---

# 30. Package Skill 被禁用时

用户可能配置 Package filter：

```json
{
  "source": "npm:pi-v4-jspace",
  "skills": []
}
```

Pi 支持这种资源过滤。

此时：

```text
Anchor 仍可运行
J-Space unavailable
```

第一次 Promote 时：

```text
不要 send /skill:j-space
```

状态：

```text
v4j promoted • jspace unavailable
```

---

# 31. session_compact

处理：

```ts
pi.on("session_compact", async (_event, ctx) => {
    runtime.anchor.hasAssistant = false;
    runtime.anchor.hasTool = false;
    runtime.anchor.promoted = false;

    runtime.jspace.activationPending = false;
    runtime.jspace.activatedCompactionSeq = null;
    runtime.jspace.resumeRequired = true;

    refreshAnchorPhase(...);

    persistCompaction(...);

    updateStatus(...);
});
```

上游 `pi-dsh-minimal` 同样在 compaction 时清空 `hasAssistant / hasTool / promoted` 再 refresh。

---

# 32. Compaction 的已知权衡

J-Space 理论上要求 long gap 后：

```text
恢复 Ledger
重新读 premise
重新读 invariants
然后再继续工作
```

但是我们的 Anchor 方案要求：

```text
compaction 后先重新 Minimal
```

因此不可同时在第一个 post-compaction request 注入完整 J-Space，否则会破坏 Minimal。

v1.0 明确选择：

```text
重新 Anchor 优先
→ 第一次 Tool Call
→ Promote
→ J-Space Resume
```

这是一个刻意的工程取舍。

不要尝试同时满足：

```text
Request #1 完全 Minimal
```

和：

```text
Request #1 已加载完整 J-Space
```

二者逻辑上冲突。

---

# 33. message_end

虽然 v1.0 默认：

```text
promotion = tool-call
```

但仍应记录：

```text
hasAssistant
```

用于 Session phase reconstruction。

类似上游：

```ts
pi.on("message_end", async (event, ctx) => {
    noteAssistant(
        runtime.anchor,
        event.message
    );

    refreshAnchorPhase(...);
});
```

不要在这里激活 J-Space。

---

# 34. input

保存：

```text
firstUserText
userRounds
```

用于 Anchor state scan 和 debug。

```ts
pi.on("input", async event => {
    anchor.noteUserText(
        event.text
    );

    return undefined;
});
```

---

# 35. session_shutdown

Persistent Bash 必须关闭。

```ts
pi.on("session_shutdown", async () => {
    await runtime.anchor.shell.reset(
        "session shutdown"
    );
});
```

Pi 官方要求 Session-scoped 资源在 `session_shutdown` 清理。

---

# 36. Prompt Composition

Promoted Prompt 不应该简单恢复 stock Pi prompt。

应保持 upstream Anchored Standard 语义：

```text
官方 DeepSeek persona
作为第一句

+
Pi tool guidance
+
project context
+
skills
+
其他 extension additions

-
Pi identity persona
```

这部分应直接基于 upstream：

```text
composeAnchoredPrompt()
promptResourcesFrom()
toolResourcesFromLiveTools()
```

移植。

---

# 37. 不要硬编码项目 Context

不要自行读：

```text
AGENTS.md
README
.pi
```

Pi 自己已经完成这些资源加载。

Anchor Promote 时只需要恢复 Pi 构建好的 Prompt Resources。

这也是 upstream `systemPromptOptions` 快照机制存在的原因。

---

# 38. J-Space Controller

插件本身**不直接控制**：

```text
jspace.py note
jspace.py seam
jspace.py ship
jspace.py resume
```

这些属于 J-Space Skill 的行为。

J-Space 定义：

```text
fast:
  不用 controller

full:
  ship

loop:
  note
  seam
  checkpoint
  ship
  resume
```

插件只确保：

```text
Skill 能访问对应 scripts/
```

---

# 39. `.jspace/` 目录

J-Space controller 将状态写到当前任务 workspace 的：

```text
.jspace/
```

而不是 Skill 目录。

插件：

```text
不得自动删除
不得自动 commit
不得自动加入 .gitignore
```

这属于用户项目状态。

---

# 40. Config

`src/config.ts`：

```ts
export interface V4JSpaceConfig {
    enabled: boolean;

    modelPatterns: string[];

    thinking: "max";

    setThinkingOnModelSelect: boolean;

    promotion: "tool-call";

    jspace: {
        enabled: boolean;
        activateAfterPromotion: boolean;
        resumeAfterCompaction: boolean;
    };

    statusLine: boolean;

    debugDump: boolean;
}
```

Default：

```ts
export const DEFAULT_CONFIG: V4JSpaceConfig = {
    enabled: true,

    modelPatterns: [
        "deepseek-v4-pro",
        "deepseek-v4-flash"
    ],

    thinking: "max",

    setThinkingOnModelSelect: true,

    promotion: "tool-call",

    jspace: {
        enabled: true,
        activateAfterPromotion: true,
        resumeAfterCompaction: true
    },

    statusLine: true,

    debugDump: false
};
```

---

# 41. Config 文件容错

JSON：

```text
损坏
字段未知
字段类型错误
```

都不能让插件 crash。

策略：

```text
读失败
→ WARN
→ 使用 DEFAULT_CONFIG
```

---

# 42. `/v4j reanchor`

功能：

```text
只重置当前 Runtime Epoch
```

行为：

```text
anchor.hasAssistant = false
anchor.hasTool = false
anchor.promoted = false

jspace activation reset
resumeRequired = true
```

不要：

```text
清空整个 Pi Session
清空用户消息
删除 .jspace/
```

---

# 43. `/v4j off`

必须完全恢复：

```text
原始 Pi Tool set
不再 payload rewrite
不再 J-Space injection
```

但：

```text
已经进入对话历史里的 J-Space 内容
```

不能、也无需删除。

---

# 44. Debug Dump

参考 `pi-dsh-minimal` 的：

```text
PI_DSH_MINIMAL_DUMP
```

机制。上游可以 dump provider request surface 用于验证。

本项目可提供：

```text
PI_V4_JSPACE_DUMP=/tmp/v4j.jsonl
```

每次 provider request append：

```json
{
  "timestamp": 0,
  "matched": true,
  "anchorPhase": "bootstrap",
  "compactionSeq": 0,
  "jspaceActivated": false,
  "system": "...",
  "tools": []
}
```

默认关闭。

---

# 45. Debug Dump 验证第一请求

自动测试需要确认：

```text
system ==
"You are a helpful software engineer assistant."
```

且：

```text
tool count == 2
```

Tool names：

```text
bash
str_replace_editor
```

并检查：

```text
!system.includes("available_skills")
!system.includes("AGENTS.md content")
```

---

# 46. Status Line

使用：

```ts
ctx.ui.setStatus(...)
```

Pi Extension 支持 footer status。

建议：

```ts
function renderStatus(runtime): string | undefined {
    if (
        !runtime.enabled
        || !runtime.matchedModel
    ) {
        return undefined;
    }

    if (runtime.anchor.phase === "bootstrap") {
        return runtime.jspace.resumeRequired
            ? "v4j re-anchoring • resume"
            : "v4j anchored";
    }

    if (!runtime.jspace.available) {
        return "v4j promoted • jspace unavailable";
    }

    if (runtime.jspace.activationPending) {
        return "v4j promoted • jspace pending";
    }

    return "v4j promoted • jspace";
}
```

---

# 47. `/v4j doctor` 实现

检查文件：

```text
skills/j-space/SKILL.md
skills/j-space/modules
skills/j-space/references
skills/j-space/scripts/jspace.py
skills/j-space/scripts/verify_suite.py
```

然后：

```ts
pi.getCommands()
```

检查 J-Space Skill 是否实际被 Pi 发现。

可选检查：

```text
python3 --version
```

如果存在：

```text
python3 verify_suite.py
```

J-Space controller 不依赖第三方 Python package。

---

# 48. License / Attribution

`THIRD_PARTY_NOTICES.md` 至少记录：

```text
pi-dsh-minimal
MIT
Averyyy
Source commit

DeepSeek Harness-derived tool descriptions/schema
MIT attribution inherited from pi-dsh-minimal NOTICE

J-Space Cognition Suite V3.6
Apache License 2.0
Tiger3807861189
Source commit
```

不要删除 vendored J-Space 自带 LICENSE/NOTICE 信息。

---

# 49. Tests：单元测试

## model.test.ts

覆盖：

```text
deepseek-v4-pro
DEEPSEEK-V4-PRO
foo/deepseek-v4-pro-0813
deepseek-v4-flash
foo-v4-other
claude
gpt
```

---

# 50. anchor.test.ts

验证：

```text
Bootstrap prompt exact
Official tools exact
Promoted prompt restore
No J-Space in bootstrap
```

---

# 51. promotion.test.ts

测试：

```text
Session start
→ not promoted

Assistant text
→ still not promoted

Tool call
→ promoted
```

---

# 52. jspace-activation.test.ts

验证：

```text
first tool call
→ one activation

second tool call
→ zero additional activation

three parallel tool calls
→ one activation total
```

---

# 53. Skill Expansion 集成测试

Mock：

```ts
pi.sendUserMessage
```

必须捕获：

```text
deliverAs === "steer"
expandPromptTemplates === true
```

文本必须以：

```text
/skill:j-space
```

开始。

---

# 54. compaction.test.ts

流程：

```text
bootstrap
→ tool
→ promoted
→ jspace activated
→ compact
→ bootstrap
→ tool
→ promoted
→ jspace activated again
```

activation 数：

```text
2
```

并确认第二次使用：

```text
long-gap recovery
```

版本。

---

# 55. session-resume.test.ts

已有 Session：

```text
compactionSeq = 2
activatedCompactionSeq = 2
```

Resume 后：

```text
不得再次无条件注入 J-Space
```

直到发生：

```text
新的 compactionSeq = 3
```

---

# 56. Model Switch Test

```text
V4
→ Bootstrap

切 Claude
→ stock Pi

切回 V4
→ Anchor phase 根据当前 Session branch 重建
```

不得遗留：

```text
两工具锁死
```

---

# 57. Failure Injection Tests

必须测试：

```text
Malformed config
Skill disabled
Skill command missing
sendUserMessage throw
Debug path unwritable
Python missing
Shell timeout
Provider rewrite unexpected payload
```

---

# 58. Provider Rewrite Fail-safe

这是最重要的异常策略。

如果无法识别 provider payload：

```text
禁止构造一个猜测 payload
```

应：

```text
log warning
return undefined
```

也就是：

```text
使用原始 Provider Payload
```

而不是损坏请求。

---

# 59. Runtime 网络行为

Plugin runtime：

```text
0 network requests
```

J-Space vendored 本地读取。

Anchor 本地执行。

如果用户 Agent 自己使用网络工具：

```text
属于 Pi / 用户任务
```

不是插件 telemetry。

---

# 60. 性能要求

Plugin 自身：

```text
before_provider_request
```

主要做：

```text
对象检查
Prompt composition
Tool schema rewrite
```

不应该产生：

```text
网络 IO
磁盘大文件扫描
外部命令
```

每请求新增延迟目标：

```text
< 5ms
```

该指标属于工程目标，不是硬实时保证。

---

# 61. J-Space 更新机制

禁止：

```text
每次启动在线拉 latest
```

原因：

```text
不可复现
供应链风险
协议可能发生变化
```

升级流程：

```text
1. 手工拉取 upstream
2. 固定 commit
3. 替换 skills/j-space
4. 运行 verify_suite.py
5. 运行 package tests
6. 更新 vendor-meta/j-space.json
7. 发布新 pi-v4-jspace 版本
```

---

# 62. pi-dsh-minimal 更新机制

同样：

```text
不运行时在线同步
```

而是：

```text
1. diff upstream
2. 检查 adapter/tool changes
3. port
4. 跑 Anchor tests
5. 更新 vendor metadata
```

---

# 63. 不要升级时顺手改协议

Dependency bump PR 中不要同时：

```text
升级 J-Space
+
改 Anchor
+
改 Activation Prompt
+
改 Config
```

尽量一项一个变更。

否则无法定位行为变化。

---

# 64. 开发完成定义

只有满足以下全部条件才能称为 v1.0：

```text
[ ] 一个 Pi Package 即可安装
[ ] Bundled J-Space 可被 Pi 识别
[ ] V4 Pro 自动 max
[ ] V4 Flash 自动 max
[ ] 非 V4 无影响
[ ] 首请求 exact Minimal
[ ] 首请求无 Skill catalog
[ ] 第一次 Tool Call Promote
[ ] Promote 后恢复 Pi Tools
[ ] J-Space steer 正确展开
[ ] 每 epoch 只展开一次
[ ] Compaction 重 Anchor
[ ] Compaction 后 Resume activation
[ ] Session resume 状态正确
[ ] Model switch 正确
[ ] Python 缺失仍可工作
[ ] 无 telemetry
[ ] npm test 通过
[ ] typecheck 通过
[ ] THIRD_PARTY_NOTICES 完整
```

---

# 65. 开发顺序

建议开发模型严格按以下顺序实现：

```text
Step 1
建立 Pi Package skeleton

Step 2
Vendoring J-Space
确保 Pi 能识别 /skill:j-space

Step 3
Port pi-dsh-minimal Anchor
先做到纯 Anchor tests 全过

Step 4
把 promotion 固定为 tool-call

Step 5
增加 JSpaceManager

Step 6
Tool Call → Promote → steer

Step 7
增加 Compaction Epoch

Step 8
增加 Session persistence

Step 9
增加 model switching

Step 10
增加 status / doctor

Step 11
全量 integration tests

Step 12
写 README 和第三方 Notice
```

不要从 UI 开始。

---

# 66. 最核心的集成时序

开发者应把下面这张时序图当作最终事实：

```text
User
 │
 │ "Implement feature X"
 ▼
Pi
 │
 │ before_agent_start
 ▼
Anchor
 │  capture original Pi prompt resources
 │
 │ before_provider_request
 ▼
Minimal rewrite
 │
 │ system:
 │ "You are a helpful software engineer assistant."
 │
 │ tools:
 │ bash
 │ str_replace_editor
 ▼
DeepSeek V4
 │
 │ thinking=max
 │
 │ tool_call(bash)
 ▼
pi-v4-jspace
 │
 ├─ mark hasTool
 ├─ Promote Anchor
 ├─ restore Pi runtime surface
 │
 └─ queue:
       /skill:j-space ...
       deliverAs=steer
       expandPromptTemplates=true
 │
 ▼
bash executes
 │
 ▼
Pi delivers steer
 │
 ▼
Skill command expands
 │
 │ Full SKILL.md
 ▼
Next provider request
 │
 │ full Pi tools
 │ project context
 │ J-Space
 ▼
DeepSeek V4
 │
 │ J-Space Gate
 ├─ fast
 ├─ full
 └─ loop
 │
 ▼
Continue original task
```

---

# 67. 开发时禁止的错误实现

## 错误 1

```ts
pi.setActiveTools(["bash", "edit"]);
```

当作 Minimal。

**错误。**

---

## 错误 2

Session Start：

```ts
pi.sendUserMessage("/skill:j-space");
```

**错误。**

会污染首请求。

---

## 错误 3

把 J-Space `SKILL.md` 内容复制为：

```ts
const JSPACE_PROMPT = `...`;
```

**错误。**

---

## 错误 4

插件自己：

```ts
classifyTask() {
  return "loop";
}
```

**错误。**

J-Space 自己有 Gate。

---

## 错误 5

Promote 后仍只保留：

```text
bash
str_replace_editor
```

**错误。**

---

## 错误 6

Compaction 后直接先注入 J-Space，再做 Anchor。

**错误。**

v1.0 明确顺序：

```text
Re-anchor
→ Promote
→ J-Space Resume
```

---

# 68. 开发模型最终自检问题

提交代码前必须逐项回答：

```text
1. 第一 provider request 到底是什么 system？
2. 第一 provider request 到底有几个 tools？
3. J-Space 是否有任何内容进入第一请求？
4. 第一次 Tool Call 后什么时候 Promote？
5. J-Space 是在 Tool Call 前还是后注入？
6. 注入时是否使用 steer？
7. 是否启用了 expandPromptTemplates？
8. Skill 是否只展开 SKILL.md，而非所有 modules？
9. Compaction 后 activation epoch 是否变化？
10. Resume Session 会不会重复注入？
11. 非 DeepSeek 模型是否完全 untouched？
12. Python 不存在时是否还能工作？
```

任何一个答不清楚，都不应该认为实现完成。

---

# 69. 实现依据

开发时以以下资料为 Source of Truth：

```text
Pi Extension API
https://pi.dev/docs/latest/extensions

Pi Skills
https://pi.dev/docs/latest/skills

Pi Packages
https://pi.dev/docs/latest/packages

Anchor reference implementation
https://github.com/Averyyy/pi-dsh-minimal

J-Space upstream
https://github.com/Tiger3807861189/J-Space-Cognition-Suite-V3.6

J-Space evaluation report
https://github.com/Tiger3807861189/DeepSeek-V4-J-Space-Capability-Realization-Report
```

如果代码实现与模型记忆冲突：

> **以上游当前源码和本文档明确设计决策为准。**

如果 Pi API 已发生变化：

> **只适配 API 调用方式，不得改变 Minimal → Promote → J-Space 的核心时序。**
