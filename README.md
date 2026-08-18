# pi-v4-jspace

DeepSeek V4 **Minimal Anchor + J-Space** runtime integration for
[Pi Coding Agent](https://pi.dev) — one package, two capabilities:

1. **Anchored Standard bootstrap** (ported from
   [pi-dsh-minimal](https://github.com/Averyyy/pi-dsh-minimal)): the first
   provider request is rewritten to the exact official DeepSeek Harness
   `minimal` surface (`You are a helpful software engineer assistant.` +
   persistent `bash` + `str_replace_editor`), then the first real tool call
   promotes back to the full Pi surface.
2. **J-Space Cognition Suite V3.6** (vendored from
   [upstream](https://github.com/Tiger3807861189/J-Space-Cognition-Suite-V3.6),
   unmodified): auto-activated once per compaction epoch via a steer
   message; J-Space itself runs its own `fast / full / loop` gate.

Non-DeepSeek-V4 models are completely untouched.

## Install

```bash
pi install npm:pi-v4-jspace      # or
pi install git:github.com/<owner>/pi-v4-jspace
```

then `/reload` (or restart pi). No other installation steps: the
`pi-dsh-minimal` adapter and the J-Space skill ship inside this package.

## How it works

```
user prompt
   │
   ▼
Request #1 ── payload rewrite ──► system: "You are a helpful software engineer assistant."
   │                              tools: bash, str_replace_editor
   ▼
first real tool call
   │
   ▼
Promote ──► restore full Pi tools + project context + AGENTS.md + skills
   │
   ▼
steer: /skill:j-space Continue the current task from the existing conversation state.
   │    Do not restart work that is already complete.
   ▼
Request #2 ── full Pi surface + J-Space SKILL.md expansion
   │
   ▼
J-Space runs its own Gate (fast / full / loop) and continues the task
```

Key behaviors:

- **Bootstrap is payload-level** — `before_provider_request` rewrites the
  assembled provider payload; it is not `setActiveTools(["bash"])`. If the
  payload shape is unrecognized, the original payload is passed through
  (fail open).
- **Promotion is tool-call based** (v1.0 fixed): text-only first rounds stay
  anchored.
- **One J-Space activation per compaction epoch** — parallel tool calls
  activate once; compaction re-anchors and the next activation uses
  long-gap recovery semantics.
- **Session state persists** via custom entries: reload / resume / fork do
  not re-activate J-Space.
- **Thinking level** is set to `max` once on model select; if you lower it,
  the status bar warns and `/v4j doctor` reports it — no fight with the user.

## Commands

| Command | Purpose |
| --- | --- |
| `/v4j` | Summary status |
| `/v4j status` | Detailed status |
| `/v4j on` / `/v4j off` | Enable / fully disable (restores original tools; history stays) |
| `/v4j reanchor` | Reset the current runtime epoch (session content untouched) |
| `/v4j doctor` | Diagnostic checklist (incl. optional J-Space verify_suite.py) |
| `/v4j dump on` / `/v4j dump off` | Toggle provider-request debug dump |

Status bar shows `v4j anchored` → `v4j promoted • jspace pending` →
`v4j promoted • jspace`, plus `v4j re-anchoring • resume` after compaction
and `v4j degraded` on activation failure.

## Configuration

`~/.pi/agent/pi-v4-jspace.json` (all fields optional):

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

`promotion` is `"tool-call"` only in v1.0; the field is kept for future
compatibility.

## Debug dump

Off by default. Enable with `/v4j dump on` (writes
`~/.pi/agent/pi-v4-jspace-dump.jsonl`) or set `PI_V4_JSPACE_DUMP=/path/file.jsonl`.

> Debug dumps may contain sensitive project or conversation content.

## Development

```bash
npm install
npm run typecheck   # tsc -p tsconfig.json
npm test            # vitest run
```

## License

MIT. Vendored components: J-Space Cognition Suite V3.6 (Apache-2.0,
unmodified, see `skills/j-space/UPSTREAM-LICENSE`) and pi-dsh-minimal
(MIT). See [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) and
`vendor-meta/` for exact source commits.
