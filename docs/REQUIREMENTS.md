# pi-v4-jspace v1.0 产品需求文档（PRD）

**文档版本：** 1.0  
**产品名称：** `pi-v4-jspace`  
**目标宿主：** Pi Coding Agent  
**目标模型：** DeepSeek V4 Pro / DeepSeek V4 Flash 系列  
**主要目标型号：** `deepseek-v4-pro-0813`、`deepseek-v4-flash`  
**产品形态：** Pi Package（Extension + Skill）  
**文档用途：** 本文档应足以让一个此前不了解 `pi-dsh-minimal`、DeepSeek Harness Minimal、J-Space 的开发模型理解需求并实施开发。

---

# 1. 产品概述

`pi-v4-jspace` 是一个面向 DeepSeek V4 系列模型的 Pi 运行时能力释放插件。

它解决两个相互独立但连续的问题：

1. **首轮 Harness 失配问题**
   - DeepSeek V4 在 Coding Agent 场景下对第一次请求所看到的 system prompt 和 tool schema 较为敏感。
   - 社区项目 `pi-dsh-minimal` 已实现一种 Anchored Standard 策略：第一次请求模拟 DeepSeek Harness Minimal，之后恢复 Pi 原始完整工具和项目上下文。当前实现会在 provider request 最后阶段重写 system/tool surface，而不是仅使用 Pi 的 `setActiveTools()`。

2. **长程推理能力实现损失**
   - J-Space Cognition Suite V3.6 是一个 inference-time cognitive control suite，以 Skill 形式发布，不修改模型权重。
   - J-Space 自带 `fast / full / loop` Gate，并针对工作集控制、跨文件约束保持、验证、失败恢复和长任务 Ledger 提供协议。

`pi-v4-jspace` 的核心运行链路：

```text
用户提交真实任务
       │
       ▼
DeepSeek V4 + max reasoning
       │
       ▼
Minimal Bootstrap
       │
       │  System:
       │  You are a helpful software engineer assistant.
       │
       │  Tools:
       │  bash
       │  str_replace_editor
       │
       ▼
第一次真实 Tool Call
       │
       ▼
Promote
       │
       ├─ 恢复 Pi 原始 Tools
       ├─ 恢复项目 Context
       ├─ 恢复 AGENTS.md
       └─ 恢复 Skill Catalog
       │
       ▼
自动激活 J-Space
       │
       ▼
J-Space 自行执行 Gate
       │
       ├─ fast
       ├─ full
       └─ loop
       │
       ▼
继续原始任务
       │
       ▼
验证 / 恢复 / 最终交付
```

用户不需要：

```text
手动发 bootstrap 消息
手动执行 /skill:j-space
单独安装 pi-dsh-minimal
单独安装 J-Space
```

---

# 2. 必须理解的技术背景

## 2.1 Pi Extension

Pi Extension 是 TypeScript 模块。

Extension 可以：

- 监听 session / model / agent / tool / context / provider 等生命周期事件；
- 修改 system prompt；
- 修改 provider request；
- 动态管理工具；
- 发送 steer / follow-up 用户消息；
- 注册命令和状态栏；
- 保存 Session 持久状态。

Pi Package 可以同时包含：

```text
extensions
skills
prompts
themes
```

因此 `pi-v4-jspace` 应作为**一个 Package**同时发布 Extension 和 J-Space Skill。

---

# 3. DeepSeek Minimal Anchor 的准确含义

禁止把 Minimal Anchor 理解成：

```ts
pi.setActiveTools(["bash"]);
```

或者：

```text
给 System Prompt 加一句“认真思考”
```

都不正确。

`pi-dsh-minimal` 当前实现的关键行为是：

### Bootstrap

第一次 provider request：

```text
System Prompt
=
You are a helpful software engineer assistant.
```

Tool Schema：

```text
bash
str_replace_editor
```

并且第一请求不应暴露：

```text
AGENTS.md
Pi identity
Skill catalog
project context
其他 Pi tools
其他 Tool schema
```

`pi-dsh-minimal` 明确在 `before_provider_request` 中重写最终 provider payload，以保证模型实际看到的 Tool Schema 接近官方 DSH surface，而不是只改变 Pi 内部“活动工具”列表。

---

# 4. Promote 的准确含义

第一次真实 Tool Call 发生后：

```text
Bootstrap
→ Promoted
```

Promoted 后：

- 保留 DeepSeek 官方简短 persona 作为首句；
- 恢复 Pi 完整工具；
- 恢复 tools guide；
- 恢复项目路径信息；
- 恢复 AGENTS / project context；
- 恢复 Skill catalog；
- 恢复其他 Extension 对 system prompt 的附加内容。

