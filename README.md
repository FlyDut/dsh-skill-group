# dsh-skill-group

[中文版](README.zh.md) | [English](README.md)

<p align="center">
  <a href="https://www.npmjs.com/package/@flydut/dsh-skill-group"><img alt="npm version" src="https://img.shields.io/npm/v/@flydut/dsh-skill-group?color=2f81f7&label=npm"></a>
  <img alt="downloads" src="https://img.shields.io/npm/dm/@flydut/dsh-skill-group">
  <img alt="license" src="https://img.shields.io/npm/l/@flydut/dsh-skill-group">
  <img alt="node" src="https://img.shields.io/badge/node-%3E%3D22.19-339933">
</p>

<p align="center">
  <img src="promo/real-skill-hub.png" alt="dsh-skill-group panel" width="640">
</p>

In-GUI skill hub for [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) — browse the full `ctx.skills` catalog, toggle skills, inspect bodies, fix discovery issues, install from the market, and scaffold new ones.

> Host runs in the dsh process via official SDKs only; browser renders through official slots. No dsh source changes.

## Quick start

```bash
dsh plugin --profile web add @flydut/dsh-skill-group
# restart dsh web → Settings → 技能 → Market → scan → import
```

Requires `Node ^22.19 || >=24` + dsh web `>=0.1.7-rc.1 <0.2`.

Two surfaces — the hub panel lives at **Settings → 技能**, and the plugin's settings card lives on the plugin's own page in the **Plugins manager** (sidebar → 插件 → @flydut/dsh-skill-group). The card moved there in dsh `0.1.6-alpha.2`, when the Plugins manager replaced the old Settings → 插件 list; this plugin registers into the new location only.

## Features

**Settings → 技能** — 4 tabs: **Sources** (skills, flat/grouped + project tree), **Scenes** (custom tag groups), **Market** (install + update), **Modes** (per-preset skill isolation).

- **Browse** — every root of the `ctx.skills` registry: project / user / bundled + third-party providers. Search across name, description, `displayName`; filter by source and invocation (model / user); sort by name, added time, or usage. Same-name skills from different sources get a duplicate badge instead of silently hiding.
- **Toggle** — per-skill switches and per-group tri-state switches with a conflict dialog (close all / keep on). Disabling renames the discovery file (never deletes); disabled skills stay inspectable and re-enableable from their detail page. Only `~/.dsh/skills` & `~/.agents/skills` are writable; everything else is read-only.
- **Organize** — scenes (tags) plus auto-aggregated source collections, reordered with the ↑ / ↓ buttons in edit mode and persisted in `~/.dsh/dsh-skill-hub.json`. Edit mode reveals delete/reorder without cluttering the read view.
- **Mode isolation** — bind scenes, source collections, or individual skills to an **agent preset** (Settings → Skills → Modes). Once a mode enables isolation, only the checked skills stay visible to its sessions: both the model catalog and explicit loads stop working, and **every other mode is untouched**. No preset file is edited and no skill file is moved; turning it off restores access on the next turn.
- **Diagnose & fix** — files the provider skips (missing frontmatter, bad YAML, name mismatch, short description) show up with reasons; auto-fixable ones (e.g. unquoted `:` in descriptions) get a one-click Fix button.
- **Scaffold** — new-skill dialog (name, description, markdown body, target root) writing to `~/.dsh/skills` or `~/.agents/skills`; the frontmatter is generated from name + description, and a blank body falls back to the placeholder paragraph (`SKILL.md` template below).
- **Market** — built-in curated repos plus custom `owner/repo` sources. Any top-level directory containing `SKILL.md` scans as a root (no allowlist), and a `SKILL.md` at the repo root itself scans as a single skill named after the repo (top-level dot entries such as `.github/` count as repo tooling, not skill content). Async import with byte-level progress and cancel. Each source pins a version — click the ref badge to switch between releases, branches, or a custom ref.
- **Track updates** — imported skills record a repo + commit snapshot. Check all / update-all, per-source badges (installed / updatable / deleted upstream / new release). Sync overwrites local edits (with confirm); upstream deletions move into a restorable trash that keeps source and scene membership.
- **Stats** — per-skill call counts + last-used times from session logs (incremental cache), group summaries; window and scan interval live-configurable from the settings card.
- **Settings card** — on the plugin's own page in the **Plugins manager** (sidebar → 插件 → @flydut/dsh-skill-group): master switch, announce-to-agent, invocation dot colors, usage display toggles, stats window/interval.

