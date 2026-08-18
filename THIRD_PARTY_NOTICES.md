# THIRD PARTY NOTICES

`pi-v4-jspace` bundles or ports code from the following projects. License
obligations are preserved; full license texts are kept in the vendored
directories.

---

## pi-dsh-minimal

- **Project:** <https://github.com/Averyyy/pi-dsh-minimal>
- **Version:** 0.4.1
- **Source commit:** `2ba59c1144fa99b1ba4e17c9f8ce2cee27295036`
- **License:** MIT

The Anchor Engine in `src/anchor/` and `src/dsh/` is ported from this
project's verified adapter/tool implementation. Its `NOTICE` file states:

> pi-dsh-minimal ports model-facing surfaces from:
>
> <https://github.com/deepseek-ai/deepseek-harness>
> commit 47f943859bef60e4160492346772ded9b24f765a
>
> That official `minimal` surface is:
>
> - the complete system prompt
>     `You are a helpful software engineer assistant.`
> - persistent `bash` (`@deepseek-ai/dsh-tool-bash-persistent`)
> - `str_replace_editor` (`@deepseek-ai/dsh-tool-str-replace-editor`)
>
> including the official tool descriptions, JSON parameter schemas, and
> the editor's view / create / str_replace / insert result strings.
>
> The V4 Pro two-phase schedule follows the measured
> `dsh-anchored-standard` bootstrap (first request = official two-tool
> schema, later requests restore the host catalog after a durable
> promotion signal):
>
> <https://github.com/xiaobright/dsh-anchored-standard>
>
> DeepSeek Harness is distributed under the MIT License:
>
> Copyright (c) 2026 DeepSeek
>
> The full MIT permission notice is included in this repository's LICENSE file.
>
> DeepSeek and DeepSeek Harness are names of their respective owner. This
> community project is not affiliated with or endorsed by DeepSeek.

## J-Space Cognition Suite

- **Project:** <https://github.com/Tiger3807861189/J-Space-Cognition-Suite-V3.6>
- **Version:** 3.6
- **Source commit:** `bd319d8a86d176ee12adb7bba5c3dae716a768a0`
- **License:** Apache License 2.0

`skills/j-space/` is an exact, unmodified snapshot of the upstream `j-space/`
directory (SKILL.md, modules/, references/, scripts/). The upstream license
text is preserved at `skills/j-space/UPSTREAM-LICENSE`. See
`vendor-meta/j-space.json` for vendoring metadata.

## DeepSeek Harness

- **Project:** <https://github.com/deepseek-ai/deepseek-harness>
- **Source commit (per pi-dsh-minimal NOTICE):** `47f943859bef60e4160492346772ded9b24f765a`
- **License:** MIT (Copyright (c) 2026 DeepSeek)

The official `minimal` persona, persistent bash tool, and
`str_replace_editor` tool descriptions / JSON schemas originate from
DeepSeek Harness and are inherited via pi-dsh-minimal's MIT port.

---

## Security & Privacy

`pi-v4-jspace` sends no telemetry, makes no network requests, and uploads
nothing. Debug dumps (when explicitly enabled) may contain provider request
surfaces, prompts, or tool schemas and are written only to a local file.