这正是 Anchored Standard 的核心：**只有 Bootstrap 是 Minimal，而不是整个 Session 永久只有两个工具。**

---

# 5. J-Space 的准确含义

J-Space 不是一个新的模型，也不是修改 DeepSeek hidden state 的代码。

它是：

```text
Inference-time cognitive control protocol
+
Agent Skill
+
可选 Python controller
```

J-Space V3.6 的主入口是：

```text
j-space/SKILL.md
```

并包含：

```text
modules/
references/
scripts/jspace.py
```

完整 Skill 约 15.6 KB，Pi 正常情况下只在 system prompt 中暴露 Skill 名称和 description；完整 `SKILL.md` 由模型按需 read，或者通过 `/skill:j-space` 强制展开。

---

# 6. J-Space Gate

**插件不得自行重新实现一套任务分类器。**

J-Space 自己已经定义：

| Pass | 条件 |
| --- | --- |
| `fast` | 一步即可完成或一眼可核验 |
| `full` | 2～4 个依赖步骤、单个有界交付 |
| `loop` | 多阶段、多文件、多轮、多工具或必须长期维持状态 |

J-Space 明确要求只加载任务需要的模块，过度加载本身就是失败。

因此：

```text
pi-v4-jspace
不判断 fast/full/loop

而是

pi-v4-jspace
负责在正确时机激活 J-Space

J-Space
负责自行 Gate
```

---

# 7. 产品目标

## P0：必须完成

### G-001 单包安装

用户只需要安装：

```bash
pi install npm:pi-v4-jspace
```

或者 Git 安装：

```bash
pi install git:github.com/<owner>/pi-v4-jspace
```

Pi 官方支持 Package 同时携带 Extension 与 Skills。

---

### G-002 自动识别 DeepSeek V4

默认匹配：

```text
deepseek-v4-pro
deepseek-v4-flash
```

大小写不敏感。

匹配依据应综合：

```text
model.id
model.name
```

任意一个命中即可。

---

### G-003 非 DeepSeek V4 完全不受影响

当模型不匹配时：

```text
不改 System Prompt
不改 Tools
不改 Provider Payload
不改 Thinking Level
不自动注入 J-Space
```

这是强制要求。

---

### G-004 自动设置 max reasoning

匹配 DeepSeek V4 时，插件默认调用：

```ts
pi.setThinkingLevel("max");
```

Pi 当前 Extension API 的 thinking level 包含 `max`，并会按照模型能力自动 clamp。

如果用户主动在 Session 中降低 thinking：

- 不进入无限抢占/循环修改；
- 状态栏显示警告；
- `/v4j doctor` 报告当前不是推荐状态。

---

### G-005 首请求严格 Minimal

第一次 provider request 必须满足：

```text
system = 精确官方 Minimal persona
tools  = 精确 DSH bash + str_replace_editor
```

不得简单替换成：

```text
Pi bash
Pi edit
```

工具名称、description、parameters schema 和关键返回行为应以 `pi-dsh-minimal` 中已经移植并测试的 DSH schema 为实现基线。

---

### G-006 Bootstrap 阶段不得注入 J-Space

首请求必须：

```text
J-Space Skill catalog 不可见
J-Space SKILL.md 不可见
J-Space activation message 不可见
```

即使 Package 自带 J-Space Skill，也必须由 Minimal payload rewrite 在首请求移除 Skill catalog。

---

### G-007 默认使用 Tool Call Promote

v1.0 固定默认：

```text
promoteOn = tool-call
```

理由：

```text
assistant 仅输出文字
≠
trajectory 已实际进入 Agent 工具执行
```

只有出现第一次真实 Tool Call 才 Promote。

---

### G-008 Promote 后恢复 Pi 完整能力

第一次 Tool Call 后，下一次 provider request 应恢复：

```text
Pi 原始 Tools
Project Context
AGENTS.md
Skill catalog
其他 Extension additions
```

不能永久限制成 DSH 两工具。

---

### G-009 Promote 后自动激活 J-Space

第一次 Tool Call 发生时：

```text
1. Anchor 状态先切为 Promoted
2. 排队 J-Space activation
3. 当前 assistant 的所有 tool calls 正常执行
4. tool calls 执行完
5. 在下一次 LLM Request 前插入 J-Space
```

Pi 的：

```ts
pi.sendUserMessage(..., {
    deliverAs: "steer",
    expandPromptTemplates: true
});
```