## Mode-level skill isolation

A dsh agent preset decides which plugins a session composes, and each preset supplies its own
`skill-filesystem` for local discovery. **Groups** answer "how are skills organized"; **mode
isolation** answers "which modes see which skills". It is orthogonal to the global toggle:

| Concept | Scope | Semantics |
| --- | --- | --- |
| Global disable | every mode | renames the discovery file; the skill disappears everywhere (one-click restore) |
| Group (scene / source collection) | panel only | pure view, never changes availability |
| Mode isolation | one preset | soft shadow: files untouched, invisible only to that mode's sessions |

Usage: Settings → Skills → Modes → pick a mode → check groups/skills → Save. The editor shows a
live preview of how many skills stay visible in that mode.

How it works (no dsh source changes, and your preset files are never written):

1. `ctx.skills` is a scope-layered registry; an agent preset's standing mount owns one layer,
   and layer wins over rank when catalogs merge — so a host-plane shadow can never beat a
   preset's own candidates.
2. The hub uses `livePresetMounts()` to find each mounted preset's standing scope key, then
   `createScope()` with that same key: the registration lands in **that preset's layer** while
   its lifetime stays owned by the hub (unloading the plugin detaches it).
3. The gate answers with a **same-name shadow candidate** for every hidden skill: `rank: 0`
   (lowest in the layer), both invocation flags false, and `get()` always `undefined`. So
   `dsh-tool-skill`'s `<available_skills>` catalog and its `skill` tool both stop working —
   the model can neither see nor load it.
4. On a policy change the registry's catalog cache is invalidated, so it applies on the
   session's **next turn** without a restart.

Known limits:

- A preset only has a standing mount after **some session has used it**. Until then it runs
  unrestricted (the list marks it "not mounted") and attaches automatically within about five
  seconds of first use.
- Without `@deepseek-ai/dsh-agent-preset-registry` / `dsh-scope`, or if their scope semantics change,
  the whole capability degrades to a read-only preview with a stated reason. Nothing else in
  the plugin is affected.
- It is a soft shadow: the skill file stays on disk and other modes keep using it.

## Why not just the read-only browser?

