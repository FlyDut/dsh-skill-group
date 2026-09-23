# Contributing

Thanks for considering a contribution to **dsh-skill-hub**. This project is a
[DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) (dsh) plugin with two halves:

- the **host half** (`src/index.ts` + `src/routes.ts`) runs in the dsh process and speaks only official
  dsh SDKs, and
- the **browser half** (`src/client/`) renders inside the web GUI through official slots.

Please keep both halves on official APIs — no dsh source patches.

## Layers

Every module belongs to exactly one of four responsibility chains, and data only
flows downward. Put new code where its duty lives, not where it is convenient:

| Layer | Duty | Modules |
| --- | --- | --- |
| **Discovery** | what skills exist (read-only) | `skillfs/`, `provider.ts` |
| **Curation** | what the user wants the skill world to look like (pure data + pure functions) | `store/`, `domain/`, `protocol/` |
| **Enforcement** | turning curation into runtime effect (all side effects) | `enforcement/`, plus the toggle rename in `routes/catalog.ts` |
| **Surface** | letting the user express and see it | `routes/`, `client/` |

The two curation/enforcement concepts are deliberately distinct — do not merge them:

- **Disabled** (hard) renames the discovery file, so the skill is gone in *every* mode.
- **Scope** (soft) shadows the skill inside one agent preset's standing scope layer,
  leaving the file untouched and every other mode unaffected.

Anything with a side effect belongs in `enforcement/`; `domain/` must stay free of IO so
its judgments can be exhaustively unit-tested (see `domain/scope-policy.test.ts`).

## Layout

```
src/index.ts            cordis plugin entry (config schema, settings namespace, stats wiring)
src/routes.ts           route-family aggregator (wraps every domain handler in the shared fences)
src/routes/             one file per domain + shared layers:
                        http.ts (fences/JSON/error mapping), deps.ts (route deps + writable-skill
                        resolution), catalog-data.ts (catalog/detail assembly), collection.ts
                        (origin collections), route-state.ts (throttles + import-job table),
                        helpers.ts (barrel)
src/store.ts            sidecar store barrel (paths / migrate / store)
src/skillfs.ts          writable-root file ops + barrel (skillfs/paths.ts, frontmatter.ts, scan.ts)
src/repo.ts             GitHub repo helpers barrel (repo/types.ts, discovery.ts, api.ts, install.ts,
                        github-client.ts = shared request layer)
src/stats.ts            session-log statistics reader + barrel (stats/persistence.ts, stats/scan.ts)
src/provider.ts         the hub's own ctx.skills provider (global layer) — discovery layer
src/domain/             curation semantics, zero IO (scope-policy expansion, scope-view cache)
src/enforcement/        curation → runtime: preset-gate.ts (the shadowing provider),
                        scope-wiring.ts (attaches gates to preset scope layers), roster.ts
                        (preset roster projection), scope-mechanism.test.ts (the dsh contract
                        this whole feature rests on — read it before changing wiring)
src/protocol.ts         wire contract barrel (protocol/<domain>.ts; scopes.ts carries the
                        mode-isolation model shared by host and browser)
src/concurrency.ts      bounded-concurrency map
src/error-text.ts       unknown → one-line error text
src/client/index.tsx    browser-half entry (slots + locale registration)
src/client/api.ts       the panel's only data access path
src/client/panel/       panel shell, views, dialogs, hooks/ (one hook per domain + aggregator)
src/client/locales/     dictionaries by view (common/skills/market/sources/detail/settings)
```

## Development setup

```bash
npm install
npm run typecheck   # tsc --noEmit
npm test            # vitest (332 tests across 19 suites)
npm run build       # tsc declarations + tsdown bundles (lib/index.js + lib/client.js)
npm run smoke       # load the built bundle in a real cordis runtime (run after build)
```

`npm run smoke` boots `lib/index.js` inside a minimal cordis host with stand-ins for
`webServer` / `skills` / `systemPrompt` / `settings` / `agentPresets`, then drives the real
route handlers. It catches what unit tests cannot: a bundle that fails to load, a route
registered twice, a teardown that leaves residue. Prefer it before publishing.

## Before opening a pull request

1. **Typecheck** — `npm run typecheck` must pass.
2. **Tests** — `npm test` must pass; add/adjust tests for any behavior change. Suites sit next to the
   code they cover (`src/*.test.ts`, `src/routes/*.test.ts`) and mirror the real
   route/store/filesystem/provider behavior. The browser half has no component-test harness
   (vitest runs in the node environment); keep browser changes mechanical and verify them in the
   live GUI.
3. **Build** — `npm run build` must produce `lib/index.js` and `lib/client.js`.
4. **Keep the diff focused** — one logical change per PR, with a clear title and description.
5. **Documentation** — update `README.md` **and** `README.zh.md` (both ship with the package and are
   kept in sync) when behavior or the API surface changes.

## Code style

- TypeScript, strict mode. ESM (`"type": "module"`).
- Host routes are loopback-only by construction — keep the trust fence intact.
- The browser half uses CSS Modules; keep the settings-card chrome family-bucket-compatible.
- Comments explain *why* (routing decisions, dsh host behaviors) more than *what*.

## Testing the plugin in a live dsh web GUI

```bash
# after a change:
npm run build
# restart the dsh web process, then verify both surfaces:
#   Settings → 技能              — the skill hub panel
#   sidebar 插件 → dsh-skill-hub  — the plugin's settings card
```

When the web profile installs this repo as a link (`"dsh-skill-hub": "link:/path/to/repo"`, the
usual local-dev setup), `lib/` is picked up on the next `dsh web` restart — no copy step needed.

## Issues

- **Bugs**: include the dsh version, Node version, the plugin version, and the exact steps.
- **Feature requests**: describe the workflow you are trying to accomplish; a short motivation helps
  scope the change.

## License

By contributing, you agree that your contributions will be licensed under the
[MIT License](LICENSE).