支持在当前工具执行完成后、下一次 LLM 调用之前投递 steer，并支持 Skill command expansion。

标准 activation：

```text
/skill:j-space Continue the current task from the existing conversation state.
Do not restart work that is already complete.
```

必须：

```ts
expandPromptTemplates: true
```

否则 `/skill:j-space` 不会自动展开。

---

### G-010 每个 Anchor Epoch 只能激活一次 J-Space

同一轮 Bootstrap → Promote 生命周期中：

```text
第一次 Tool Call
→ 激活一次

第二个 Tool Call
→ 不重复

第 10 个 Tool Call
→ 不重复
```

即使 assistant 一次并行调用多个工具，也只能排队一次 J-Space。

---

### G-011 Compaction 后重新 Anchor

Pi 发生：

```text
session_compact
```

后：

```text
Promoted = false
JSpaceActivated = false
ResumeRequired = true
```

下一次请求重新走：

```text
Minimal Bootstrap
→ Tool Call
→ Promote
→ J-Space 再激活
```

`pi-dsh-minimal` 当前也会在 `session_compact` 后回到 bootstrap。

---

### G-012 Compaction 后触发 J-Space Resume 语义

J-Space 明确规定 compaction / summarisation / session boundary 属于 long gap，应重新读取 ledger、premise 和 invariants；其可选 controller 提供 `resume` 命令。

因此 compaction 后的 activation 参数应变成：

```text
/skill:j-space

Continue the current task after a long-gap recovery.
If this task is using J-Space loop state, restore the existing ledger/resume state
before continuing further task work.
Do not restart completed work.
```

插件本身**不得自行假设任务一定属于 loop**。

是否调用：

```bash
python3 <skill-root>/scripts/jspace.py resume
```

由 J-Space 协议和模型判断。

---

### G-013 J-Space Controller 必须保持可选

插件不能要求所有用户安装 Python 才能工作。

J-Space 本身规定：

```text
fast → 不需要 controller
full → controller 仅有少量用途
loop → 可以使用 ledger/controller
```

而且 controller 只使用 Python 标准库。

如果系统没有 Python：

```text
插件仍必须正常运行
J-Space 使用对话内 Ledger fallback
```

---

### G-014 不修改 J-Space 协议

禁止：

```text
删减 SKILL.md
合并 9 个 modules
重写 J-Space persona
把 J-Space 全文塞进 system prompt
自行简化 J-Space
```

J-Space 应作为一个**原样 vendored upstream snapshot**存在。

更新 J-Space 时应执行明确的 dependency bump，而不是随意修改 vendored 内容。

---

### G-015 J-Space 必须 Progressive Disclosure

不得在 Promote 后直接把：

```text
SKILL.md
+
9 modules
+
references
```

全部注入。

只展开：

```text
SKILL.md
```

后续模块由 J-Space 自己根据 Gate 和 Routing 读取。

J-Space 明确要求只加载当前 pass 所需要的模块。

---

# 8. 非目标

v1.0 明确不做：

```text
dsh-routing-suite
dsh-mode-boost
Weak Routing
第二套 persona classifier
多模型协同
Subagent orchestration
自动切换 Pro / Flash
模型 benchmark 系统
自动修改项目 AGENTS.md
自动修改 .gitignore
自动修改用户模型 Provider
自动修改 temperature / top_p
```

尤其不得重新加入已经从 `pi-dsh-minimal` 移除的 Flash weak-routing/mode-boost 逻辑；该项目当前 README 给出的受控 SWE 子集实验没有测得稳定增益。

---

# 9. 推荐运行时状态

插件至少维护：

```ts
interface RuntimeState {
    enabled: boolean;
    matchedModel: boolean;

    anchor: {
        phase: "inactive" | "bootstrap" | "promoted";
        compactionSeq: number;
        hasTool: boolean;
    };

    jspace: {
        available: boolean;
        activatedForCompactionSeq: number | null;
        activationPending: boolean;
        resumeRequired: boolean;
    };

    thinking: {
        desired: "max";
        actual: string;
    };
}
```

---

# 10. 用户可见状态

状态栏推荐：

### 未匹配模型

```text
无状态显示
```

### Bootstrap

```text
v4j anchored
```

### Promote 后、J-Space 正在等待注入

```text
v4j promoted • jspace pending
```

### 正常运行

```text
v4j promoted • jspace
```

### Compaction 后

```text
v4j re-anchoring • resume
```

### 配置异常

```text
v4j degraded
```

---

# 11. Slash Commands

