# pi-v4-jspace

面向 [Pi Coding Agent](https://pi.dev) 的 DeepSeek V4 **Minimal Anchor + J-Space** 运行时集成插件——一个包，两项能力：

1. **Anchored Standard 引导**（移植自 [pi-dsh-minimal](https://github.com/Averyyy/pi-dsh-minimal)）：第一次 provider request 被重写为 DeepSeek Harness 官方 `minimal` 表面（`You are a helpful software engineer assistant.` + 持久 `bash` + `str_replace_editor`），第一次真实 Tool Call 后提升回完整 Pi 表面。
2. **J-Space Cognition Suite V3.6**（原样 vendored 自[上游](https://github.com/Tiger3807861189/J-Space-Cognition-Suite-V3.6)，未做任何修改）：每个 compaction epoch 通过 steer 消息自动激活一次；fast / full / loop 的 Gate 由 J-Space 自己运行。

非 DeepSeek V4 模型完全不受影响。

## 安装

```bash
pi install npm:pi-v4-jspace      # 或
pi install git:github.com/<owner>/pi-v4-jspace
```

然后 `/reload`（或重启 pi）。无需其他安装步骤：pi-dsh-minimal 适配器与 J-Space Skill 都随包自带。

## 工作原理

```
用户任务
   │
   ▼
请求 #1 ── payload 重写 ──► system: "You are a helpful software engineer assistant."
   │                        tools: bash, str_replace_editor
   ▼
第一次真实 Tool Call
   │
   ▼
Promote ──► 恢复完整 Pi 工具 + 项目上下文 + AGENTS.md + Skill 目录
   │
   ▼
steer: /skill:j-space Continue the current task from the existing conversation state.
   │    Do not restart work that is already complete.
   ▼
请求 #2 ── 完整 Pi 表面 + J-Space SKILL.md 展开
   │
   ▼
J-Space 自行运行 Gate（fast / full / loop）并继续原任务
```

关键行为：

- **Bootstrap 是 payload 级重写**——在 `before_provider_request` 重写已组装的 provider payload，而不是 `setActiveTools(["bash"])`。无法识别 payload 结构时原样透传（fail open）。
- **Promote 以 tool-call 为准**（v1.0 固定）：首轮纯文字不会提升。
- **每个 compaction epoch 只激活一次 J-Space**——并行多工具调用只激活一次；compaction 后重新锚定，下一次激活使用 long-gap recovery 语义。
- **会话状态持久化**（custom entries）：reload / resume / fork 不会重复激活 J-Space。
- **Thinking 级别**在模型选中时设置一次 `max`；你手动调低后状态栏会警告、`/v4j doctor` 会报告——不与用户反复争夺。

## 命令

| 命令 | 用途 |
| --- | --- |
| `/v4j` | 状态摘要 |
| `/v4j status` | 详细状态 |
| `/v4j on` / `/v4j off` | 启用 / 完全关闭（恢复原始工具；历史内容保留） |
| `/v4j reanchor` | 重置当前 Runtime Epoch（不动会话内容） |
| `/v4j doctor` | 诊断清单（含可选的 J-Space verify_suite.py） |
| `/v4j dump on` / `/v4j dump off` | 开关 provider request 调试转储 |

状态栏依次显示 `v4j anchored` → `v4j promoted • jspace pending` → `v4j promoted • jspace`；compaction 后为 `v4j re-anchoring • resume`，激活失败为 `v4j degraded`。

## 配置

`~/.pi/agent/pi-v4-jspace.json`（所有字段均可省略）：

```json
{
  "enabled": true,
  "modelPatterns": ["deepseek-v4-pro", "deepseek-v4-flash"],
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

v1.0 中 `promotion` 仅支持 `"tool-call"`；字段保留是为后续兼容。

## 调试转储

默认关闭。用 `/v4j dump on` 开启（写入 `~/.pi/agent/pi-v4-jspace-dump.jsonl`），或设置环境变量 `PI_V4_JSPACE_DUMP=/path/file.jsonl`。

> 调试转储可能包含敏感的项目或对话内容。

## 开发

```bash
npm install
npm run typecheck   # tsc -p tsconfig.json
npm test            # vitest run
```

## 许可证

MIT。内置组件：J-Space Cognition Suite V3.6（Apache-2.0，原样未改，见 `skills/j-space/UPSTREAM-LICENSE`）与 pi-dsh-minimal（MIT）。精确源码 commit 见 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) 与 `vendor-meta/`。