[dsh-skill-manager](https://www.npmjs.com/package/dsh-skill-manager) browses, [dsh-skill-importer](https://github.com/saitamahang/dsh-skill-importer) / [dsh-find-skill](https://github.com/Moximxxx/dsh-find-skill) import. **This plugin manages.**

| Capability | read-only browser | **dsh-skill-group** |
| --- | --- | --- |
| Catalog | user roots, self-scanned | `ctx.skills` registry, all roots + third-party |
| Toggle | ❌ | ✅ per-skill + per-group, never deletes |
| Diagnostics | ❌ | ✅ reasons + one-click fix |
| Market | ❌ | ✅ built-in + custom, version pins, update-all |
| Source tracking | ❌ | ✅ check/sync/trash with restore |
| Stats | ❌ | ✅ counts + last-used |

Scaffold format (`SKILL.md`):

```markdown
---
name: my-skill
description: One line when the agent should use this skill.
---
# my-skill
Body...
```

## How it works

```text
GitHub repo ──scan/import──▶ ~/.dsh/skills
     ▲                          │
     └─check/sync/delete── ctx.skills ◀─ provider
                                │ snapshot/get
                                ▼
                    /api/skill-hub/* ──▶ Panel (Settings → 技能)
```

Host uses only `ctx.skills.snapshot/get`, `ctx.webServer.register`, `ctx.systemPrompt.section`, plus `livePresetMounts` / `createScope` for mode isolation (both official exports, loaded via dynamic `import()` and degrading on failure). Loopback-only routes (`127.0.0.1`/`localhost`), JSON.

## HTTP API

| Endpoint | Method | Purpose |
| --- | --- | --- |
| `/api/skill-hub/catalog?cwd=` | GET | skills + disabled + diagnostics + duplicates |
| `/api/skill-hub/skill?name=&cwd=` | GET | skill body (works for disabled too) |
| `/api/skill-hub/skill/delete` | POST | move to trash (snapshots source+scenes) |
| `/api/skill-hub/toggle` | POST | `{name, enabled}` |
| `/api/skill-hub/toggle-batch` | POST | `{names, enabled}` |
| `/api/skill-hub/create` | POST | `{name, description?, content?, root?}` |
| `/api/skill-hub/diagnostic/fix` | POST | `{path}` auto-fix frontmatter |
| `/api/skill-hub/stats` | GET | invocation counts |
| `/api/skill-hub/config` | GET/POST | runtime config (`null` clears) |
| `/api/skill-hub/groups` | GET | tags + collections + orders |
| `/api/skill-hub/tag` etc. | POST | create/rename, delete, set members, reorder |
| `/api/skill-hub/market` etc. | GET/POST | list/add/delete/pin/check/sync sources |
| `/api/skill-hub/market/source/versions?repo=` | GET | releases + branches for the version picker |
| `/api/skill-hub/repo?repo=` | GET | discover (any root) |
| `/api/skill-hub/repo/import` | POST | async job `{jobId, total, totalBytes}` |
| `/api/skill-hub/repo/import/progress?jobId=` | GET | poll job |
| `/api/skill-hub/repo/import/cancel` | POST | cancel job |
| `/api/skill-hub/sources` etc. | GET/POST | list/check/sync/delete/restore/clear trash |
| `/api/skill-hub/presets` | GET | mode roster + per-mode policy, counts, wiring state |
| `/api/skill-hub/scope` | POST | write a mode policy (`reset: true` deletes it) |
| `/api/skill-hub/scope/preview?presetId=` | GET | expansion detail for one mode |

Unknown paths under `/api/skill-hub/*` answer a 404 naming the path (a `prefix` catch-all keeps them inside the plugin's route table) instead of falling through to the host SPA fallback, which would answer 401 and read like an auth problem. `GET/POST /api/skill-hub/config` never echoes the GitHub token back: the token is write-only, and its presence is reported as `githubTokenSet: boolean`.

## Development

```bash
pnpm typecheck     # tsc --noEmit
pnpm test          # 336 tests, 19 suites
pnpm build         # tsc declarations + tsdown → lib/index.js + lib/client.js
```

> Don't run two `dsh web` on the same `$DSH_HOME` + cwd — no session-log lock (`seq gap` corruption). Use separate `DSH_HOME`.

## Troubleshooting

- `duplicate loader entry id: skill-hub` — remove the duplicate install (keep one `dsh plugin add` method).
- Skill missing — check the diagnostics section (frontmatter / name mismatch / short description).
- Empty source group — its skills were deleted, or their disabled records were lost (sidecar restored/hand-edited). Startup reconciles `.disabled` files on disk; source groups with no visible member are no longer rendered.
- Dots missing in `/` menu — dsh internals changed; catalog still works.
- Settings card missing — it lives in the Plugins manager (sidebar → 插件 → @flydut/dsh-skill-group), not under Settings. dsh older than `0.1.7-rc.1` is not supported at all (0.1.7 replaced the settings model this plugin is built on).

## Community

[Issues](https://github.com/FlyDut/dsh-skill-group/issues) · [Discussions](https://github.com/FlyDut/dsh-skill-group/discussions) · [Showcase](https://github.com/deepseek-ai/deepseek-harness/discussions/3161) · [Market PR](https://github.com/awesome-dsh-plugin/awesome-dsh-plugin/pull/1746) · [Discord](https://discord.gg/Ycq5dCaS4)

## License

MIT — [LICENSE](LICENSE).