v1.0 必须提供：

```text
/v4j
/v4j status
/v4j on
/v4j off
/v4j doctor
/v4j reanchor
```

可选：

```text
/v4j dump on
/v4j dump off
```

---

# 12. `/v4j status`

示例：

```text
pi-v4-jspace 1.0.0

Enabled: yes
Model matched: yes
Model: deepseek-v4-pro-0813
Thinking: max

Anchor:
  phase: promoted
  compaction epoch: 0
  first tool observed: yes

J-Space:
  bundled skill: available
  activated: yes
  resume required: no

Runtime:
  project: /path/project
```

---

# 13. `/v4j doctor`

至少检查：

```text
[OK] Package extension loaded
[OK] DeepSeek V4 model matched
[OK] Thinking = max
[OK] J-Space skill command available
[OK] J-Space SKILL.md exists
[OK] J-Space modules directory exists
[OK] J-Space verify_suite.py exists
[OK] Anchor tool definitions loaded
[OK] Provider rewrite enabled
```

如果 Python 存在，可额外执行：

```text
python3 skills/j-space/scripts/verify_suite.py
```

如果不存在：

```text
[WARN] Python not found; J-Space controller is optional
```

不能判定插件不可用。

---

# 14. 配置文件

推荐：

```text
~/.pi/agent/pi-v4-jspace.json
```

结构：

```json
{
  "enabled": true,
  "modelPatterns": [
    "deepseek-v4-pro",
    "deepseek-v4-flash"
  ],
  "thinking": "max",
  "setThinkingOnModelSelect": true,
  "promotion": "tool-call",
  "jspace": {
    "enabled": true,
    "activateAfterPromotion": true,
    "resumeAfterCompaction": true
  },
  "statusLine": true,
  "debugDump": false
}
```

v1.0 中：

```text
promotion
```

内部实际上只支持：

```text
tool-call
```

配置字段保留是为了后续兼容。

---

# 15. 安装体验

最终应支持：

```bash
pi install npm:pi-v4-jspace
```

安装 Package 后包含：

```text
Extension
+
J-Space Skill
```

用户：

```text
/reload
```

或重启 Pi 即可。

不需要额外：

```bash
pi install npm:pi-dsh-minimal
```

也不需要：

```bash
git clone J-Space...
```

---

# 16. 依赖策略

## Minimal Anchor

不依赖用户另外安装 `pi-dsh-minimal`。

应将其当前已验证的核心 adapter/tool 实现**以 MIT 条款允许的方式移植或 vendoring 到项目中**，并保留原项目 NOTICE / attribution。`pi-dsh-minimal` 当前明确声明 MIT，并说明 DSH tool schema/description 来源。

## J-Space

将：

```text
j-space/
```

原样 vendored 到：

```text
skills/j-space/
```

J-Space 当前采用 Apache License 2.0。

需要保留：

```text
LICENSE
upstream attribution
commit/version metadata
```

---

# 17. 安全要求

插件必须：

```text
默认不发送 telemetry
默认不发送网络请求
默认不上传 Prompt
默认不上传工具调用
默认不上传代码
```

Debug dump 只能用户显式开启。

Dump 文件可能包含 provider request、prompt 或工具 schema，因此必须在帮助文本中提示：

```text
Debug dumps may contain sensitive project or conversation content.
```

---

# 18. 稳定性要求

任何辅助功能失败：

```text
状态栏
doctor
debug dump
J-Space Python controller
```

都不得导致 Pi 主 Agent 崩溃。

失败策略：

```text
Anchor 失败
→ 不发送半修改 Provider Payload
→ fail open 到原 Pi surface
→ 明确 ERROR

J-Space activation 失败
→ 保留 Promoted Pi Agent
→ 标记 degraded
→ 不循环重试

Status UI 失败
→ 静默忽略
```

---

# 19. 关键用户流程

## Flow A：大型编码任务

用户直接：

```text
重构当前下载模块，实现断点续传，并补充恢复和校验逻辑。
```

实际：

```text
Request #1
  Minimal

模型
  bash(...)

Tool Call
  ↓

Anchor Promote

Tool execution
  ↓

自动 steer:
  /skill:j-space ...

Request #2
  Pi Full Tools
  + J-Space

J-Space:
  Gate → loop

继续实现
```

用户不应看到需要手工操作的 bootstrap。

---

# 20. Text-only 首轮

如果第一次模型回答没有 Tool Call：

```text
Bootstrap 保持
J-Space 不激活
```

如果用户随后发出需要实际工程操作的任务：

```text
第一次 Tool Call
→ Promote
→ J-Space
```

这是预期行为。

---

# 21. Compaction Flow

```text
Promoted + J-Space
      │
      ▼
session_compact
      │
      ▼
anchor = bootstrap
jspace = inactive
resumeRequired = true
      │
      ▼
下一次 provider request
Minimal surface
      │
      ▼
第一次 tool call
      │
      ▼
Promote
      │
      ▼
J-Space activation
带 long-gap recovery 参数
      │
      ▼
J-Space 根据任务决定是否 resume ledger
```

---

# 22. 验收标准

## AC-001

使用非 DeepSeek 模型启动 Pi。

要求：

```text
Provider Payload 与 stock Pi 完全相同
```

---

## AC-002

使用 V4 Pro 新 Session。

第一次 provider request：

```text
system
=
You are a helpful software engineer assistant.
```

且只有：

```text
bash
str_replace_editor
```

---

## AC-003

第一请求中不得出现：

```text
<available_skills>
j-space description
AGENTS.md 内容
Pi identity
read/edit/write/grep/find/ls schema
```

---

## AC-004

第一次 Tool Call 后：

```text
anchor.phase == promoted
```

---

## AC-005

同一 assistant turn 有三个 Tool Call：

```text
J-Space activation 数量必须 = 1
```

---

## AC-006

下一次 LLM Request：

```text
恢复 Pi 原始 Tools
```

---

## AC-007

下一次 LLM Request 中包含完整 J-Space `SKILL.md` expansion。

---

## AC-008

J-Space 其他 9 个 modules 不得被插件主动全部注入。

---

## AC-009

Compaction 后再次回到 Minimal。

---

## AC-010

Compaction 后第二次 J-Space activation 包含 long-gap recovery 语义。

---

## AC-011

Session reload/resume 后不能无条件重复 J-Space activation。

---

## AC-012

切换到 Claude/GPT/其他模型：

```text
插件退出 DeepSeek 模式
恢复 Pi 原始工具
不再注入 J-Space
```

---

## AC-013

没有 Python 环境：

```text
插件仍正常工作
```

---

## AC-014

用户通过 Package filtering 禁用了 Skill：

```text
Anchor 可以工作
J-Space 标记 unavailable
doctor 报 ERROR
插件不得不停发送 /skill:j-space
```

---

## AC-015

运行：

```bash
npm test
npm run typecheck
```

必须全部通过。

---

# 23. 必测集成场景

开发完成后至少覆盖：

```text
V4 Pro 新 Session
V4 Flash 新 Session
非 DeepSeek Session
第一次 Tool Call
一次多 Tool Call
Text-only 首轮
Session reload
Session resume
Session fork
Model switch
Manual compaction
Threshold compaction
J-Space skill missing
Python missing
Windows 路径
macOS/Linux 路径
```

---

# 24. 最终交付物

仓库至少包含：

```text
pi-v4-jspace/
├── package.json
├── LICENSE
├── THIRD_PARTY_NOTICES.md
├── README.md
├── README.zh-CN.md
│
├── src/
│   └── ...
│
├── skills/
│   └── j-space/
│
├── vendor-meta/
│   ├── pi-dsh-minimal.json
│   └── j-space.json
│
├── tests/
│
└── docs/
    ├── REQUIREMENTS.md
    └── DESIGN.md
```

---

# 25. 开发模型必须遵守的五条红线

1. **不要用 `setActiveTools()` 代替真正的 Minimal provider payload rewrite。**

2. **不要在第一请求注入 J-Space。**

3. **不要重新发明 fast/full/loop classifier。**

4. **不要修改或缩写 J-Space SKILL/modules。**

5. **不要把 Minimal 做成永久模式；第一次 Tool Call 后必须恢复 Pi。**

违反任意一条，即视为实现方向错误。

---

# 26. 技术资料源

开发者无需自行猜测上述技术。

规范参考：

```text
Pi Extension:
https://pi.dev/docs/latest/extensions

Pi Skills:
https://pi.dev/docs/latest/skills

Pi Packages:
https://pi.dev/docs/latest/packages

pi-dsh-minimal:
https://github.com/Averyyy/pi-dsh-minimal

J-Space V3.6:
https://github.com/Tiger3807861189/J-Space-Cognition-Suite-V3.6

DeepSeek V4 × J-Space Report:
https://github.com/Tiger3807861189/DeepSeek-V4-J-Space-Capability-Realization-Report
```

实现时以上游源码为事实依据，不得根据模型记忆自行猜测 API。
