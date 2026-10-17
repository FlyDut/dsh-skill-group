window.__ModuleLoader__.load({
	id: "dsh-skill-group",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
		let react = require("react");
		let react_jsx_runtime = require("react/jsx-runtime");
		//#region src/protocol/api.ts
		/** Browser-facing base paths of the skill-hub API family. */
		const SKILL_HUB_API = {
			catalog: "/api/skill-hub/catalog",
			skill: "/api/skill-hub/skill",
			toggle: "/api/skill-hub/toggle",
			toggleBatch: "/api/skill-hub/toggle-batch",
			create: "/api/skill-hub/create",
			/** 删除磁盘上的技能本体（仅限用户级可写根，用户确认后才会调用）。 */
			skillDelete: "/api/skill-hub/skill/delete",
			stats: "/api/skill-hub/stats",
			config: "/api/skill-hub/config",
			market: "/api/skill-hub/market",
			marketSource: "/api/skill-hub/market/source",
			marketSourceDelete: "/api/skill-hub/market/source/delete",
			marketSourceRef: "/api/skill-hub/market/source/ref",
			marketCheck: "/api/skill-hub/market/check",
			marketSync: "/api/skill-hub/market/source/sync",
			repo: "/api/skill-hub/repo",
			repoImport: "/api/skill-hub/repo/import",
			repoImportProgress: "/api/skill-hub/repo/import/progress",
			repoImportCancel: "/api/skill-hub/repo/import/cancel",
			groups: "/api/skill-hub/groups",
			tag: "/api/skill-hub/tag",
			tagDelete: "/api/skill-hub/tag/delete",
			tagMembers: "/api/skill-hub/tag/members",
			sources: "/api/skill-hub/sources",
			sourceCheck: "/api/skill-hub/sources/check",
			sourceSync: "/api/skill-hub/sources/sync",
			diagnosticFix: "/api/skill-hub/diagnostic/fix",
			marketSourceVersions: "/api/skill-hub/market/source/versions",
			marketStats: "/api/skill-hub/market/stats",
			/** 模式级技能隔离：preset 名单 + 每条的接线状态与策略。 */
			presets: "/api/skill-hub/presets",
			/** 写入某个模式的策略（部分更新；`reset: true` 删除策略）。 */
			scope: "/api/skill-hub/scope",
			/** 读取某个模式的可见性展开明细（面板预览）。 */
			scopePreview: "/api/skill-hub/scope/preview",
			/** 工作区名单 + 每个工作区的策略与展开计数。 */
			workspaces: "/api/skill-hub/workspaces",
			/** 写入某个工作区的策略（部分更新；`reset: true` 删除策略）。 */
			workspace: "/api/skill-hub/workspace"
		};
		//#endregion
		//#region src/protocol/config.ts
		/**
		* 本插件的 Loader 入口 id —— dsh 0.1.7 起 settings 的命名空间就是它（不是包名）。
		* 它是 cordis.patch.yml 的 insert id，宿主与浏览器半边共用这份契约：宿主经
		* `settings.mutate(HUB_ENTRY_ID, …)` 写入，浏览器半边经
		* `ctx.configForms.get(HUB_ENTRY_ID)` 读到同一份表单。
		*/
		const HUB_ENTRY_ID = "skill-hub";
		//#endregion
		//#region src/protocol/scopes.ts
		/**
		* 技能可见性策略（Scope）的共享契约：模式策略与工作区策略的数据模型、分组键
		* 的构造与解析、以及 /presets、/scope、/workspaces、/workspace 端点的载荷形状。
		*
		* 两种策略的形状与语义完全相同（白名单），只是主体不同：模式策略按 preset 约束
		* 会话，工作区策略按 DSH 工作区约束会话。两者是**覆盖**关系：工作区启用隔离时
		* 由它独占生效，否则按模式策略，见 domain/scope-policy.ts 的 overridePolicyEntries。
		*
		* 这一层**不依赖任何宿主 SDK**：宿主半边（`domain/`、`enforcement/`、
		* `routes/`）与浏览器半边（面板）都从这里 import 同一个词汇表，避免两侧对
		* "分组键长什么样"各写一份而漂移。
		*/
		/** 分组键前缀。一个键要么指向一个分组，要么指向单个技能名。 */
		const SCOPE_ENTRY_PREFIX = {
			/** 场景 tag：`tag:<tagId>`。 */
			tag: "tag:",
			/** 来源集合（origin）：`col:<collectionName>`。 */
			col: "col:",
			/** 来源根：`src:<source>`（user-dsh / project-dsh / …）。 */
			src: "src:",
			/** 单个技能：`skill:<name>`。 */
			skill: "skill:"
		};
		/** 场景 tag 的分组键。 */
		function tagKey(id) {
			return SCOPE_ENTRY_PREFIX.tag + id;
		}
		/** 来源集合（origin）的分组键。 */
		function collectionKey(name) {
			return SCOPE_ENTRY_PREFIX.col + name;
		}
		/** 来源根的分组键。 */
		function sourceKey(source) {
			return SCOPE_ENTRY_PREFIX.src + source;
		}
		/**
		* 拆一个分组键。
		* @param key - 待解析的键。
		* @returns 前缀种类与剩余标识；无法识别时返回 undefined（该键被当成悬空项）。
		*/
		function parseScopeEntry(key) {
			for (const kind of Object.keys(SCOPE_ENTRY_PREFIX)) {
				const prefix = SCOPE_ENTRY_PREFIX[kind];
				if (key.startsWith(prefix) && key.length > prefix.length) return {
					kind,
					value: key.slice(prefix.length)
				};
			}
		}
		//#endregion
		//#region src/client/api.ts
		/**
		* Browser-side API client for the /api/skill-hub route family. The only
		* data access path the panel uses — plain fetch, same origin.
		*/
		/**
		* Error carrying the route's JSON error message and its HTTP status. The
		* status is part of the contract so callers can branch on "this host is too
		* old to know that route" (404) without string-sniffing the message text.
		*/
		var SkillHubApiError = class extends Error {
			/** HTTP status of the failed response (0 when the request never completed). */
			status;
			constructor(message, status = 0) {
				super(message);
				this.name = "SkillHubApiError";
				this.status = status;
			}
		};
		/**
		* True when the host has no such route at all (an older host). Callers use it
		* to degrade gracefully — skip an optional probe — instead of sniffing
		* "404"/"not found" out of the human-readable message.
		*/
		function isMissingRoute(error) {
			return error instanceof SkillHubApiError && error.status === 404;
		}
		/** Parse a JSON response or throw a SkillHubApiError. */
		async function readJson(response) {
			let body;
			try {
				body = await response.json();
			} catch {
				throw new SkillHubApiError("HTTP " + response.status + ": invalid JSON response", response.status);
			}
			if (!response.ok) throw new SkillHubApiError(typeof body === "object" && body !== null && typeof body.error === "string" ? body.error : "HTTP " + response.status, response.status);
			return body;
		}
		/**
		* Fetch with a hard timeout: a hung connection (proxy, stalled keep-alive,
		* host wedged) must never leave the panel stuck on "loading" forever — it
		* fails fast and surfaces the error banner instead.
		*/
		async function fetchWithTimeout(input, init, ms = 1e4) {
			const controller = new AbortController();
			const timer = setTimeout(() => controller.abort(), ms);
			try {
				return await fetch(input, {
					...init,
					signal: controller.signal
				});
			} finally {
				clearTimeout(timer);
			}
		}
		/** The browser half's only data entry point. */
		var SkillHubApi = class {
			async get(path, query = "", ms) {
				return readJson(await fetchWithTimeout(path + query, void 0, ms));
			}
			/** One POST round trip (body omitted for routes that take none). */
			async post(path, body, ms) {
				return readJson(await fetchWithTimeout(path, body !== void 0 ? {
					method: "POST",
					headers: { "content-type": "application/json" },
					body: JSON.stringify(body)
				} : { method: "POST" }, ms));
			}
			/** The full local catalog (runtime switch state + discovery diagnostics). */
			catalog() {
				return this.get(SKILL_HUB_API.catalog);
			}
			/** One skill's detail. */
			async skill(name) {
				return (await this.get(SKILL_HUB_API.skill, "?name=" + encodeURIComponent(name))).skill;
			}
			/**
			* Switch one skill on or off; resolves with the fresh catalog from the
			* route. The switch lives in the hub's sidecar and is enforced at runtime —
			* no skill file is renamed or removed.
			*/
			async toggle(name, enabled) {
				return (await this.post(SKILL_HUB_API.toggle, {
					name,
					enabled
				})).catalog;
			}
			create(payload) {
				return this.post(SKILL_HUB_API.create, payload);
			}
			/**
			* Delete skills from disk. Destructive and irreversible: the panel only calls
			* this after the user confirms a staged deletion. Unknown/read-only names come
			* back in `failures`; the fresh catalog is returned either way.
			*/
			deleteSkills(names) {
				const payload = { names };
				return this.post(SKILL_HUB_API.skillDelete, payload);
			}
			stats() {
				return this.get(SKILL_HUB_API.stats);
			}
			/** Toggle a whole group in one write; resolves with the fresh catalog + failures. */
			toggleBatch(names, enabled) {
				const payload = {
					names,
					enabled
				};
				return this.post(SKILL_HUB_API.toggleBatch, payload);
			}
			/** The user's added market sources. */
			market() {
				return this.get(SKILL_HUB_API.market);
			}
			/** Add a market source repo; resolves with the fresh list. */
			addMarketSource(repo) {
				return this.post(SKILL_HUB_API.marketSource, { repo });
			}
			/** Remove a market source repo; resolves with the fresh list. */
			removeMarketSource(repo) {
				return this.post(SKILL_HUB_API.marketSourceDelete, { repo });
			}
			/** Stars + downloads per market source (hourly server-side cache; refresh=1 refetches stale entries). */
			marketStats(refresh = false) {
				const query = refresh ? "?refresh=1" : "";
				return this.get(SKILL_HUB_API.marketStats, query, refresh ? 6e4 : void 0);
			}
			/** Check every market source for updates (throttled server-side). */
			marketCheck() {
				return this.get(SKILL_HUB_API.marketCheck);
			}
			/** Align a market source to its pinned ref; resolves with tracked skills. */
			marketSync(repo) {
				return this.post(SKILL_HUB_API.marketSync, { repo });
			}
			/** Releases + branches of a market source for the version picker. */
			marketSourceVersions(repo) {
				return this.get(SKILL_HUB_API.marketSourceVersions, "?repo=" + encodeURIComponent(repo));
			}
			/** Pin a market source to an explicit ref (branch picker). */
			setMarketSourceRef(repo, ref) {
				return this.post(SKILL_HUB_API.marketSourceRef, {
					repo,
					ref
				});
			}
			/** Discover importable skills in a GitHub repo. */
			repoDiscover(repo) {
				return this.get(SKILL_HUB_API.repo, "?repo=" + encodeURIComponent(repo));
			}
			/** Install selected repo skills into the user-dsh root (records the source). Returns jobId for polling. */
			repoImport(repo, paths, ref) {
				const payload = {
					repo,
					paths,
					...ref !== void 0 && ref !== "" ? { ref } : {}
				};
				return this.post(SKILL_HUB_API.repoImport, payload);
			}
			/** Poll import job progress (B方案轮询) */
			repoImportProgress(jobId) {
				return this.get(SKILL_HUB_API.repoImportProgress, "?jobId=" + encodeURIComponent(jobId));
			}
			/** Cancel a running import job (选项2：唯有取消才停) */
			repoImportCancel(jobId) {
				return this.post(SKILL_HUB_API.repoImportCancel, { jobId });
			}
			/** Read the hub's runtime config (effective values + saved overrides). */
			config() {
				return this.get(SKILL_HUB_API.config);
			}
			/** 用户 tag 分组 + 系统集合组 + origin 映射。 */
			groups() {
				return this.get(SKILL_HUB_API.groups);
			}
			/** 新建（无 id）或重命名（带 id）一个 tag 分组；返回全部 tag。 */
			async saveTag(payload) {
				return (await this.post(SKILL_HUB_API.tag, payload)).tags;
			}
			/** 删除一个 tag 分组；返回全部 tag。 */
			async deleteTag(id) {
				return (await this.post(SKILL_HUB_API.tagDelete, { id })).tags;
			}
			/** 直接设置某 tag 的完整成员列表；返回全部 tag。 */
			async setTagMembers(id, skillNames) {
				return (await this.post(SKILL_HUB_API.tagMembers, {
					id,
					skillNames
				})).tags;
			}
			/** 来源列表 + 派生 origin 映射 + 集合组。 */
			sources() {
				return this.get(SKILL_HUB_API.sources);
			}
			/** 检查指定（或全部）来源的上游更新。 */
			checkSources(repo) {
				const payload = repo !== void 0 ? { repo } : {};
				return this.post(SKILL_HUB_API.sourceCheck, payload);
			}
			/** 同步一个来源的所选（或全部）技能到上游最新版本。 */
			syncSource(repo, skills) {
				const payload = skills !== void 0 ? {
					repo,
					skills
				} : { repo };
				return this.post(SKILL_HUB_API.sourceSync, payload);
			}
			/** Auto-fix a fixable diagnostic (e.g. unquoted colon). */
			fixDiagnostic(path) {
				return this.post(SKILL_HUB_API.diagnosticFix, { path });
			}
			/** 模式名单 + 每个模式的策略、可见/隐藏计数与接线状态。 */
			presets() {
				return this.get(SKILL_HUB_API.presets);
			}
			/** 写入某个模式的策略（部分更新；reset 删除策略）。 */
			saveScope(payload) {
				return this.post(SKILL_HUB_API.scope, payload);
			}
			/** DSH 工作区名单 + 每个工作区的策略、可见/隐藏计数。 */
			workspaces() {
				return this.get(SKILL_HUB_API.workspaces);
			}
			/** 写入某个工作区的策略（部分更新；reset 删除策略）。 */
			saveWorkspace(payload) {
				return this.post(SKILL_HUB_API.workspace, payload);
			}
		};
		//#endregion
		//#region src/client/locales/common.ts
		/** 面板框架与通用：入口/视图切换/面板/图例/报错/更新检查/新建表单/诊断修复。从 locales.ts 按前缀拆出，键集合不变。 */
		const zhCommon = {
			"entry.label": "技能分组",
			"view.sources": "来源",
			"view.scenes": "场景",
			"view.market": "市场",
			"view.flat": "平铺",
			"view.grouped": "分组",
			"panel.title": "技能分组",
			"panel.count": "共 {count} 个技能",
			"panel.disabledCount": "已关闭 {count}",
			"panel.new": "新建",
			"panel.search": "搜索技能…",
			"legend.model": "模型可调 — Agent 可自动调用",
			"legend.user": "用户可调 — 仅显式点名时触发",
			"legend.hint": "每个技能最多一个圆点；无圆点 = 不可被调用。",
			"panel.disabled": "已关闭",
			"panel.diagnostics": "发现诊断",
			"panel.empty": "没有匹配的技能。",
			"panel.emptyAll": "本地还没有技能。点击「新建技能」创建第一个。",
			"panel.loading": "读取中…",
			"panel.incomplete": "（目录可能不完整）",
			"diag.fix": "修复",
			"diag.fixing": "修复中…",
			"diag.fixed": "已修复",
			"diag.fixConfirm": "用自动修复重写以下文件的 frontmatter？建议先备份：{path}",
			"form.descPlaceholder": "一句话说明用途（含触发词），Agent 靠它自动激活技能",
			"form.title": "新建技能",
			"form.name": "技能名（kebab-case，如 code-review）",
			"form.desc": "描述（一句话路由说明）",
			"form.content": "技能内容（正文；frontmatter 由技能名与描述自动生成）",
			"form.contentPlaceholder": "写清楚这个技能做什么、什么时候该用、期望输出什么。留空则写入占位说明。",
			"form.root": "目标目录",
			"form.submit": "创建",
			"form.cancel": "取消",
			"form.busy": "创建中…",
			"form.success": "已创建：",
			"form.error": "创建失败：",
			"err.dismiss": "知道了"
		};
		const enCommon = {
			"entry.label": "Skill Groups",
			"view.sources": "Sources",
			"view.scenes": "Scenes",
			"view.market": "Market",
			"view.flat": "Flat",
			"view.grouped": "Grouped",
			"panel.title": "Skill Groups",
			"panel.count": "{count} skills total",
			"panel.disabledCount": "{count} switched off",
			"panel.new": "New",
			"panel.search": "Search skills…",
			"legend.model": "Model-invocable — agents may call automatically",
			"legend.user": "User-invocable — explicit invocation only",
			"legend.hint": "At most one dot per skill; no dot = not invocable.",
			"panel.disabled": "Switched off",
			"panel.diagnostics": "Discovery diagnostics",
			"panel.empty": "No matching skills.",
			"panel.emptyAll": "No skills installed yet. Create the first one.",
			"panel.loading": "Loading…",
			"panel.incomplete": "(catalog may be incomplete)",
			"diag.fix": "Fix",
			"diag.fixing": "Fixing…",
			"diag.fixed": "Fixed",
			"diag.fixConfirm": "Rewrite the frontmatter of this file with the auto-fix? Back it up first: {path}",
			"form.descPlaceholder": "One line on what it does (with trigger words) — agents auto-activate from this",
			"form.title": "New skill",
			"form.name": "Skill name (kebab-case, e.g. code-review)",
			"form.desc": "Description (one routing sentence)",
			"form.content": "Skill content (body; the frontmatter is generated from name and description)",
			"form.contentPlaceholder": "Spell out what it does, when to use it, and what output is expected. Blank writes a placeholder paragraph.",
			"form.root": "Target root",
			"form.submit": "Create",
			"form.cancel": "Cancel",
			"form.busy": "Creating…",
			"form.success": "Created: ",
			"form.error": "Create failed: ",
			"err.dismiss": "Dismiss"
		};
		//#endregion
		//#region src/client/locales/detail.ts
		/** 技能详情。从 locales.ts 按前缀拆出，键集合不变。 */
		const zhDetail = {
			"detail.copyMention": "复制 $mention",
			"detail.copyPath": "复制路径",
			"detail.copied": "已复制",
			"detail.back": "返回列表",
			"detail.provider": "提供者",
			"detail.addedAt": "添加时间",
			"detail.updatedAt": "更新时间",
			"detail.path": "路径",
			"detail.whenToUse": "适用场景",
			"detail.uses": "调用次数",
			"detail.groups": "所属场景",
			"detail.loading": "读取技能正文…"
		};
		const enDetail = {
			"detail.copyMention": "Copy $mention",
			"detail.copyPath": "Copy path",
			"detail.copied": "Copied",
			"detail.back": "Back to list",
			"detail.provider": "Provider",
			"detail.addedAt": "Added",
			"detail.updatedAt": "Updated",
			"detail.path": "Path",
			"detail.whenToUse": "When to use",
			"detail.uses": "Uses",
			"detail.groups": "Groups",
			"detail.loading": "Loading skill body…"
		};
		//#endregion
		//#region src/client/locales/market.ts
		/** 市场与仓库扫描导入。从 locales.ts 按前缀拆出，键集合不变。 */
		const zhMarket = {
			"market.syncHint": "将同步到上游最新版并提示可更新的本地技能",
			"market.addPlaceholder": "owner/repo 或 https://github.com/…",
			"market.addSource": "添加源",
			"market.noSources": "还没有市场源。从下方内置市场添加，或输入一个 GitHub 仓库。",
			"market.title": "市场",
			"market.catalogHint": "精选技能仓库，添加后即可扫描安装，并持续检查更新。",
			"market.catalog.anthropics": "Anthropic 官方技能合集（Claude Skills）",
			"market.catalog.superpowers": "Superpowers 社区技能合集",
			"market.catalog.mattpocock": "Matt Pocock 技能集",
			"market.catalog.openDesign": "设计技能合集（design-templates）",
			"market.add": "添加",
			"market.updatable": "可更新 {count}",
			"market.deletedUpstream": "上游已删 {count}",
			"market.checkAll": "检查全部",
			"market.updateAll": "全部更新",
			"market.updateAllConfirmTitle": "批量更新全部技能？",
			"market.updateAllConfirmText": "将把以下来源的可更新技能更新到上游最新版本（覆盖本地修改）：",
			"market.updateAllItem": "{repo}（{count} 个技能）",
			"market.updateAllDone": "已更新 {count} 个来源",
			"market.deleteSource": "移除源",
			"market.scan": "扫描",
			"market.scanning": "扫描中…",
			"market.checkUpdate": "检查更新",
			"market.checking": "检查中…",
			"market.upToDate": "已是最新",
			"market.update": "更新",
			"market.updateCount": "更新 {count} 个",
			"market.syncing": "同步中…",
			"market.updated": "有更新",
			"market.newRelease": "新版本 v{version}",
			"market.branchTitle": "选择分支",
			"market.branchHint": "该仓库没有正式发布，选择要跟踪的分支（默认为 main）：",
			"market.branchConfirm": "确定",
			"market.versionTitle": "切换跟踪版本",
			"market.versionText": "选择 {repo} 要跟踪的版本；切换后建议重新扫描并同步",
			"market.versionCurrent": "当前 {ref}",
			"market.versionReleases": "发布版",
			"market.versionBranches": "分支",
			"market.versionCustom": "自定义（tag / 分支 / commit）",
			"market.versionConfirm": "切换到 {ref}",
			"market.versionHint": "点击切换跟踪版本",
			"market.unpinned": "未定版",
			"market.starsHint": "GitHub 星标 {count} 个",
			"market.downloadsHint": "发布附件累计下载 {count} 次",
			"market.syncTitle": "同步本地技能",
			"market.syncText": "市场源已对齐到 {ref}，要同步更新以下本地技能吗？",
			"market.syncNone": "该来源还没有导入本地技能。",
			"market.syncCancel": "跳过",
			"market.removeHint": "移除源不影响已安装的技能。",
			"repo.scanTitle": "扫描结果",
			"repo.close": "关闭",
			"repo.searchPlaceholder": "搜索技能名…",
			"repo.allRoots": "全部 {count}",
			"repo.selection": "已选 {selected}/{total} · {size} · 显示 {shown}/{filtered}（过滤后）",
			"repo.noMatch": "无匹配技能",
			"repo.loadMore": "加载更多 {step} (剩余 {remaining})",
			"repo.skillProgress": "{done}/{total} 个技能",
			"repo.ready": "发现 {count} 个可导入技能",
			"repo.truncated": "⚠ 仓库过大，仅展示部分技能（GitHub 截断），可缩小仓库或指定子目录",
			"repo.empty": "没有找到可导入技能。",
			"repo.selectVisible": "全选当前显示",
			"repo.selectAllN": "全选全部 {count}",
			"repo.clearAll": "清空",
			"repo.import": "导入所选 ({count})",
			"repo.importing": "导入中…",
			"repo.existing": "已存在",
			"repo.files": "{count} 个文件 · {size}",
			"repo.imported": "导入成功 {count} 个",
			"repo.skippedExisting": "跳过已存在 {count} 个",
			"repo.failed": "失败 {count} 个",
			"repo.cancel": "取消",
			"repo.cancelled": "已取消 · 已导入 {imported}/{total} 已保留，临时文件已清理",
			"repo.importingCurrent": "正在导入: {name} ({done}/{total})",
			"repo.root.self": "仓库根",
			"repo.root.skills": "skills",
			"repo.root.designTemplates": "design-templates",
			"repo.root.generic": "{root}"
		};
		const enMarket = {
			"market.syncHint": "Sync to the latest upstream and report local skills that can update",
			"market.addPlaceholder": "owner/repo or https://github.com/…",
			"market.addSource": "Add source",
			"market.noSources": "No market sources yet. Add one from the built-in catalog below, or enter a GitHub repo.",
			"market.title": "Market",
			"market.catalogHint": "Curated skill repos — add one to scan and install, with ongoing update checks.",
			"market.catalog.anthropics": "Official Anthropic skill collection (Claude Skills)",
			"market.catalog.superpowers": "Superpowers community skill collection",
			"market.catalog.mattpocock": "Matt Pocock skill collection",
			"market.catalog.openDesign": "Design skill collection (design-templates)",
			"market.add": "Add",
			"market.updatable": "{count} updatable",
			"market.deletedUpstream": "{count} deleted upstream",
			"market.checkAll": "Check all",
			"market.updateAll": "Update all",
			"market.updateAllConfirmTitle": "Update every skill?",
			"market.updateAllConfirmText": "The updatable skills of these sources will be overwritten with their latest upstream versions:",
			"market.updateAllItem": "{repo} ({count} skills)",
			"market.updateAllDone": "Updated {count} sources",
			"market.deleteSource": "Remove source",
			"market.scan": "Scan",
			"market.scanning": "Scanning…",
			"market.checkUpdate": "Check for updates",
			"market.checking": "Checking…",
			"market.upToDate": "Up to date",
			"market.update": "Update",
			"market.updateCount": "Update {count}",
			"market.syncing": "Syncing…",
			"market.updated": "Updates available",
			"market.newRelease": "New release v{version}",
			"market.branchTitle": "Choose a branch",
			"market.branchHint": "This repo has no releases. Pick a branch to track (main by default):",
			"market.branchConfirm": "Confirm",
			"market.versionTitle": "Switch tracked version",
			"market.versionText": "Pick the version for {repo} to track; rescan and sync afterwards",
			"market.versionCurrent": "current {ref}",
			"market.versionReleases": "Releases",
			"market.versionBranches": "Branches",
			"market.versionCustom": "Custom (tag / branch / commit)",
			"market.versionConfirm": "Switch to {ref}",
			"market.versionHint": "Click to switch the tracked version",
			"market.unpinned": "unpinned",
			"market.starsHint": "{count} GitHub stars",
			"market.downloadsHint": "{count} release asset downloads",
			"market.syncTitle": "Update local skills",
			"market.syncText": "Market source aligned to {ref}. Update these local skills?",
			"market.syncNone": "No local skills tracked from this repo yet.",
			"market.syncCancel": "Skip",
			"market.removeHint": "Removing a source does not affect installed skills.",
			"repo.scanTitle": "Scan result",
			"repo.close": "Close",
			"repo.searchPlaceholder": "Search skill name…",
			"repo.allRoots": "All {count}",
			"repo.selection": "Selected {selected}/{total} · {size} · showing {shown}/{filtered} (filtered)",
			"repo.noMatch": "No matching skills",
			"repo.loadMore": "Load {step} more ({remaining} left)",
			"repo.skillProgress": "{done}/{total} skills",
			"repo.ready": "{count} importable skills found",
			"repo.truncated": "⚠ Repo too large, only partial skills shown (GitHub truncated)",
			"repo.empty": "No importable skills found.",
			"repo.selectVisible": "Select visible",
			"repo.selectAllN": "Select all {count}",
			"repo.clearAll": "Clear",
			"repo.import": "Import selected ({count})",
			"repo.importing": "Importing…",
			"repo.existing": "Existing",
			"repo.files": "{count} files · {size}",
			"repo.imported": "Imported {count}",
			"repo.skippedExisting": "Skipped existing {count}",
			"repo.failed": "Failed {count}",
			"repo.cancel": "Cancel",
			"repo.cancelled": "Cancelled · {imported}/{total} kept, temp files cleaned",
			"repo.importingCurrent": "Importing: {name} ({done}/{total})",
			"repo.root.self": "Repo root",
			"repo.root.skills": "Skills",
			"repo.root.designTemplates": "Templates",
			"repo.root.generic": "{root}"
		};
		//#endregion
		//#region src/client/locales/policy.ts
		/**
		* 「可见性策略编辑器」的共用词条（模式与工作区两处共用同一个编辑器）。
		*
		* 这里只放与主体无关的文案；凡是提到主体种类的地方一律用 `{subject}` 占位，
		* 由调用方传入「模式」/「工作区」的称呼（见 `policy.subject`）。与具体主体绑定的
		* 文案（列表状态、生效时机等）留在各自的域里 —— `scope.*` 与 `workspace.*`。
		*
		* 编辑器不做「实时预览」窗口，所以这里没有 preview.* 词条。
		*/
		const zhPolicy = {
			"policy.subjectMode": "模式",
			"policy.subjectWorkspace": "工作区",
			"policy.kindTag": "场景",
			"policy.kindCol": "来源集合",
			"policy.kindSrc": "来源根",
			"policy.memberCount": "{count} 个技能",
			"policy.noSkillMatch": "没有匹配的技能。",
			"policy.groupsTitle": "按分组勾选",
			"policy.skillsTitle": "单个技能",
			"policy.searchPlaceholder": "搜索技能…",
			"policy.selectAll": "全选",
			"policy.clearAll": "清空",
			"policy.groupsEmpty": "还没有任何分组。先在「场景」或「来源」里建一个分组，就能整体勾选。",
			"policy.dangling": "有 {count} 个分组已不存在：{keys}",
			"policy.back": "返回{subject}列表",
			"policy.enable": "在此{subject}启用技能隔离",
			"policy.enableHint": "开启后，只有下面勾选的技能对该{subject}的会话可见；模型目录与显式调用同时失效。",
			"policy.enabled": "隔离已启用",
			"policy.disabled": "隔离已关闭",
			"policy.visibleCount": "可见 {visible}",
			"policy.hiddenCount": "隐藏 {hidden}",
			"policy.unrestricted": "不限制",
			"policy.save": "保存",
			"policy.saving": "保存中…",
			"policy.saved": "已保存",
			"policy.reset": "重置为不限制",
			"policy.confirmEmptyTitle": "确认要隐藏全部技能？",
			"policy.confirmEmpty": "当前白名单为空，保存后「{name}」将看不到任何技能。确定继续吗？",
			"policy.confirmResetTitle": "确认重置？",
			"policy.confirmReset": "将删除「{name}」的可见性策略，它恢复为不限制（所有技能可见）。",
			"policy.confirm": "确定",
			"policy.cancel": "取消"
		};
		const enPolicy = {
			"policy.subjectMode": "mode",
			"policy.subjectWorkspace": "workspace",
			"policy.kindTag": "Scene",
			"policy.kindCol": "Source collection",
			"policy.kindSrc": "Source root",
			"policy.memberCount": "{count} skills",
			"policy.noSkillMatch": "No matching skill.",
			"policy.groupsTitle": "Check by group",
			"policy.skillsTitle": "Individual skills",
			"policy.searchPlaceholder": "Search skills…",
			"policy.selectAll": "Select all",
			"policy.clearAll": "Clear",
			"policy.groupsEmpty": "No groups yet. Create one under Scenes or Sources to check it as a whole.",
			"policy.dangling": "{count} group(s) no longer exist: {keys}",
			"policy.back": "Back to the {subject} list",
			"policy.enable": "Isolate skills in this {subject}",
			"policy.enableHint": "Once on, only the checked skills stay visible to sessions on this {subject}; both the model catalog and explicit loads stop working for the rest.",
			"policy.enabled": "Isolation is on",
			"policy.disabled": "Isolation is off",
			"policy.visibleCount": "{visible} visible",
			"policy.hiddenCount": "{hidden} hidden",
			"policy.unrestricted": "unrestricted",
			"policy.save": "Save",
			"policy.saving": "Saving…",
			"policy.saved": "Saved",
			"policy.reset": "Reset to unrestricted",
			"policy.confirmEmptyTitle": "Hide every skill?",
			"policy.confirmEmpty": "The whitelist is empty, so \"{name}\" will see no skills at all. Continue?",
			"policy.confirmResetTitle": "Reset this policy?",
			"policy.confirmReset": "This deletes the visibility policy for \"{name}\", restoring it to unrestricted (every skill visible).",
			"policy.confirm": "Confirm",
			"policy.cancel": "Cancel"
		};
		//#endregion
		//#region src/client/locales/scopes.ts
		/**
		* 「模式」视图（模式级技能隔离）的中英词条：只放**列表态**与模式专属的生效时机，
		* 编辑器词条与工作区共用 `policy.ts`。键的完备性由
		* `en: Record<HubKey, string>` 在类型层兜底。
		*/
		const zhScopes = {
			"scope.tab": "模式",
			"scope.loading": "正在读取模式…",
			"scope.unavailable": "本部署不支持模式隔离：{reason}",
			"scope.unavailableHint": "需要宿主提供 agentPresets 服务（并暴露 acquireScope）；缺少它时其余功能不受影响。",
			"scope.empty": "本部署没有可用的 agent preset。",
			"scope.emptyHint": "preset 来自 ~/.dsh/.agent-presets/<id>/ 与部署自带的预设集。",
			"scope.configure": "配置",
			"scope.pendingNotice": "有 {count} 个模式已启用隔离但还没接上闸门：它们要等一个使用该模式的会话出现（约 5 秒内自动完成）。在此之前它们不隔离。",
			"scope.default": "默认",
			"scope.trustSystem": "部署自带",
			"scope.trustUser": "自定义",
			"scope.mounted": "已挂载",
			"scope.notMounted": "未挂载",
			"scope.gateActive": "隔离生效中",
			"scope.gatePending": "等待会话激活",
			"scope.gateOff": "未启用",
			"scope.mountedHint": "该模式已有会话使用过，隔离可以立即接线。",
			"scope.notMountedHint": "该模式还没有会话使用过，接线要等它被挂载后自动完成；在此之前它不隔离。",
			"scope.gatePendingHint": "策略已启用，闸门将在下一次接线轮询（约 5 秒）内接上。",
			"scope.listHint": "「配置」进入该模式的可见性编辑器；每个模式各自独立，未配置的模式不限制。工作区启用隔离时会覆盖模式（工作区优先）。",
			"scope.effectNow": "保存后，该模式会话的下一个回合即生效，无需重启。",
			"scope.effectLater": "该模式还没有会话使用过，首次使用它的会话会自动接上。"
		};
		const enScopes = {
			"scope.tab": "Modes",
			"scope.loading": "Reading modes…",
			"scope.unavailable": "Mode isolation is unavailable in this deployment: {reason}",
			"scope.unavailableHint": "It needs the host to expose the agentPresets service (with acquireScope); everything else keeps working without it.",
			"scope.empty": "This deployment supplies no agent preset.",
			"scope.emptyHint": "Presets come from ~/.dsh/.agent-presets/<id>/ plus the shipped preset set.",
			"scope.configure": "Configure",
			"scope.pendingNotice": "{count} mode(s) have isolation enabled but no gate yet: they wait for a session using that mode (wired automatically within about five seconds). Until then they do not isolate.",
			"scope.default": "default",
			"scope.trustSystem": "shipped",
			"scope.trustUser": "local",
			"scope.mounted": "mounted",
			"scope.notMounted": "not mounted",
			"scope.gateActive": "isolation active",
			"scope.gatePending": "awaiting a session",
			"scope.gateOff": "off",
			"scope.mountedHint": "A session has used this mode, so isolation can attach immediately.",
			"scope.notMountedHint": "No session has used this mode yet; wiring happens automatically once one does. Until then it does not isolate.",
			"scope.gatePendingHint": "The policy is on; the gate attaches on the next wiring pass (about 5 seconds).",
			"scope.listHint": "\"Configure\" opens that mode's visibility editor; every mode is independent, and an unconfigured mode stays unrestricted. A workspace that enables isolation overrides the mode.",
			"scope.effectNow": "Takes effect on the next turn of a session on this mode — no restart needed.",
			"scope.effectLater": "No session has used this mode yet; the first one attaches it automatically."
		};
		//#endregion
		//#region src/client/locales/settings.ts
		/** 设置卡。从 locales.ts 按前缀拆出，键集合不变。 */
		const zhSettings = {
			"settings.title": "技能分组",
			"settings.description": "管理 dsh 本地技能目录：浏览、分组、来源同步与新建。",
			"settings.enabled": "启用插件",
			"settings.enabledHint": "关闭后技能分组的路由、入口与公告全部下线。",
			"settings.announceToAgent": "向 Agent 公告",
			"settings.announceToAgentHint": "在系统提示中加入本插件说明，用户提到技能分组时 Agent 知道如何协作。",
			"settings.dotModelColor": "模型可调圆点颜色",
			"settings.dotModelColorHint": "技能行/聊天 / 菜单中「模型可调」蓝色圆点的颜色（#rrggbb）。",
			"settings.dotUserColor": "用户可调圆点颜色",
			"settings.dotUserColorHint": "技能行/聊天 / 菜单中「仅用户可调」绿色圆点的颜色（#rrggbb）。",
			"settings.showUseCount": "显示调用次数",
			"settings.showUseCountHint": "在技能名旁显示琥珀色调用次数。",
			"settings.showUseTime": "显示最近调用时间",
			"settings.showUseTimeHint": "在技能名行右侧显示相对时间（如「3 天前」）。",
			"settings.showGroupSummary": "显示分组汇总",
			"settings.showGroupSummaryHint": "在分组标题后汇总调用次数与最近调用时间。",
			"settings.statsWindowDays": "统计窗口（天）",
			"settings.statsWindowDaysHint": "只统计最近 N 天的使用次数，默认 14 天；0 = 全部历史。改动立即生效。",
			"settings.statsScanMinutes": "自动统计间隔（分钟）",
			"settings.statsScanMinutesHint": "后台扫描会话日志的间隔，最小 1 分钟；扫描耗时会自动拉长间隔。",
			"settings.githubToken": "GitHub Token",
			"settings.githubTokenHint": "市场/来源走 GitHub API，匿名每小时 60 次，填 token 后 5000 次。细粒度 token 无需任何权限。明文存本地设置，仅回环可读；留空即匿名（或跟随 GITHUB_TOKEN 环境变量）。",
			"settings.githubTokenPlaceholder": "ghp_… / github_pat_…（留空为匿名）",
			"settings.inherit": "继承",
			"settings.overridden": "已覆盖",
			"settings.reset": "恢复默认",
			"settings.unsaved": "未保存",
			"settings.save": "保存",
			"settings.saving": "保存中…",
			"settings.discard": "放弃修改",
			"settings.saveFailed": "本部署没有接受这些值，已保留供你修改。",
			"settings.readOnly": "本部署的设置为只读。",
			"settings.notExposed": "本部署没有挂载该设置命名空间。",
			"settings.collapse": "收起设置",
			"settings.expand": "展开设置"
		};
		const enSettings = {
			"settings.title": "Skill Groups",
			"settings.description": "Manage the local dsh skill catalog: browse, group, sync, and scaffold skills.",
			"settings.enabled": "Enable plugin",
			"settings.enabledHint": "Disables the hub routes, entries, and announcement.",
			"settings.announceToAgent": "Announce to agent",
			"settings.announceToAgentHint": "Adds a system-prompt section so agents know how to collaborate when users mention skill management.",
			"settings.dotModelColor": "Model-invocable dot color",
			"settings.dotModelColorHint": "Color of the blue \"model-callable\" dot in the skill panel and the chat / menu (#rrggbb).",
			"settings.dotUserColor": "User-invocable dot color",
			"settings.dotUserColorHint": "Color of the green \"user-only\" dot in the skill panel and the chat / menu (#rrggbb).",
			"settings.showUseCount": "Show invocation count",
			"settings.showUseCountHint": "Show the amber invocation count beside each skill name.",
			"settings.showUseTime": "Show last-used time",
			"settings.showUseTimeHint": "Show relative last-used time on the name row (e.g. \"3 d ago\").",
			"settings.showGroupSummary": "Show group summaries",
			"settings.showGroupSummaryHint": "Summarize invocation count and last-used time after group titles.",
			"settings.statsWindowDays": "Stats window (days)",
			"settings.statsWindowDaysHint": "Count only usage within the last N days (default 14); 0 = full history. Changes apply immediately.",
			"settings.statsScanMinutes": "Auto stats interval (minutes)",
			"settings.statsScanMinutesHint": "How often the background session-log scan runs (min 1); heavy scans automatically stretch it.",
			"settings.githubToken": "GitHub token",
			"settings.githubTokenHint": "Market/sources use the GitHub API: 60 req/h anonymous, 5000/hr with a token. A fine-grained token needs no permissions. Stored plaintext in local settings, loopback-only; empty means anonymous (or GITHUB_TOKEN env).",
			"settings.githubTokenPlaceholder": "ghp_… / github_pat_… (empty = anonymous)",
			"settings.inherit": "Inherit",
			"settings.overridden": "Overridden",
			"settings.reset": "Reset to default",
			"settings.unsaved": "Unsaved",
			"settings.save": "Save",
			"settings.saving": "Saving…",
			"settings.discard": "Discard",
			"settings.saveFailed": "The deployment did not accept these values; they were left for you to correct.",
			"settings.readOnly": "This deployment stores settings read-only.",
			"settings.notExposed": "This deployment does not expose the settings namespace.",
			"settings.collapse": "Hide settings",
			"settings.expand": "Show settings"
		};
		//#endregion
		//#region src/client/locales/skills.ts
		/** 技能浏览：行徽章/分组/场景/过滤排序/相对时间。从 locales.ts 按前缀拆出。 */
		const zhSkills = {
			"edit.start": "编辑",
			"edit.hint": "开启后可删除技能",
			"edit.done": "完成",
			"edit.pending": "待删除 {count} 个技能：",
			"edit.undo": "撤销",
			"edit.pendingHint": "点「完成」并确认后才会真正删掉磁盘上的文件。",
			"edit.deleteTitle": "确认删除 {count} 个技能？",
			"edit.deleteText": "将从磁盘上删除这些技能的文件或软链接（不可恢复）；来源跟踪记录里对应的条目也会一并清理。",
			"edit.deleteConfirm": "删除",
			"groups.new": "新建场景",
			"groups.collapseAll": "全部折叠",
			"groups.expandAll": "全部展开",
			"groups.namePlaceholder": "场景名",
			"groups.edit": "编辑",
			"groups.rename": "保存名称",
			"groups.delete": "删除场景",
			"groups.saveMembers": "保存成员",
			"groups.membersHint": "勾选技能加入此场景（含已关闭）。",
			"groups.empty": "还没有场景。先新建一个，再把技能归类。",
			"groups.noCollections": "暂无来源组。从市场导入技能后自动按来源聚合。",
			"groups.personal": "个人",
			"groups.provider": "插件提供",
			"groups.noToggleable": "该组没有可开关的技能",
			"groups.switchOn": "全部开启，点击全部关闭",
			"groups.switchOff": "全部关闭，点击全部开启",
			"groups.switchMixed": "部分开启（组内既有开启也有关闭），点击全部开启",
			"groups.missing": "{count} 个成员已不在目录中",
			"groups.missingOne": "已不在目录中（勾掉可移出本组）",
			"groups.closeAll": "全部关闭",
			"groups.keepOn": "保留开启",
			"groups.conflictTitle": "关闭此组？",
			"groups.conflictText": "以下技能也在其他组中开启，关闭它们会影响那些组：",
			"filter.allSources": "全部来源",
			"filter.title": "筛选",
			"filter.source": "来源",
			"filter.invocation": "调用方式",
			"filter.clear": "清除筛选",
			"filter.private": "个人",
			"sort.name": "按名称",
			"sort.added": "按添加时间",
			"sort.uses": "按调用次数",
			"time.justNow": "刚刚",
			"time.minutesAgo": "{value} 分钟前",
			"time.hoursAgo": "{value} 小时前",
			"time.daysAgo": "{value} 天前",
			"time.weeksAgo": "{value} 周前",
			"badge.source.project-dsh": "项目 .dsh",
			"badge.source.project-agents": "项目 .agents",
			"badge.source.custom": "自定义",
			"badge.source.runtime": "运行时",
			"badge.source.user-dsh": "用户 .dsh",
			"badge.source.user-agents": "用户 .agents",
			"badge.source.bundled": "内置",
			"row.readonly": "只读",
			"row.delete": "删除",
			"row.deleteHint": "先从列表里移出，点「完成」确认后才删除磁盘文件",
			"row.deleted": "已删除 {count} 个技能",
			"row.disable": "关闭",
			"row.enable": "开启",
			"row.open": "查看 {name} 详情（回车）",
			"row.duplicate": "重名",
			"row.duplicateHint": "同名技能存在多个来源，当前显示为优先级最高的版本",
			"filter.invocationAll": "全部调用",
			"filter.modelOnly": "模型可调",
			"filter.userOnly": "用户可调",
			"filter.showing": "显示 {shown}/{total}（已启用）{filtered}",
			"filter.filteredSuffix": " · 已筛选",
			"filter.shortened": "短描述 {count} 条，悬浮看全文"
		};
		const enSkills = {
			"edit.start": "Edit",
			"edit.hint": "Delete skills",
			"edit.done": "Done",
			"edit.pending": "{count} skill(s) staged for deletion:",
			"edit.undo": "Undo",
			"edit.pendingHint": "Nothing is deleted until you press Done and confirm.",
			"edit.deleteTitle": "Delete {count} skill(s)?",
			"edit.deleteText": "This removes their files or symlinks from disk (irreversible) and drops them from any source-tracking records.",
			"edit.deleteConfirm": "Delete",
			"groups.new": "New scene",
			"groups.collapseAll": "Collapse all",
			"groups.expandAll": "Expand all",
			"groups.namePlaceholder": "Scene name",
			"groups.edit": "Edit",
			"groups.rename": "Save name",
			"groups.delete": "Delete scene",
			"groups.saveMembers": "Save members",
			"groups.membersHint": "Check skills to add to this scene (switched-off skills included).",
			"groups.empty": "No scenes yet. Create one and start categorizing skills.",
			"groups.noCollections": "No source groups yet. Import skills from the market to group them by source.",
			"groups.personal": "Personal",
			"groups.provider": "From plugin",
			"groups.noToggleable": "No skills in this group can be switched",
			"groups.switchOn": "All on — click to switch them all off",
			"groups.switchOff": "All off — click to switch them all on",
			"groups.switchMixed": "Some on, some off — click to switch them all on",
			"groups.missing": "{count} member(s) no longer in the catalog",
			"groups.missingOne": "No longer in the catalog (uncheck to drop it)",
			"groups.closeAll": "Close all",
			"groups.keepOn": "Keep on",
			"groups.conflictTitle": "Close this group?",
			"groups.conflictText": "These skills are also enabled in other groups; closing them affects those groups:",
			"filter.allSources": "All sources",
			"filter.title": "Filter",
			"filter.source": "Source",
			"filter.invocation": "Invocation",
			"filter.clear": "Clear filters",
			"filter.private": "Personal",
			"sort.name": "By name",
			"sort.added": "By added",
			"sort.uses": "By uses",
			"time.justNow": "just now",
			"time.minutesAgo": "{value} min ago",
			"time.hoursAgo": "{value} h ago",
			"time.daysAgo": "{value} d ago",
			"time.weeksAgo": "{value} w ago",
			"badge.source.project-dsh": "project .dsh",
			"badge.source.project-agents": "project .agents",
			"badge.source.custom": "custom",
			"badge.source.runtime": "runtime",
			"badge.source.user-dsh": "user .dsh",
			"badge.source.user-agents": "user .agents",
			"badge.source.bundled": "bundled",
			"row.readonly": "read-only",
			"row.delete": "Delete",
			"row.deleteHint": "Remove from the list first; the file is deleted when you confirm on Done",
			"row.deleted": "Deleted {count} skill(s)",
			"row.disable": "Turn off",
			"row.enable": "Turn on",
			"row.open": "View {name} details (Enter)",
			"row.duplicate": "duplicate",
			"row.duplicateHint": "Multiple sources provide this name; the highest-priority one is shown",
			"filter.invocationAll": "All",
			"filter.modelOnly": "Model",
			"filter.userOnly": "User",
			"filter.showing": "Showing {shown}/{total} (enabled){filtered}",
			"filter.filteredSuffix": " · filtered",
			"filter.shortened": "{count} short descriptions, hover for full text"
		};
		//#endregion
		//#region src/client/locales/sources.ts
		/** 来源跟踪：上游检查、同步确认与状态文案。从 locales.ts 按前缀拆出。 */
		const zhSources = {
			"source.private": "个人技能（未绑定上游，不检查更新）",
			"source.commit": "已同步版本",
			"source.unverified": "尚未核对上游",
			"source.check": "检查更新",
			"source.checkHint": "点击检查上游更新",
			"source.checking": "检查中…",
			"source.upToDate": "已是最新",
			"source.updated": "有更新 {count} 个",
			"source.deleted": "上游已删除 {count} 个",
			"source.error": "检查失败",
			"source.throttled": "刚刚检查过",
			"source.sync": "同步",
			"source.syncing": "同步中…",
			"source.syncConfirmTitle": "同步技能？",
			"source.syncConfirmText": "将用上游最新版本覆盖本地对以下技能的所有修改："
		};
		const enSources = {
			"source.private": "Personal skill (not bound to an upstream; no update checks)",
			"source.commit": "Synced commit",
			"source.unverified": "upstream not verified yet",
			"source.check": "Check for updates",
			"source.checkHint": "Click to check the upstream for updates",
			"source.checking": "Checking…",
			"source.upToDate": "Up to date",
			"source.updated": "{count} updates",
			"source.deleted": "{count} deleted upstream",
			"source.error": "Check failed",
			"source.throttled": "Checked recently",
			"source.sync": "Sync",
			"source.syncing": "Syncing…",
			"source.syncConfirmTitle": "Sync skills?",
			"source.syncConfirmText": "This overwrites local changes to these skills with the latest upstream version:"
		};
		//#endregion
		//#region src/client/locales/workspaces.ts
		/**
		* 「工作区」视图（工作区级技能隔离）的中英词条。与 `scopes.ts` 完全对称：
		* 列表态词条在这里，编辑器词条共用 `policy.ts`。键的完备性由
		* `en: Record<HubKey, string>` 在类型层兜底。
		*/
		const zhWorkspaces = {
			"workspace.tab": "工作区",
			"workspace.loading": "正在读取工作区…",
			"workspace.unavailable": "本部署不支持工作区隔离：{reason}",
			"workspace.unavailableHint": "需要宿主提供 workspaceRegistry（DSH 的工作区列表）与 agentPresets 服务；缺少它们时其余功能不受影响。",
			"workspace.empty": "DSH 里还没有工作区记录。",
			"workspace.emptyHint": "工作区就是 DSH 侧边栏里的那些条目；会话按自己的工作目录精确匹配到某一个。",
			"workspace.listHint": "「配置」进入该工作区的可见性编辑器。工作区启用隔离后会覆盖模式：该目录下的会话只看这里的白名单；没启用则仍按模式策略",
			"workspace.sessionCount": "{count} 个会话",
			"workspace.noSession": "还没有会话",
			"workspace.pendingNotice": "有 {count} 个工作区已启用隔离但还没接上闸门：它们要等该工作区出现一次技能查找（约 5 秒内自动完成）。在此之前它们不隔离。",
			"workspace.orphan": "已不在 DSH 里",
			"workspace.orphanHint": "该工作区已从 DSH 的工作区列表移除，但它的策略还留着。进「配置」→「重置为不限制」可以清掉；这里不会自动清理。",
			"workspace.effectHint": "保存后，该工作区目录下的会话在下一次技能查找即按新策略生效；启用隔离时会覆盖模式策略（工作区优先），关掉则回落模式。"
		};
		const enWorkspaces = {
			"workspace.tab": "Workspaces",
			"workspace.loading": "Reading workspaces…",
			"workspace.unavailable": "Workspace isolation is unavailable in this deployment: {reason}",
			"workspace.unavailableHint": "It needs the host to expose workspaceRegistry (the DSH workspace list) plus the agentPresets service; everything else keeps working without them.",
			"workspace.empty": "DSH has no workspace yet.",
			"workspace.emptyHint": "Workspaces are the entries in the DSH sidebar; a session matches one of them by its exact working directory.",
			"workspace.listHint": "\"Configure\" opens that workspace's visibility editor. Once a workspace enables isolation it overrides the mode: sessions in that directory see only this whitelist; otherwise the mode policy applies.",
			"workspace.sessionCount": "{count} session(s)",
			"workspace.noSession": "no session yet",
			"workspace.pendingNotice": "{count} workspace(s) have isolation enabled but no gate yet: they wait for a skill lookup in that workspace (wired automatically within about five seconds). Until then they do not isolate.",
			"workspace.orphan": "gone from DSH",
			"workspace.orphanHint": "This workspace was removed from the DSH workspace list but its policy is still stored. Open \"Configure\" and reset it to unrestricted to clear it; nothing is cleaned up automatically.",
			"workspace.effectHint": "Takes effect on the next skill lookup of a session in that workspace directory. While isolation is on it overrides the mode policy; turning it off falls back to the mode."
		};
		//#endregion
		//#region src/client/locales.ts
		/**
		*  locales 按视图拆分后的聚合入口：各域字典在 ./locales/<domain>.ts，
		*  这里合并为面板消费的 zh/en。老 `from './locales.ts'` 写法保持可用，
		*  HubKey 的完备性仍由 `en: Record<HubKey, string>` 在类型层兜底
		*  （缺键即编译报错）。
		*/
		const zh = {
			...zhCommon,
			...zhSkills,
			...zhMarket,
			...zhSources,
			...zhDetail,
			...zhPolicy,
			...zhScopes,
			...zhWorkspaces,
			...zhSettings
		};
		const en = {
			...enCommon,
			...enSkills,
			...enMarket,
			...enSources,
			...enDetail,
			...enPolicy,
			...enScopes,
			...enWorkspaces,
			...enSettings
		};
		/** Interpolate a {name} template with the given values. */
		function t(dict, key, values) {
			let text = dict[key] ?? key;
			if (values !== void 0) for (const [name, value] of Object.entries(values)) text = text.replaceAll("{" + name + "}", String(value));
			return text;
		}
		//#endregion
		//#region src/client/settings-nav-icon.ts
		/**
		* The settings shell renders section nav icons from a hard-coded id map and
		* exposes no registrant icon option, so the skill-hub section falls back to
		* the generic gear. This scoped DOM patch swaps in the official skill icon
		* whenever the settings dialog re-renders.
		*/
		const SKILL_SECTION_LABELS = ["技能", "Skills"];
		const SKILL_ICON_SVG = `<svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" data-skill-hub-nav-icon="true"><path d="M12.5113 15.4067C12.4395 15.6249 12.1308 15.6249 12.059 15.4067L11.643 14.1416C11.454 13.567 11.0033 13.1164 10.4288 12.9274L9.16369 12.5113C8.94544 12.4395 8.94544 12.1308 9.16369 12.059L10.4288 11.643C11.0033 11.454 11.454 11.0033 11.643 10.4288L12.059 9.16369C12.1308 8.94544 12.4395 8.94544 12.5113 9.16369L12.9274 10.4288C13.1164 11.0033 13.567 11.454 14.1416 11.643L15.4067 12.059C15.6249 12.1308 15.6249 12.4395 15.4067 12.5113L14.1416 12.9274C13.567 13.1164 13.1164 13.567 12.9274 14.1416L12.5113 15.4067Z" fill="currentColor"/><path d="M9.02246 0.546878C9.9822 0.546878 10.7564 0.545403 11.374 0.612307C12.0042 0.680586 12.5515 0.826244 13.0273 1.17188C13.3052 1.37376 13.5501 1.61868 13.752 1.89649C14.0975 2.37225 14.2432 2.91984 14.3115 3.54981C14.3784 4.16727 14.377 4.94206 14.377 5.90137V8.51367C13.9611 8.29533 13.5071 8.13985 13.0273 8.06055V5.90137C13.0273 4.9121 13.0259 4.22322 12.9688 3.69532C12.9129 3.18044 12.8098 2.89782 12.6592 2.69043C12.5406 2.52724 12.3966 2.38326 12.2334 2.26465C12.026 2.11404 11.7437 2.0109 11.2285 1.95508C10.7005 1.89789 10.0122 1.89649 9.02246 1.89649H6.55371C5.56395 1.89649 4.87569 1.89787 4.34766 1.95508C3.83242 2.01092 3.55022 2.11398 3.34278 2.26465C3.17953 2.38329 3.03564 2.52719 2.91699 2.69043C2.76642 2.89782 2.66325 3.18042 2.60742 3.69532C2.55027 4.22322 2.54883 4.9121 2.54883 5.90137V10.0986C2.54883 11.0878 2.55031 11.7768 2.60742 12.3047C2.66326 12.8196 2.76642 13.1032 2.91699 13.3105C3.03558 13.4736 3.17966 13.6178 3.34278 13.7363C3.5502 13.8869 3.83265 13.9901 4.34766 14.0459C4.87568 14.1031 5.56398 14.1035 6.55371 14.1035H8.08399C8.27443 14.6025 8.55077 15.0585 8.89551 15.4541H6.55371C5.59402 15.4541 4.81976 15.4546 4.20215 15.3877C3.57204 15.3194 3.02468 15.1738 2.54883 14.8281C2.27111 14.6263 2.02606 14.3813 1.82422 14.1035C1.47883 13.6278 1.33293 13.08 1.26465 12.4502C1.19783 11.8327 1.19922 11.0579 1.19922 10.0986V5.90137C1.19922 4.94206 1.1978 4.16727 1.26465 3.54981C1.33295 2.91984 1.47867 2.37225 1.82422 1.89649C2.02613 1.61864 2.27098 1.37379 2.54883 1.17188C3.02472 0.826181 3.57197 0.6806 4.20215 0.612307C4.81976 0.545393 5.594 0.546877 6.55371 0.546878H9.02246ZM9.19629 9.14649H4.5459V7.84571H9.19629V9.14649ZM11.0303 6.10645H4.5459V4.80567H11.0303V6.10645Z" fill="currentColor"/></svg>`;
		let iconTemplate = null;
		function skillIcon() {
			if (iconTemplate === null) iconTemplate = new DOMParser().parseFromString(SKILL_ICON_SVG, "image/svg+xml").documentElement;
			return iconTemplate.cloneNode(true);
		}
		function patchNavIcon() {
			const dialog = document.querySelector("[role=\"dialog\"]");
			if (dialog === null) return;
			for (const button of dialog.querySelectorAll("button")) {
				const label = button.querySelector("span");
				if (label === null || !SKILL_SECTION_LABELS.includes(label.textContent?.trim() ?? "")) continue;
				if (button.querySelector("svg[data-skill-hub-nav-icon]") !== null) continue;
				const current = button.querySelector("svg");
				const icon = skillIcon();
				if (current !== null) current.replaceWith(icon);
				else button.insertBefore(icon, button.firstChild);
			}
		}
		/** Swap the settings nav gear for the skill icon and keep it in sync. */
		function applySettingsNavIcon() {
			if (typeof document === "undefined" || typeof MutationObserver === "undefined") return () => {};
			patchNavIcon();
			const observer = new MutationObserver(() => {
				patchNavIcon();
			});
			observer.observe(document.body, {
				childList: true,
				subtree: true
			});
			return () => {
				observer.disconnect();
			};
		}
		//#endregion
		//#region src/client/grouping.ts
		/**
		* Rows of a catalog that are currently switched off at runtime. The catalog
		* carries every known skill exactly once, so "disabled" is a filter over
		* `catalog.skills` (by `enabled`) rather than a second list.
		*/
		function disabledSkills(catalog) {
			return (catalog?.skills ?? []).filter((skill) => !skill.enabled);
		}
		/**
		* Derive a group switch view from its member names, the set of currently
		* enabled skill names and the set of names the catalog actually knows
		* (catalog.skills).
		*
		* Members the catalog does not know cannot be switched either way, so they
		* must never decide the state: counting them as "off" would leave any group
		* with a deleted or renamed member stuck in 'mixed' forever, and no click
		* could clear it (batch toggles only ever send known names). They are reported
		* in `missing` so the header can say so instead. A group with no known member
		* is 'off' with its switch disabled.
		*/
		function groupSwitchView(members, enabledNames, knownNames) {
			const enabled = [];
			const disabled = [];
			const missing = [];
			for (const name of members) if (!knownNames.has(name)) missing.push(name);
			else if (enabledNames.has(name)) enabled.push(name);
			else disabled.push(name);
			return {
				state: enabled.length === 0 ? "off" : disabled.length === 0 ? "on" : "mixed",
				enabled,
				disabled,
				missing
			};
		}
		/** Names of every group a skill belongs to (tags + collections). */
		function groupNamesOf(name, tags, collections) {
			const names = [];
			for (const tag of tags) if (tag.skillNames.includes(name)) names.push(tag.name);
			for (const collection of collections) if (collection.skillNames.includes(name)) names.push(collection.name);
			return names;
		}
		/**
		* Members of a group that are currently enabled AND also belong to at least
		* one other group — the set a "close" action must ask about.
		*/
		function conflictsOnClose(members, enabledNames, otherGroups) {
			return members.filter((name) => {
				if (!enabledNames.has(name)) return false;
				return otherGroups.some((group) => group.members.includes(name));
			});
		}
		/** Origin-repo filter value: skills with no source record (private skills). */
		const PRIVATE_SOURCE = "private";
		/**
		* Apply the origin filter ('all' or a specific origin repo; skills without a
		* source record count as PRIVATE_SOURCE). The origins map is the store's
		* skillName → repo derivation, so filtering follows the tracked source
		* records instead of the filesystem root a skill happens to live under.
		*/
		function filterBySource(skills, source, origins) {
			if (source === "all") return [...skills];
			return skills.filter((skill) => (origins[skill.name] ?? "private") === source);
		}
		/**
		* Apply the search box and the origin filter to the switched-off skills.
		*
		* Every view that can flip a skill's switch off needs a way back to it — the
		* disabled row is that way back — so the flat list and the grouped personal
		* card share this filter instead of each re-deriving it (the flat list used to
		* drop disabled skills entirely, which made them unreachable outside a scene).
		* The rows are ordinary catalog skills with `enabled === false`, so name and
		* description filtering works exactly as it does for the enabled list.
		*/
		function filterDisabled(records, normalized, source, origins) {
			return records.filter((record) => (normalized.length === 0 || record.name.toLocaleLowerCase().includes(normalized) || record.description.toLocaleLowerCase().includes(normalized)) && (source === "all" || (origins[record.name] ?? "private") === source));
		}
		/**
		* Match origin collections against the currently visible enabled skills and
		* switched-off skills, dropping collections with no visible member. Without
		* this, a stale origin (skill gone from disk) renders a group header with
		* zero rows — an empty shell the sources tab otherwise never shows.
		*/
		function visibleCollections(collections, visibleSkills, disabledRecords, normalized, sourceFilter, origins) {
			const visible = [];
			for (const collection of collections) {
				const skills = visibleSkills.filter((skill) => collection.skillNames.includes(skill.name));
				const disabledMembers = disabledRecords.filter((record) => collection.skillNames.includes(record.name) && (normalized.length === 0 || record.name.toLocaleLowerCase().includes(normalized) || record.description.toLocaleLowerCase().includes(normalized)) && (sourceFilter === "all" || (origins[record.name] ?? "private") === sourceFilter));
				if (skills.length > 0 || disabledMembers.length > 0) visible.push({
					collection,
					skills,
					disabledMembers
				});
			}
			return visible;
		}
		/**
		* Sort a skill list in place-safe copy order: name ascending, added
		* descending (newest first, unknown addedAt last), or uses descending
		* (most-called first). Unknown values always trail.
		*/
		function sortSkills(skills, key, getUses) {
			const list = [...skills];
			if (key === "name") list.sort((a, b) => a.name.localeCompare(b.name));
			else if (key === "added") list.sort((a, b) => (b.addedAt ?? -Infinity) - (a.addedAt ?? -Infinity));
			else if (key === "uses") list.sort((a, b) => (getUses?.(b.name) ?? 0) - (getUses?.(a.name) ?? 0));
			return list;
		}
		/**
		* 把一个来源/场景组里的启用技能与已关闭技能合并成一条按当前排序键排好的
		* 列表。开关只是把一行换个样式，行不该跳到组尾：所以两类条目一起排序，
		* 关闭行带着技能自己的 addedAt，「按添加时间」也不会乱。
		*/
		function mergeGroupRows(skills, records, key, getUses) {
			const entries = [];
			for (const skill of skills) entries.push({
				name: skill.name,
				...skill.addedAt !== void 0 ? { addedAt: skill.addedAt } : {},
				row: {
					kind: "skill",
					skill
				}
			});
			for (const record of records) entries.push({
				name: record.name,
				...record.addedAt !== void 0 ? { addedAt: record.addedAt } : {},
				row: {
					kind: "disabled",
					record
				}
			});
			return sortSkills(entries, key, getUses).map((entry) => entry.row);
		}
		/** Format an epoch-ms timestamp as a short relative time bucket. */
		function formatRelativeTime(ms, now = Date.now()) {
			const diff = Math.max(0, now - ms);
			const minutes = Math.floor(diff / 6e4);
			if (minutes < 1) return { key: "time.justNow" };
			if (minutes < 60) return {
				key: "time.minutesAgo",
				value: minutes
			};
			const hours = Math.floor(minutes / 60);
			if (hours < 24) return {
				key: "time.hoursAgo",
				value: hours
			};
			const days = Math.floor(hours / 24);
			if (days < 7) return {
				key: "time.daysAgo",
				value: days
			};
			return {
				key: "time.weeksAgo",
				value: Math.floor(days / 7)
			};
		}
		//#endregion
		//#region src/client/helpers.ts
		/**
		* Shared panel helpers: the active-dictionary pick (document-language
		* based, family precedent) plus a small error-message extractor.
		*/
		/** Active dictionary, picked by the document language at call time. */
		let cachedDictionaryLang = "";
		let cachedDictionary = null;
		function dictionary() {
			const key = (typeof document !== "undefined" ? document.documentElement.lang : "zh").toLowerCase().startsWith("en") ? "en" : "zh";
			if (cachedDictionary === null || cachedDictionaryLang !== key) {
				cachedDictionaryLang = key;
				cachedDictionary = key === "en" ? { ...en } : { ...zh };
			}
			return cachedDictionary;
		}
		/** Translate a key with optional {name} template params (current language). */
		function tt(key, values) {
			return t(dictionary(), key, values);
		}
		/** Human-readable error text from an unknown thrown value. */
		function errorMessage(error) {
			if (error instanceof Error) return error.message;
			return String(error);
		}
		/**
		* Whether a displayName is worth showing beside the kebab-case name.
		* Pure case/punctuation variants (e.g. "Code Review" vs "code-review") are redundant.
		*/
		function isDisplayNameDistinct(name, displayName) {
			if (displayName === void 0) return false;
			const normalize = (s) => s.toLowerCase().replace(/[^a-z0-9\u4e00-\u9fff]+/g, "");
			return normalize(displayName) !== normalize(name);
		}
		/**
		* Copy text to the clipboard. Uses the async API with a positioned-textarea
		* fallback for insecure contexts. Resolves true only when the copy succeeded.
		*/
		async function copyTextToClipboard(text) {
			if (navigator.clipboard?.writeText !== void 0) try {
				await navigator.clipboard.writeText(text);
				return true;
			} catch {}
			try {
				const ta = document.createElement("textarea");
				ta.value = text;
				ta.setAttribute("readonly", "");
				ta.style.position = "fixed";
				ta.style.top = "0";
				ta.style.opacity = "0";
				document.body.appendChild(ta);
				ta.select();
				const ok = document.execCommand("copy");
				ta.remove();
				return ok;
			} catch {
				return false;
			}
		}
		//#endregion
		//#region src/client/panel/format.ts
		/** Model-invocable dot color default. Single source for the TS side; the
		*  panel's CSS mirrors it via --hub-model (panel.module.css). */
		const DEFAULT_DOT_MODEL_COLOR = "#2f81f7";
		/** User-invocable dot color default. Single source for the TS side; the
		*  panel's CSS mirrors it via --hub-user (panel.module.css). */
		const DEFAULT_DOT_USER_COLOR = "#3fb950";
		/** Dot inline style from the user-chosen color (undefined keeps the CSS default). */
		function dotStyle(color) {
			if (color === void 0) return void 0;
			return {
				background: color,
				borderColor: color
			};
		}
		/** Localized relative-time text for a Unix-ms timestamp. */
		function relativeTimeText(ms) {
			const rt = formatRelativeTime(ms);
			return tt(rt.key, rt.value !== void 0 ? { value: rt.value } : void 0);
		}
		/** Localized absolute time for the detail meta (e.g. "2026/8/16 11:00:00"). */
		function formatDateTime(ms) {
			return new Date(ms).toLocaleString();
		}
		/** Short form of a commit SHA for display. */
		function shortSha(sha) {
			return sha.length > 7 ? sha.slice(0, 7) : sha;
		}
		//#endregion
		//#region src/client/slash-dots.tsx
		/** The core plugin's skill source identity on the '/' trigger. */
		const SKILL_SOURCE = {
			trigger: "/",
			name: "skill"
		};
		/** How long one catalog-derived modelInvocable map stays hot before refresh. */
		const MODEL_TTL_MS = 6e4;
		/**
		* Find the core `/skill` source through the runtime registry, or undefined.
		* The lookup never throws: a missing/reshaped registry just means no dots. Exported
		* for unit tests; the apply path only calls it indirectly through setupSkillSlashDots.
		* @param service - the ctx.inputTriggers service face.
		* @returns the registered skill source, or undefined.
		*/
		function findSkillSource(service) {
			const live = service.live;
			if (live?.sources === void 0) return void 0;
			return live.sources.find((source) => source.trigger === SKILL_SOURCE.trigger && source.name === SKILL_SOURCE.name);
		}
		/** One catalog-derived name → modelInvocable snapshot with a load timestamp. */
		let modelCache;
		/**
		* Clear the modelInvocable cache. Called on connection/reset so a fresh
		* catalog wins after reconnect; exported for deterministic unit tests.
		*/
		function resetModelCache() {
			modelCache = void 0;
		}
		/**
		* Resolve name → modelInvocable from the hub's catalog, cached for
		* MODEL_TTL_MS. A failed load caches the failure briefly so a downed route
		* doesn't hammer the host on every keystroke; the returned map is empty then
		* (callers fall back to the model dot for unknown names).
		* @param api - the hub browser API.
		* @returns name → whether the model may call the skill.
		*/
		async function modelInvocableMap(api) {
			const now = Date.now();
			const cached = modelCache;
			if (cached !== void 0 && now - cached.at < MODEL_TTL_MS) return "failed" in cached ? /* @__PURE__ */ new Map() : cached.map;
			try {
				const catalog = await api.catalog();
				const map = new Map(catalog.skills.map((skill) => [skill.name, skill.invocation.modelInvocable]));
				modelCache = {
					at: now,
					map
				};
				return map;
			} catch (error) {
				console.error("[skill-hub] slash dot color lookup failed:", error);
				modelCache = {
					at: now,
					failed: true
				};
				return /* @__PURE__ */ new Map();
			}
		}
		/**
		* 通过直接操作已渲染的 `[role="option"]` 列表注入彩色点，
		* 绕过 MenuView 对 `icon` 的枚举限制。
		* @param modelByName - 技能名 → 模型可调用性；不在表内的候选不注点。
		* @param modelColor - 模型可调用技能的点色。
		* @param userColor - 仅用户可调用技能的点色。
		*/
		function injectDotsViaDOM(modelByName, modelColor, userColor) {
			if (typeof document === "undefined" || typeof requestAnimationFrame === "undefined") return;
			const run = () => {
				const listbox = document.querySelector("[class*=\"_3e4SsG_menu\"]")?.querySelector("[role=\"listbox\"]") ?? document.querySelector("[role=\"listbox\"]");
				if (listbox === null) return;
				const options = listbox.querySelectorAll("[role=\"option\"]");
				for (const opt of options) {
					if (opt.querySelector("[data-skill-dot]") !== null) continue;
					const nameEl = opt.querySelector("[class*=\"itemName\"]");
					if (nameEl === null) continue;
					const name = (nameEl.textContent ?? "").trim();
					if (name.length === 0) continue;
					if (!modelByName.has(name)) continue;
					const color = modelByName.get(name) ?? true ? modelColor : userColor;
					const wrapper = document.createElement("span");
					wrapper.setAttribute("data-skill-dot", "");
					wrapper.setAttribute("aria-hidden", "true");
					wrapper.style.width = "16px";
					wrapper.style.height = "16px";
					wrapper.style.display = "inline-flex";
					wrapper.style.justifyContent = "center";
					wrapper.style.alignItems = "center";
					wrapper.style.flex = "none";
					const dot = document.createElement("span");
					dot.style.display = "inline-block";
					dot.style.width = "6px";
					dot.style.height = "6px";
					dot.style.borderRadius = "3px";
					dot.style.background = color;
					dot.style.flex = "none";
					wrapper.appendChild(dot);
					nameEl.parentElement?.insertBefore(wrapper, nameEl);
				}
			};
			requestAnimationFrame(() => setTimeout(run, 0));
		}
		/**
		* Wrap the core skill source so every menu row carries the invocation dot.
		* Exported for unit tests; production wiring goes through setupSkillSlashDots.
		* @param source - the registered `/skill` source.
		* @param api - hub browser API for the modelInvocable lookup.
		* @param scope - hub settings scope for the dot colors.
		* @returns a disposer restoring the original candidates.
		*/
		function wrapSkillSource(source, api, scope) {
			const original = source.candidates;
			source.candidates = async (session, req) => {
				const items = await original(session, req);
				if (req.signal.aborted) return items;
				const modelByName = await modelInvocableMap(api);
				if (req.signal.aborted) return items;
				const snapshot = scope.getSnapshot();
				injectDotsViaDOM(modelByName, snapshot.value?.dotModelColor ?? "#2f81f7", snapshot.value?.dotUserColor ?? "#3fb950");
				return items;
			};
			return () => {
				source.candidates = original;
			};
		}
		/**
		* Mount the slash-menu dots on the registered `/skill` source. Idempotent and
		* defensive: if the core source isn't registered yet (or the registry shape
		* changes), it retries briefly and then gives up silently — the chat keeps
		* working, it simply shows no dots. The returned disposer restores the
		* original candidates and clears the model cache.
		* @param ctx - the client root context (inputTriggers + events).
		* @param api - hub browser API.
		* @param scope - hub settings scope for dot colors.
		* @returns a cleanup function for `ctx.effect`.
		*/
		function setupSkillSlashDots(ctx, api, scope) {
			const inputTriggers = ctx.get("inputTriggers");
			if (inputTriggers === void 0) return () => {};
			let disposed = false;
			let restore;
			let attempts = 0;
			const attempt = () => {
				if (disposed) return;
				const source = findSkillSource(inputTriggers);
				if (source === void 0) {
					if (attempts < 10) {
						attempts += 1;
						setTimeout(attempt, 100);
					}
					return;
				}
				restore = wrapSkillSource(source, api, scope);
			};
			attempt();
			const clearCache = () => {
				resetModelCache();
			};
			const offReset = ctx.on("connection/reset", clearCache);
			return () => {
				disposed = true;
				offReset();
				restore?.();
				restore = void 0;
			};
		}
		//#endregion
		//#region src/client/icons.tsx
		/** ic_ds_chevron_down_outline_14 */
		function IconChevronDownOutline14({ size = 14, className }) {
			return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("svg", {
				width: size,
				height: size,
				className,
				viewBox: "0 0 14 14",
				fill: "none",
				xmlns: "http://www.w3.org/2000/svg",
				children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("path", {
					d: "M11.8486 5.5L11.4238 5.92383L8.69727 8.65137C8.44157 8.90706 8.21562 9.13382 8.01172 9.29785C7.79912 9.46883 7.55595 9.61756 7.25 9.66602C7.08435 9.69222 6.91565 9.69222 6.75 9.66602C6.44405 9.61756 6.20088 9.46883 5.98828 9.29785C5.78438 9.13382 5.55843 8.90706 5.30273 8.65137L2.57617 5.92383L2.15137 5.5L3 4.65137L3.42383 5.07617L6.15137 7.80273C6.42595 8.07732 6.59876 8.24849 6.74023 8.3623C6.87291 8.46904 6.92272 8.47813 6.9375 8.48047C6.97895 8.48703 7.02105 8.48703 7.0625 8.48047C7.07728 8.47813 7.12709 8.46904 7.25977 8.3623C7.40124 8.24849 7.57405 8.07732 7.84863 7.80273L10.5762 5.07617L11 4.65137L11.8486 5.5Z",
					fill: "currentColor"
				})
			});
		}
		/** ic_ds_skill_outline_16 */
		function IconSkillOutline16({ size = 16, className }) {
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("svg", {
				width: size,
				height: size,
				className,
				viewBox: "0 0 16 16",
				fill: "none",
				xmlns: "http://www.w3.org/2000/svg",
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("path", {
					d: "M12.5113 15.4067C12.4395 15.6249 12.1308 15.6249 12.059 15.4067L11.643 14.1416C11.454 13.567 11.0033 13.1164 10.4288 12.9274L9.16369 12.5113C8.94544 12.4395 8.94544 12.1308 9.16369 12.059L10.4288 11.643C11.0033 11.454 11.454 11.0033 11.643 10.4288L12.059 9.16369C12.1308 8.94544 12.4395 8.94544 12.5113 9.16369L12.9274 10.4288C13.1164 11.0033 13.567 11.454 14.1416 11.643L15.4067 12.059C15.6249 12.1308 15.6249 12.4395 15.4067 12.5113L14.1416 12.9274C13.567 13.1164 13.1164 13.567 12.9274 14.1416L12.5113 15.4067Z",
					fill: "currentColor"
				}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("path", {
					d: "M9.02246 0.546878C9.9822 0.546878 10.7564 0.545403 11.374 0.612307C12.0042 0.680586 12.5515 0.826244 13.0273 1.17188C13.3052 1.37376 13.5501 1.61868 13.752 1.89649C14.0975 2.37225 14.2432 2.91984 14.3115 3.54981C14.3784 4.16727 14.377 4.94206 14.377 5.90137V8.51367C13.9611 8.29533 13.5071 8.13985 13.0273 8.06055V5.90137C13.0273 4.9121 13.0259 4.22322 12.9688 3.69532C12.9129 3.18044 12.8098 2.89782 12.6592 2.69043C12.5406 2.52724 12.3966 2.38326 12.2334 2.26465C12.026 2.11404 11.7437 2.0109 11.2285 1.95508C10.7005 1.89789 10.0122 1.89649 9.02246 1.89649H6.55371C5.56395 1.89649 4.87569 1.89787 4.34766 1.95508C3.83242 2.01092 3.55022 2.11398 3.34278 2.26465C3.17953 2.38329 3.03564 2.52719 2.91699 2.69043C2.76642 2.89782 2.66325 3.18042 2.60742 3.69532C2.55027 4.22322 2.54883 4.9121 2.54883 5.90137V10.0986C2.54883 11.0878 2.55031 11.7768 2.60742 12.3047C2.66326 12.8196 2.76642 13.1032 2.91699 13.3105C3.03558 13.4736 3.17966 13.6178 3.34278 13.7363C3.5502 13.8869 3.83265 13.9901 4.34766 14.0459C4.87568 14.1031 5.56398 14.1035 6.55371 14.1035H8.08399C8.27443 14.6025 8.55077 15.0585 8.89551 15.4541H6.55371C5.59402 15.4541 4.81976 15.4546 4.20215 15.3877C3.57204 15.3194 3.02468 15.1738 2.54883 14.8281C2.27111 14.6263 2.02606 14.3813 1.82422 14.1035C1.47883 13.6278 1.33293 13.08 1.26465 12.4502C1.19783 11.8327 1.19922 11.0579 1.19922 10.0986V5.90137C1.19922 4.94206 1.1978 4.16727 1.26465 3.54981C1.33295 2.91984 1.47867 2.37225 1.82422 1.89649C2.02613 1.61864 2.27098 1.37379 2.54883 1.17188C3.02472 0.826181 3.57197 0.6806 4.20215 0.612307C4.81976 0.545393 5.594 0.546877 6.55371 0.546878H9.02246ZM9.19629 9.14649H4.5459V7.84571H9.19629V9.14649ZM11.0303 6.10645H4.5459V4.80567H11.0303V6.10645Z",
					fill: "currentColor"
				})]
			});
		}
		//#endregion
		//#region \0dsh-css:/home/lbf/文档/deepseek-harness/default-workspace/dsh-skill-group/src/client/settings-card.module.css.mjs
		const css$1 = ".Sq7yOW_card{border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-3);border-radius:12px;list-style:none;transition:border-color .16s,background .16s}.Sq7yOW_card:hover{border-color:var(--dsw-alias-label-dimmed)}.Sq7yOW_cardOpen{background:var(--dsw-alias-bg-layer-2);border-color:var(--dsw-alias-label-dimmed)}.Sq7yOW_header{appearance:none;width:100%;font:inherit;color:inherit;text-align:left;cursor:pointer;background:0 0;border:0;border-radius:12px;align-items:center;gap:12px;padding:14px 16px;display:flex}.Sq7yOW_header:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:-2px}.Sq7yOW_headText{flex-direction:column;flex:1;gap:4px;min-width:0;display:flex}.Sq7yOW_name{color:var(--dsw-alias-label-primary);font-size:15px;font-weight:600;line-height:1.4}.Sq7yOW_description{color:var(--dsw-alias-label-tertiary);font-size:13px;line-height:1.5}.Sq7yOW_versionTag{opacity:.45;white-space:nowrap;font-variant-numeric:tabular-nums;vertical-align:1px;margin-left:6px;font-size:12px;font-weight:500}.Sq7yOW_pending{white-space:nowrap;background:var(--dsw-alias-bg-module-platform);color:var(--dsw-alias-label-secondary);border-radius:999px;flex:none;padding:1px 8px;font-size:11px;font-weight:500;line-height:17px}.Sq7yOW_chevron,.Sq7yOW_chevronOpen{color:var(--dsw-alias-label-tertiary);flex:none;transition:transform .16s}.Sq7yOW_chevronOpen{transform:rotate(180deg)}.Sq7yOW_body{border-top:1px solid var(--dsw-alias-border-l2);margin:0 16px;padding-bottom:8px}.Sq7yOW_readOnly,.Sq7yOW_notExposed{color:var(--dsw-alias-label-tertiary);margin:12px 0 0;font-size:12px;line-height:1.5}.Sq7yOW_footer{border-top:1px solid var(--dsw-alias-border-l2);justify-content:flex-end;align-items:center;gap:8px;padding:12px 0 4px;display:flex}.Sq7yOW_failed{min-width:0;color:var(--dsw-alias-state-error-primary,#d1242f);flex:1;margin:0;font-size:12px;line-height:1.5}.Sq7yOW_discard,.Sq7yOW_save{appearance:none;font:inherit;cursor:pointer;border:1px solid #0000;border-radius:8px;padding:5px 14px;font-size:13px;line-height:1.5}.Sq7yOW_discard{border-color:var(--dsw-alias-border-l2);color:var(--dsw-alias-label-secondary);background:0 0}.Sq7yOW_discard:hover:not(:disabled){color:var(--dsw-alias-label-primary);border-color:var(--dsw-alias-label-dimmed)}.Sq7yOW_save{background:var(--dsw-alias-label-primary);color:var(--dsw-alias-bg-layer-3)}.Sq7yOW_discard:disabled,.Sq7yOW_save:disabled{opacity:.4;cursor:default}.Sq7yOW_discard:focus-visible,.Sq7yOW_save:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:1px}.Sq7yOW_field{flex-direction:column;gap:6px;padding:12px 0;display:flex}.Sq7yOW_field+.Sq7yOW_field{border-top:1px solid var(--dsw-alias-border-l2)}.Sq7yOW_head{align-items:center;gap:8px;display:flex}.Sq7yOW_label{min-width:0;color:var(--dsw-alias-label-primary);flex:1;font-size:13px;font-weight:500;line-height:1.5}.Sq7yOW_badges{align-items:center;gap:8px;display:inline-flex}.Sq7yOW_badge{white-space:nowrap;background:var(--dsw-alias-bg-module-platform);color:var(--dsw-alias-label-secondary);border-radius:999px;padding:1px 8px;font-size:11px;font-weight:500;line-height:17px}.Sq7yOW_reset{font:inherit;color:var(--dsw-alias-label-secondary);cursor:pointer;background:0 0;border:none;padding:0;font-size:12px;line-height:1.5}.Sq7yOW_reset:hover:not(:disabled){color:var(--dsw-alias-label-primary)}.Sq7yOW_reset:disabled{cursor:default}.Sq7yOW_input{border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-3);height:34px;font:inherit;color:var(--dsw-alias-label-primary);border-radius:8px;padding:0 12px;font-size:13px;line-height:1.5}.Sq7yOW_input:focus-visible{border-color:var(--dsw-alias-brand-primary);outline:none}.Sq7yOW_input:disabled{color:var(--dsw-alias-label-tertiary);cursor:default}.Sq7yOW_hint{color:var(--dsw-alias-label-tertiary);margin:0;font-size:12px;line-height:1.5}.Sq7yOW_colorRow{align-items:center;gap:8px;display:flex}.Sq7yOW_colorInput{border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-3);cursor:pointer;border-radius:8px;width:34px;height:34px;padding:0}.Sq7yOW_colorInput:disabled{opacity:.5;cursor:default}.Sq7yOW_colorInput::-webkit-color-swatch-wrapper{padding:2px}.Sq7yOW_colorInput::-webkit-color-swatch{border:none;border-radius:4px}.Sq7yOW_colorText{flex:1;min-width:0}.Sq7yOW_switchRow{align-items:center;gap:12px;display:flex}.Sq7yOW_switchText{flex:1;min-width:0}.Sq7yOW_switch,.Sq7yOW_switchOn{border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-module-platform);cursor:pointer;border-radius:999px;flex:none;width:38px;height:22px;padding:2px;transition:background .15s,border-color .15s}.Sq7yOW_switchOn{border-color:var(--dsw-alias-state-business-primary,#2f81f7);background:var(--dsw-alias-state-business-primary,#2f81f7)}.Sq7yOW_switch:disabled,.Sq7yOW_switchOn:disabled{opacity:.4;cursor:default}.Sq7yOW_switchThumb{background:#fff;border-radius:50%;width:16px;height:16px;transition:transform .15s;display:block;transform:translate(0);box-shadow:0 1px 2px #00000040}.Sq7yOW_switchOn .Sq7yOW_switchThumb{transform:translate(16px)}";
		const tagId$1 = "dsh-skill-group/settings-card.module.css";
		if (typeof document !== "undefined" && document.querySelector("style[data-plugin-css=" + JSON.stringify(tagId$1) + "]") === null) {
			const tag = document.createElement("style");
			tag.dataset.plugin = "dsh-skill-group";
			tag.dataset.pluginCss = tagId$1;
			tag.textContent = css$1;
			document.head.appendChild(tag);
		}
		var settings_card_module_css_default = {
			"badge": "Sq7yOW_badge",
			"badges": "Sq7yOW_badges",
			"body": "Sq7yOW_body",
			"card": "Sq7yOW_card",
			"cardOpen": "Sq7yOW_cardOpen",
			"chevron": "Sq7yOW_chevron",
			"chevronOpen": "Sq7yOW_chevronOpen",
			"colorInput": "Sq7yOW_colorInput",
			"colorRow": "Sq7yOW_colorRow",
			"colorText": "Sq7yOW_colorText",
			"description": "Sq7yOW_description",
			"discard": "Sq7yOW_discard",
			"failed": "Sq7yOW_failed",
			"field": "Sq7yOW_field",
			"footer": "Sq7yOW_footer",
			"head": "Sq7yOW_head",
			"headText": "Sq7yOW_headText",
			"header": "Sq7yOW_header",
			"hint": "Sq7yOW_hint",
			"input": "Sq7yOW_input",
			"label": "Sq7yOW_label",
			"name": "Sq7yOW_name",
			"notExposed": "Sq7yOW_notExposed",
			"pending": "Sq7yOW_pending",
			"readOnly": "Sq7yOW_readOnly",
			"reset": "Sq7yOW_reset",
			"save": "Sq7yOW_save",
			"switch": "Sq7yOW_switch",
			"switchOn": "Sq7yOW_switchOn",
			"switchRow": "Sq7yOW_switchRow",
			"switchText": "Sq7yOW_switchText",
			"switchThumb": "Sq7yOW_switchThumb",
			"versionTag": "Sq7yOW_versionTag"
		};
		//#endregion
		//#region src/client/settings-card.tsx
		/**
		* Shared chrome for the plugin settings card, aligned with the official
		* dsh-client-ui-settings-plugins PluginCard design language: the same tokens,
		* disclosure header, field rhythm, and copy. Renders nothing while the
		* namespace is unavailable — a deployment that does not compose the owning
		* plugin should show no trace of it.
		*/
		/**
		* Render one plugin settings card.
		* @param props - the plugin's copy keys, its form state, and its controls.
		* @returns the card, or nothing while the namespace is still loading.
		*/
		function PluginSettingsCard(props) {
			const [open, setOpen] = (0, react.useState)(false);
			const { state } = props;
			if (!state.available) return null;
			const title = props.t(props.titleKey);
			const blocked = !state.dirty || state.invalid || state.saving;
			const header = /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("button", {
				type: "button",
				className: settings_card_module_css_default.header,
				"aria-expanded": open,
				"aria-label": props.t(open ? "settings.collapse" : "settings.expand") + ": " + title,
				onClick: () => {
					setOpen(!open);
				},
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
						className: settings_card_module_css_default.headText,
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
							className: settings_card_module_css_default.name,
							children: [title, props.version !== void 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
								className: settings_card_module_css_default.versionTag,
								children: ["v", props.version]
							}) : null]
						}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
							className: settings_card_module_css_default.description,
							children: props.t(props.descriptionKey)
						})]
					}),
					state.dirty ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
						className: settings_card_module_css_default.pending,
						children: props.t("settings.unsaved")
					}) : null,
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)(IconChevronDownOutline14, { className: open ? settings_card_module_css_default.chevronOpen : settings_card_module_css_default.chevron })
				]
			});
			if (!state.exposed) return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("li", {
				className: settings_card_module_css_default.card + (open ? " " + settings_card_module_css_default.cardOpen : ""),
				children: [header, open ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
					className: settings_card_module_css_default.body,
					children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
						className: settings_card_module_css_default.notExposed,
						role: "status",
						children: props.t("settings.notExposed")
					})
				}) : null]
			});
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("li", {
				className: settings_card_module_css_default.card + (open ? " " + settings_card_module_css_default.cardOpen : ""),
				children: [header, open ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					className: settings_card_module_css_default.body,
					children: [
						!state.writable ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
							className: settings_card_module_css_default.readOnly,
							role: "status",
							children: props.t("settings.readOnly")
						}) : null,
						props.children,
						/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							className: settings_card_module_css_default.footer,
							children: [
								state.failed ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
									className: settings_card_module_css_default.failed,
									role: "status",
									children: props.t("settings.saveFailed")
								}) : null,
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
									type: "button",
									className: settings_card_module_css_default.discard,
									disabled: !state.dirty || state.saving,
									onClick: props.onDiscard,
									children: props.t("settings.discard")
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
									type: "button",
									className: settings_card_module_css_default.save,
									disabled: blocked,
									onClick: props.onSave,
									children: props.t(!state.saving ? "settings.save" : "settings.saving")
								})
							]
						})
					]
				}) : null]
			});
		}
		/**
		* The head row every staged field shares: the label (plain text when the
		* control has no id) plus the overridden badge and its reset button.
		*/
		function FieldShell(props) {
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: settings_card_module_css_default.head,
				children: [props.id !== void 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("label", {
					className: settings_card_module_css_default.label,
					htmlFor: props.id,
					children: props.label
				}) : /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
					className: settings_card_module_css_default.label,
					children: props.label
				}), props.overridden ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
					className: settings_card_module_css_default.badges,
					children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
						className: settings_card_module_css_default.badge,
						children: props.overriddenLabel
					}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
						type: "button",
						className: settings_card_module_css_default.reset,
						disabled: props.disabled,
						onClick: props.onReset,
						children: props.resetLabel
					})]
				}) : null]
			});
		}
		function SwitchField(props) {
			const checked = props.text !== "false";
			return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
				className: settings_card_module_css_default.field,
				children: /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					className: settings_card_module_css_default.switchRow,
					children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: settings_card_module_css_default.switchText,
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)(FieldShell, { ...props }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
							className: settings_card_module_css_default.hint,
							children: props.hint
						})]
					}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
						type: "button",
						className: checked ? settings_card_module_css_default.switchOn : settings_card_module_css_default.switch,
						role: "switch",
						"aria-checked": checked,
						"aria-label": props.label,
						disabled: props.disabled,
						onClick: () => {
							props.onEdit(String(!checked));
						},
						children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { className: settings_card_module_css_default.switchThumb })
					})]
				})
			});
		}
		function ColorField(props) {
			const value = /^#[0-9a-f]{6}$/i.test(props.text) ? props.text : props.defaultColor;
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: settings_card_module_css_default.field,
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)(FieldShell, { ...props }),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: settings_card_module_css_default.colorRow,
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
							id: props.id,
							type: "color",
							className: settings_card_module_css_default.colorInput,
							value,
							disabled: props.disabled,
							onChange: (event) => {
								props.onEdit(event.target.value);
							}
						}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
							type: "text",
							className: settings_card_module_css_default.input + " " + settings_card_module_css_default.colorText,
							value: props.text,
							disabled: props.disabled,
							placeholder: props.inheritLabel,
							onChange: (event) => {
								props.onEdit(event.target.value.trim());
							}
						})]
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
						className: settings_card_module_css_default.hint,
						children: props.hint
					})
				]
			});
		}
		function SecretField(props) {
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: settings_card_module_css_default.field,
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)(FieldShell, { ...props }),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
						id: props.id,
						type: "password",
						autoComplete: "off",
						spellCheck: false,
						className: settings_card_module_css_default.input,
						value: props.text,
						disabled: props.disabled,
						placeholder: props.placeholder,
						"aria-invalid": props.invalid === true,
						onChange: (event) => {
							props.onEdit(event.target.value);
						}
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
						className: settings_card_module_css_default.hint,
						children: props.hint
					})
				]
			});
		}
		function NumberField(props) {
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: settings_card_module_css_default.field,
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)(FieldShell, { ...props }),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
						id: props.id,
						type: "text",
						inputMode: "numeric",
						className: settings_card_module_css_default.input,
						value: props.text,
						disabled: props.disabled,
						placeholder: props.inheritLabel,
						"aria-invalid": props.invalid === true,
						onChange: (event) => {
							props.onEdit(event.target.value);
						}
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
						className: settings_card_module_css_default.hint,
						children: props.hint
					})
				]
			});
		}
		//#endregion
		//#region node_modules/.pnpm/zustand@4.4.7_@types+react@18.3.31_immer@10.2.0_react@18.3.1/node_modules/zustand/esm/vanilla.mjs
		const createStoreImpl = (createState) => {
			let state;
			const listeners = /* @__PURE__ */ new Set();
			const setState = (partial, replace) => {
				const nextState = typeof partial === "function" ? partial(state) : partial;
				if (!Object.is(nextState, state)) {
					const previousState = state;
					state = (replace != null ? replace : typeof nextState !== "object" || nextState === null) ? nextState : Object.assign({}, state, nextState);
					listeners.forEach((listener) => listener(state, previousState));
				}
			};
			const getState = () => state;
			const subscribe = (listener) => {
				listeners.add(listener);
				return () => listeners.delete(listener);
			};
			const destroy = () => {
				listeners.clear();
			};
			const api = {
				setState,
				getState,
				subscribe,
				destroy
			};
			state = createState(setState, getState, api);
			return api;
		};
		const createStore = (createState) => createState ? createStoreImpl(createState) : createStoreImpl;
		//#endregion
		//#region node_modules/.pnpm/zustand@4.4.7_@types+react@18.3.31_immer@10.2.0_react@18.3.1/node_modules/zustand/esm/middleware.mjs
		const subscribeWithSelectorImpl = (fn) => (set, get, api) => {
			const origSubscribe = api.subscribe;
			api.subscribe = (selector, optListener, options) => {
				let listener = selector;
				if (optListener) {
					const equalityFn = (options == null ? void 0 : options.equalityFn) || Object.is;
					let currentSlice = selector(api.getState());
					listener = (state) => {
						const nextSlice = selector(state);
						if (!equalityFn(currentSlice, nextSlice)) {
							const previousSlice = currentSlice;
							optListener(currentSlice = nextSlice, previousSlice);
						}
					};
					if (options == null ? void 0 : options.fireImmediately) optListener(currentSlice, currentSlice);
				}
				return origSubscribe(listener);
			};
			return fn(set, get, api);
		};
		const subscribeWithSelector = subscribeWithSelectorImpl;
		//#endregion
		//#region node_modules/.pnpm/immer@10.2.0/node_modules/immer/dist/immer.mjs
		var NOTHING = Symbol.for("immer-nothing");
		var DRAFTABLE = Symbol.for("immer-draftable");
		var DRAFT_STATE = Symbol.for("immer-state");
		function die(error, ...args) {
			throw new Error(`[Immer] minified error nr: ${error}. Full error at: https://bit.ly/3cXEKWf`);
		}
		var getPrototypeOf = Object.getPrototypeOf;
		function isDraft(value) {
			return !!value && !!value[DRAFT_STATE];
		}
		function isDraftable(value) {
			if (!value) return false;
			return isPlainObject(value) || Array.isArray(value) || !!value[DRAFTABLE] || !!value.constructor?.[DRAFTABLE] || isMap(value) || isSet(value);
		}
		var objectCtorString = Object.prototype.constructor.toString();
		var cachedCtorStrings = /* @__PURE__ */ new WeakMap();
		function isPlainObject(value) {
			if (!value || typeof value !== "object") return false;
			const proto = Object.getPrototypeOf(value);
			if (proto === null || proto === Object.prototype) return true;
			const Ctor = Object.hasOwnProperty.call(proto, "constructor") && proto.constructor;
			if (Ctor === Object) return true;
			if (typeof Ctor !== "function") return false;
			let ctorString = cachedCtorStrings.get(Ctor);
			if (ctorString === void 0) {
				ctorString = Function.toString.call(Ctor);
				cachedCtorStrings.set(Ctor, ctorString);
			}
			return ctorString === objectCtorString;
		}
		function each(obj, iter, strict = true) {
			if (getArchtype(obj) === 0) (strict ? Reflect.ownKeys(obj) : Object.keys(obj)).forEach((key) => {
				iter(key, obj[key], obj);
			});
			else obj.forEach((entry, index) => iter(index, entry, obj));
		}
		function getArchtype(thing) {
			const state = thing[DRAFT_STATE];
			return state ? state.type_ : Array.isArray(thing) ? 1 : isMap(thing) ? 2 : isSet(thing) ? 3 : 0;
		}
		function has(thing, prop) {
			return getArchtype(thing) === 2 ? thing.has(prop) : Object.prototype.hasOwnProperty.call(thing, prop);
		}
		function set(thing, propOrOldValue, value) {
			const t = getArchtype(thing);
			if (t === 2) thing.set(propOrOldValue, value);
			else if (t === 3) thing.add(value);
			else thing[propOrOldValue] = value;
		}
		function is(x, y) {
			if (x === y) return x !== 0 || 1 / x === 1 / y;
			else return x !== x && y !== y;
		}
		function isMap(target) {
			return target instanceof Map;
		}
		function isSet(target) {
			return target instanceof Set;
		}
		function latest(state) {
			return state.copy_ || state.base_;
		}
		function shallowCopy(base, strict) {
			if (isMap(base)) return new Map(base);
			if (isSet(base)) return new Set(base);
			if (Array.isArray(base)) return Array.prototype.slice.call(base);
			const isPlain = isPlainObject(base);
			if (strict === true || strict === "class_only" && !isPlain) {
				const descriptors = Object.getOwnPropertyDescriptors(base);
				delete descriptors[DRAFT_STATE];
				let keys = Reflect.ownKeys(descriptors);
				for (let i = 0; i < keys.length; i++) {
					const key = keys[i];
					const desc = descriptors[key];
					if (desc.writable === false) {
						desc.writable = true;
						desc.configurable = true;
					}
					if (desc.get || desc.set) descriptors[key] = {
						configurable: true,
						writable: true,
						enumerable: desc.enumerable,
						value: base[key]
					};
				}
				return Object.create(getPrototypeOf(base), descriptors);
			} else {
				const proto = getPrototypeOf(base);
				if (proto !== null && isPlain) return { ...base };
				const obj = Object.create(proto);
				return Object.assign(obj, base);
			}
		}
		function freeze(obj, deep = false) {
			if (isFrozen(obj) || isDraft(obj) || !isDraftable(obj)) return obj;
			if (getArchtype(obj) > 1) Object.defineProperties(obj, {
				set: dontMutateMethodOverride,
				add: dontMutateMethodOverride,
				clear: dontMutateMethodOverride,
				delete: dontMutateMethodOverride
			});
			Object.freeze(obj);
			if (deep) Object.values(obj).forEach((value) => freeze(value, true));
			return obj;
		}
		function dontMutateFrozenCollections() {
			die(2);
		}
		var dontMutateMethodOverride = { value: dontMutateFrozenCollections };
		function isFrozen(obj) {
			if (obj === null || typeof obj !== "object") return true;
			return Object.isFrozen(obj);
		}
		var plugins = {};
		function getPlugin(pluginKey) {
			const plugin = plugins[pluginKey];
			if (!plugin) die(0, pluginKey);
			return plugin;
		}
		var currentScope;
		function getCurrentScope() {
			return currentScope;
		}
		function createScope(parent_, immer_) {
			return {
				drafts_: [],
				parent_,
				immer_,
				canAutoFreeze_: true,
				unfinalizedDrafts_: 0
			};
		}
		function usePatchesInScope(scope, patchListener) {
			if (patchListener) {
				getPlugin("Patches");
				scope.patches_ = [];
				scope.inversePatches_ = [];
				scope.patchListener_ = patchListener;
			}
		}
		function revokeScope(scope) {
			leaveScope(scope);
			scope.drafts_.forEach(revokeDraft);
			scope.drafts_ = null;
		}
		function leaveScope(scope) {
			if (scope === currentScope) currentScope = scope.parent_;
		}
		function enterScope(immer2) {
			return currentScope = createScope(currentScope, immer2);
		}
		function revokeDraft(draft) {
			const state = draft[DRAFT_STATE];
			if (state.type_ === 0 || state.type_ === 1) state.revoke_();
			else state.revoked_ = true;
		}
		function processResult(result, scope) {
			scope.unfinalizedDrafts_ = scope.drafts_.length;
			const baseDraft = scope.drafts_[0];
			if (result !== void 0 && result !== baseDraft) {
				if (baseDraft[DRAFT_STATE].modified_) {
					revokeScope(scope);
					die(4);
				}
				if (isDraftable(result)) {
					result = finalize(scope, result);
					if (!scope.parent_) maybeFreeze(scope, result);
				}
				if (scope.patches_) getPlugin("Patches").generateReplacementPatches_(baseDraft[DRAFT_STATE].base_, result, scope.patches_, scope.inversePatches_);
			} else result = finalize(scope, baseDraft, []);
			revokeScope(scope);
			if (scope.patches_) scope.patchListener_(scope.patches_, scope.inversePatches_);
			return result !== NOTHING ? result : void 0;
		}
		function finalize(rootScope, value, path) {
			if (isFrozen(value)) return value;
			const useStrictIteration = rootScope.immer_.shouldUseStrictIteration();
			const state = value[DRAFT_STATE];
			if (!state) {
				each(value, (key, childValue) => finalizeProperty(rootScope, state, value, key, childValue, path), useStrictIteration);
				return value;
			}
			if (state.scope_ !== rootScope) return value;
			if (!state.modified_) {
				maybeFreeze(rootScope, state.base_, true);
				return state.base_;
			}
			if (!state.finalized_) {
				state.finalized_ = true;
				state.scope_.unfinalizedDrafts_--;
				const result = state.copy_;
				let resultEach = result;
				let isSet2 = false;
				if (state.type_ === 3) {
					resultEach = new Set(result);
					result.clear();
					isSet2 = true;
				}
				each(resultEach, (key, childValue) => finalizeProperty(rootScope, state, result, key, childValue, path, isSet2), useStrictIteration);
				maybeFreeze(rootScope, result, false);
				if (path && rootScope.patches_) getPlugin("Patches").generatePatches_(state, path, rootScope.patches_, rootScope.inversePatches_);
			}
			return state.copy_;
		}
		function finalizeProperty(rootScope, parentState, targetObject, prop, childValue, rootPath, targetIsSet) {
			if (childValue == null) return;
			if (typeof childValue !== "object" && !targetIsSet) return;
			const childIsFrozen = isFrozen(childValue);
			if (childIsFrozen && !targetIsSet) return;
			if (isDraft(childValue)) {
				const res = finalize(rootScope, childValue, rootPath && parentState && parentState.type_ !== 3 && !has(parentState.assigned_, prop) ? rootPath.concat(prop) : void 0);
				set(targetObject, prop, res);
				if (isDraft(res)) rootScope.canAutoFreeze_ = false;
				else return;
			} else if (targetIsSet) targetObject.add(childValue);
			if (isDraftable(childValue) && !childIsFrozen) {
				if (!rootScope.immer_.autoFreeze_ && rootScope.unfinalizedDrafts_ < 1) return;
				if (parentState && parentState.base_ && parentState.base_[prop] === childValue && childIsFrozen) return;
				finalize(rootScope, childValue);
				if ((!parentState || !parentState.scope_.parent_) && typeof prop !== "symbol" && (isMap(targetObject) ? targetObject.has(prop) : Object.prototype.propertyIsEnumerable.call(targetObject, prop))) maybeFreeze(rootScope, childValue);
			}
		}
		function maybeFreeze(scope, value, deep = false) {
			if (!scope.parent_ && scope.immer_.autoFreeze_ && scope.canAutoFreeze_) freeze(value, deep);
		}
		function createProxyProxy(base, parent) {
			const isArray = Array.isArray(base);
			const state = {
				type_: isArray ? 1 : 0,
				scope_: parent ? parent.scope_ : getCurrentScope(),
				modified_: false,
				finalized_: false,
				assigned_: {},
				parent_: parent,
				base_: base,
				draft_: null,
				copy_: null,
				revoke_: null,
				isManual_: false
			};
			let target = state;
			let traps = objectTraps;
			if (isArray) {
				target = [state];
				traps = arrayTraps;
			}
			const { revoke, proxy } = Proxy.revocable(target, traps);
			state.draft_ = proxy;
			state.revoke_ = revoke;
			return proxy;
		}
		var objectTraps = {
			get(state, prop) {
				if (prop === DRAFT_STATE) return state;
				const source = latest(state);
				if (!has(source, prop)) return readPropFromProto(state, source, prop);
				const value = source[prop];
				if (state.finalized_ || !isDraftable(value)) return value;
				if (value === peek(state.base_, prop)) {
					prepareCopy(state);
					return state.copy_[prop] = createProxy(value, state);
				}
				return value;
			},
			has(state, prop) {
				return prop in latest(state);
			},
			ownKeys(state) {
				return Reflect.ownKeys(latest(state));
			},
			set(state, prop, value) {
				const desc = getDescriptorFromProto(latest(state), prop);
				if (desc?.set) {
					desc.set.call(state.draft_, value);
					return true;
				}
				if (!state.modified_) {
					const current2 = peek(latest(state), prop);
					const currentState = current2?.[DRAFT_STATE];
					if (currentState && currentState.base_ === value) {
						state.copy_[prop] = value;
						state.assigned_[prop] = false;
						return true;
					}
					if (is(value, current2) && (value !== void 0 || has(state.base_, prop))) return true;
					prepareCopy(state);
					markChanged(state);
				}
				if (state.copy_[prop] === value && (value !== void 0 || prop in state.copy_) || Number.isNaN(value) && Number.isNaN(state.copy_[prop])) return true;
				state.copy_[prop] = value;
				state.assigned_[prop] = true;
				return true;
			},
			deleteProperty(state, prop) {
				if (peek(state.base_, prop) !== void 0 || prop in state.base_) {
					state.assigned_[prop] = false;
					prepareCopy(state);
					markChanged(state);
				} else delete state.assigned_[prop];
				if (state.copy_) delete state.copy_[prop];
				return true;
			},
			getOwnPropertyDescriptor(state, prop) {
				const owner = latest(state);
				const desc = Reflect.getOwnPropertyDescriptor(owner, prop);
				if (!desc) return desc;
				return {
					writable: true,
					configurable: state.type_ !== 1 || prop !== "length",
					enumerable: desc.enumerable,
					value: owner[prop]
				};
			},
			defineProperty() {
				die(11);
			},
			getPrototypeOf(state) {
				return getPrototypeOf(state.base_);
			},
			setPrototypeOf() {
				die(12);
			}
		};
		var arrayTraps = {};
		each(objectTraps, (key, fn) => {
			arrayTraps[key] = function() {
				arguments[0] = arguments[0][0];
				return fn.apply(this, arguments);
			};
		});
		arrayTraps.deleteProperty = function(state, prop) {
			return arrayTraps.set.call(this, state, prop, void 0);
		};
		arrayTraps.set = function(state, prop, value) {
			return objectTraps.set.call(this, state[0], prop, value, state[0]);
		};
		function peek(draft, prop) {
			const state = draft[DRAFT_STATE];
			return (state ? latest(state) : draft)[prop];
		}
		function readPropFromProto(state, source, prop) {
			const desc = getDescriptorFromProto(source, prop);
			return desc ? `value` in desc ? desc.value : desc.get?.call(state.draft_) : void 0;
		}
		function getDescriptorFromProto(source, prop) {
			if (!(prop in source)) return void 0;
			let proto = getPrototypeOf(source);
			while (proto) {
				const desc = Object.getOwnPropertyDescriptor(proto, prop);
				if (desc) return desc;
				proto = getPrototypeOf(proto);
			}
		}
		function markChanged(state) {
			if (!state.modified_) {
				state.modified_ = true;
				if (state.parent_) markChanged(state.parent_);
			}
		}
		function prepareCopy(state) {
			if (!state.copy_) state.copy_ = shallowCopy(state.base_, state.scope_.immer_.useStrictShallowCopy_);
		}
		var Immer2 = class {
			constructor(config) {
				this.autoFreeze_ = true;
				this.useStrictShallowCopy_ = false;
				this.useStrictIteration_ = true;
				/**
				* The `produce` function takes a value and a "recipe function" (whose
				* return value often depends on the base state). The recipe function is
				* free to mutate its first argument however it wants. All mutations are
				* only ever applied to a __copy__ of the base state.
				*
				* Pass only a function to create a "curried producer" which relieves you
				* from passing the recipe function every time.
				*
				* Only plain objects and arrays are made mutable. All other objects are
				* considered uncopyable.
				*
				* Note: This function is __bound__ to its `Immer` instance.
				*
				* @param {any} base - the initial state
				* @param {Function} recipe - function that receives a proxy of the base state as first argument and which can be freely modified
				* @param {Function} patchListener - optional function that will be called with all the patches produced here
				* @returns {any} a new state, or the initial state if nothing was modified
				*/
				this.produce = (base, recipe, patchListener) => {
					if (typeof base === "function" && typeof recipe !== "function") {
						const defaultBase = recipe;
						recipe = base;
						const self = this;
						return function curriedProduce(base2 = defaultBase, ...args) {
							return self.produce(base2, (draft) => recipe.call(this, draft, ...args));
						};
					}
					if (typeof recipe !== "function") die(6);
					if (patchListener !== void 0 && typeof patchListener !== "function") die(7);
					let result;
					if (isDraftable(base)) {
						const scope = enterScope(this);
						const proxy = createProxy(base, void 0);
						let hasError = true;
						try {
							result = recipe(proxy);
							hasError = false;
						} finally {
							if (hasError) revokeScope(scope);
							else leaveScope(scope);
						}
						usePatchesInScope(scope, patchListener);
						return processResult(result, scope);
					} else if (!base || typeof base !== "object") {
						result = recipe(base);
						if (result === void 0) result = base;
						if (result === NOTHING) result = void 0;
						if (this.autoFreeze_) freeze(result, true);
						if (patchListener) {
							const p = [];
							const ip = [];
							getPlugin("Patches").generateReplacementPatches_(base, result, p, ip);
							patchListener(p, ip);
						}
						return result;
					} else die(1, base);
				};
				this.produceWithPatches = (base, recipe) => {
					if (typeof base === "function") return (state, ...args) => this.produceWithPatches(state, (draft) => base(draft, ...args));
					let patches, inversePatches;
					return [
						this.produce(base, recipe, (p, ip) => {
							patches = p;
							inversePatches = ip;
						}),
						patches,
						inversePatches
					];
				};
				if (typeof config?.autoFreeze === "boolean") this.setAutoFreeze(config.autoFreeze);
				if (typeof config?.useStrictShallowCopy === "boolean") this.setUseStrictShallowCopy(config.useStrictShallowCopy);
				if (typeof config?.useStrictIteration === "boolean") this.setUseStrictIteration(config.useStrictIteration);
			}
			createDraft(base) {
				if (!isDraftable(base)) die(8);
				if (isDraft(base)) base = current(base);
				const scope = enterScope(this);
				const proxy = createProxy(base, void 0);
				proxy[DRAFT_STATE].isManual_ = true;
				leaveScope(scope);
				return proxy;
			}
			finishDraft(draft, patchListener) {
				const state = draft && draft[DRAFT_STATE];
				if (!state || !state.isManual_) die(9);
				const { scope_: scope } = state;
				usePatchesInScope(scope, patchListener);
				return processResult(void 0, scope);
			}
			/**
			* Pass true to automatically freeze all copies created by Immer.
			*
			* By default, auto-freezing is enabled.
			*/
			setAutoFreeze(value) {
				this.autoFreeze_ = value;
			}
			/**
			* Pass true to enable strict shallow copy.
			*
			* By default, immer does not copy the object descriptors such as getter, setter and non-enumrable properties.
			*/
			setUseStrictShallowCopy(value) {
				this.useStrictShallowCopy_ = value;
			}
			/**
			* Pass false to use faster iteration that skips non-enumerable properties
			* but still handles symbols for compatibility.
			*
			* By default, strict iteration is enabled (includes all own properties).
			*/
			setUseStrictIteration(value) {
				this.useStrictIteration_ = value;
			}
			shouldUseStrictIteration() {
				return this.useStrictIteration_;
			}
			applyPatches(base, patches) {
				let i;
				for (i = patches.length - 1; i >= 0; i--) {
					const patch = patches[i];
					if (patch.path.length === 0 && patch.op === "replace") {
						base = patch.value;
						break;
					}
				}
				if (i > -1) patches = patches.slice(i + 1);
				const applyPatchesImpl = getPlugin("Patches").applyPatches_;
				if (isDraft(base)) return applyPatchesImpl(base, patches);
				return this.produce(base, (draft) => applyPatchesImpl(draft, patches));
			}
		};
		function createProxy(value, parent) {
			const draft = isMap(value) ? getPlugin("MapSet").proxyMap_(value, parent) : isSet(value) ? getPlugin("MapSet").proxySet_(value, parent) : createProxyProxy(value, parent);
			(parent ? parent.scope_ : getCurrentScope()).drafts_.push(draft);
			return draft;
		}
		function current(value) {
			if (!isDraft(value)) die(10, value);
			return currentImpl(value);
		}
		function currentImpl(value) {
			if (!isDraftable(value) || isFrozen(value)) return value;
			const state = value[DRAFT_STATE];
			let copy;
			let strict = true;
			if (state) {
				if (!state.modified_) return state.base_;
				state.finalized_ = true;
				copy = shallowCopy(value, state.scope_.immer_.useStrictShallowCopy_);
				strict = state.scope_.immer_.shouldUseStrictIteration();
			} else copy = shallowCopy(value, true);
			each(copy, (key, childValue) => {
				set(copy, key, currentImpl(childValue));
			}, strict);
			if (state) state.finalized_ = false;
			return copy;
		}
		var produce = new Immer2().produce;
		//#endregion
		//#region node_modules/.pnpm/@deepseek-ai+dsh-client-store@0.1.7-rc.1_@deepseek-ai+cordis@4.0.4/node_modules/@deepseek-ai/dsh-client-store/lib/index.js
		/**
		* React-free snapshot store engine (zustand vanilla + immer + subscribeWithSelector +
		* rafFlush middleware + opt-in persist + dev freeze) plus the declarative
		* shell over it: {@link defineStore} bakes an init/persist/actions literal
		* into a {@link StoreHandle}, the registration-side store seat of slot
		* terminals. Engine products are bare observables — subscribe/getSnapshot/
		* update/set, NO selector hook. Hook synthesis is ui-renderer's (the one
		* uSES bridge, cached per source at the binding site).
		*/
		/**
		* Notify an observer set without allowing one callback to starve the rest.
		* @param listeners - current observer callbacks; copied before dispatch.
		* @param label - diagnostic owner prefix.
		* @param args - callback arguments.
		*/
		function notifySubscribers(listeners, label, ...args) {
			for (const listener of [...listeners]) try {
				listener(...args);
			} catch (error) {
				console.error(`${label} subscriber failed:`, error);
			}
		}
		/** Batches subscriber notification into one flush per animation frame. */
		function rafBatch(notify) {
			const schedule = typeof requestAnimationFrame === "function" ? (fn) => {
				requestAnimationFrame(() => {
					fn();
				});
			} : (fn) => {
				queueMicrotask(fn);
			};
			let scheduled = false;
			return () => {
				if (scheduled) return;
				scheduled = true;
				schedule(() => {
					scheduled = false;
					notify();
				});
			};
		}
		/**
		* Create a snapshot store.
		*
		* Flush default is 'sync' (controlled inputs need same-tick echo); frame-driven
		* stores opt into 'raf', where a frame's worth of updates coalesces into one
		* notification. Known raf-mode tradeoff: a component mounting mid-frame reads
		* fresh state while existing subscribers hear it next flush — transient
		* frame-level skew, same nature as the object layer's microtask batching.
		*
		* @param init - initial state.
		* @param opts - flush mode and opt-in persistence (localStorage, keyed by name).
		* @returns the store.
		*/
		function createSnapshotStore(init, opts) {
			const withSelector = subscribeWithSelector(() => init);
			const api = createStore()(withSelector);
			if (opts?.persist) attachPersistence(api, opts.persist.name);
			let subscribe = (fn) => api.subscribe(() => {
				notifySubscribers([fn], "[client-store]");
			});
			if (opts?.flush === "raf") {
				const listeners = /* @__PURE__ */ new Set();
				const flush = rafBatch(() => {
					notifySubscribers(listeners, "[client-store]");
				});
				api.subscribe(flush);
				subscribe = (fn) => {
					listeners.add(fn);
					return () => {
						listeners.delete(fn);
					};
				};
			}
			return {
				getSnapshot: () => api.getState(),
				subscribe: (fn) => subscribe(fn),
				update: (mutator) => {
					api.setState(produce(api.getState(), (draft) => {
						mutator(draft);
					}), true);
				},
				set: (next) => {
					api.setState(devFreeze(next), true);
				}
			};
		}
		/**
		* Whole-value JSON persistence to localStorage. Hand-rolled instead of the
		* zustand persist middleware: its write path spreads state into an object
		* (`partialize({ ...get() })`), exploding primitive state (a persisted string
		* draft becomes {0:'h',1:'e',...}) — not fixable via merge/deserialize options
		* because the corruption happens before serialization. Storage failures
		* (quota, private mode) only disable persistence, never break the store.
		*/
		function attachPersistence(api, name) {
			if (typeof localStorage === "undefined") return;
			try {
				const raw = localStorage.getItem(name);
				if (raw !== null) api.setState(devFreeze(JSON.parse(raw)), true);
			} catch (error) {
				console.error(`snapshot store '${name}' rehydration failed:`, error);
			}
			api.subscribe((state) => {
				try {
					localStorage.setItem(name, JSON.stringify(state));
				} catch (error) {
					console.error(`snapshot store '${name}' persistence failed:`, error);
				}
			});
		}
		/** Deep-freeze draftable wholesale-set state outside production: set() bypasses immer's freeze. */
		function devFreeze(value) {
			return freeze(value, true);
		}
		//#endregion
		//#region src/client/settings-form.ts
		/**
		* Settings-card form machinery, vendored from the dsh-web-ui family bucket
		* (packages/dsh-task-board/src/client/settings-form.ts) and re-typed. Stages
		* one card's edits over one settings namespace and writes them on save.
		*
		* The Host is the only authority on whether a value was accepted — its
		* validators own the constraints no schema can express — so the outcome is
		* read back from the section rather than predicted here. A save that did not
		* land keeps its drafts, so the user can correct them instead of retyping.
		*/
		/** A boolean field, edited through true/false draft text. */
		function booleanField(field) {
			return {
				field,
				format: (value) => typeof value === "boolean" ? String(value) : "",
				parse: (text) => {
					if (text === "true") return {
						kind: "set",
						value: true
					};
					if (text === "false") return {
						kind: "set",
						value: false
					};
				}
			};
		}
		/** A #rrggbb color field, edited through hex draft text. */
		function colorField(field) {
			return {
				field,
				format: (value) => typeof value === "string" && /^#[0-9a-f]{6}$/i.test(value) ? value : "",
				parse: (text) => {
					if (/^#[0-9a-f]{6}$/i.test(text)) return {
						kind: "set",
						value: text
					};
				}
			};
		}
		/**
		* A secret field (API token): the stored value is never echoed back into the
		* draft (format always yields ''), so typing is always a fresh set and Reset
		* always unsets. An empty draft stages nothing.
		*/
		function secretField(field) {
			return {
				field,
				format: () => "",
				parse: (text) => {
					const trimmed = text.trim();
					if (trimmed === "") return void 0;
					if (!/^[A-Za-z0-9_-]{8,255}$/.test(trimmed)) return void 0;
					return {
						kind: "set",
						value: trimmed
					};
				}
			};
		}
		/**
		* A numeric field with range clamping. Integer by default: a fractional draft
		* is truncated so "5.5 分钟" cannot sneak past an integer-only schema.
		*/
		function numberField(field, options = {}) {
			const min = options.min ?? Number.NEGATIVE_INFINITY;
			const max = options.max ?? Number.POSITIVE_INFINITY;
			const integer = options.integer ?? true;
			return {
				field,
				format: (value) => typeof value === "number" && Number.isFinite(value) ? String(value) : "",
				parse: (text) => {
					const trimmed = text.trim();
					if (!/^-?\d+(\.\d+)?$/.test(trimmed)) return void 0;
					const parsed = integer ? Math.trunc(Number(trimmed)) : Number(trimmed);
					if (!Number.isFinite(parsed) || parsed < min || parsed > max) return void 0;
					return {
						kind: "set",
						value: parsed
					};
				}
			};
		}
		/** Stages one card's edits and writes them through the settings transport. */
		var CardForm = class {
			scope;
			specs = /* @__PURE__ */ new Map();
			staged = /* @__PURE__ */ new Map();
			listeners = /* @__PURE__ */ new Set();
			saving = false;
			failed = false;
			/** @param scope - the bound settings scope for this card's namespace. */
			constructor(scope, specs) {
				this.scope = scope;
				for (const spec of specs) this.specs.set(spec.field, spec);
				scope.subscribe(() => {
					this.publish();
				});
			}
			/** Publish a projection of this form, rebuilt whenever the scope or a draft changes. */
			bind(project) {
				const store = createSnapshotStore(project());
				this.listeners.add(() => {
					store.set(project());
				});
				return store;
			}
			/** Read the card-level state: what the Host serves, and what a save would do. */
			shell() {
				const snapshot = this.scope.getSnapshot();
				const plan = this.plan();
				return {
					available: snapshot.status !== "loading",
					exposed: snapshot.status === "ready",
					writable: snapshot.writable,
					dirty: plan.length > 0,
					invalid: plan.some((item) => item.run === void 0),
					saving: this.saving,
					failed: this.failed
				};
			}
			/** Read one field's state from the effective section and its staged draft. */
			field(field) {
				const spec = this.specOf(field);
				const staged = this.staged.get(field);
				if (staged === void 0) return {
					text: spec.format(this.sectionValue(field)),
					overridden: this.stored(field),
					invalid: false
				};
				const write = staged.clear ? { kind: "clear" } : spec.parse(staged.text);
				return {
					text: staged.text,
					overridden: write?.kind === "set",
					invalid: write === void 0
				};
			}
			/** The actions the card's slot registration injects. */
			actions() {
				return {
					edit: (field, text) => {
						this.stage(field, {
							text,
							clear: false
						});
					},
					resetField: (field) => {
						this.stage(field, {
							text: this.specOf(field).format(this.baseValue(field)),
							clear: true
						});
					},
					save: () => {
						this.save();
					},
					discard: () => {
						if (this.staged.size === 0 && !this.failed) return;
						this.staged.clear();
						this.failed = false;
						this.publish();
					}
				};
			}
			/** Write every staged edit, then re-seed from what the Host accepted. */
			async save() {
				const plan = this.plan();
				const writes = plan.flatMap((item) => item.run === void 0 ? [] : [item.run]);
				if (plan.length === 0 || this.saving || writes.length !== plan.length) return;
				this.saving = true;
				this.failed = false;
				this.publish();
				let landed = true;
				for (const write of writes) landed = await write() && landed;
				if (landed) this.staged.clear();
				this.saving = false;
				this.failed = !landed;
				this.publish();
			}
			/** Every staged edit a save would write, in staging order. */
			plan() {
				const plan = [];
				for (const [field, staged] of this.staged) {
					const spec = this.specOf(field);
					if (staged.clear) {
						if (this.stored(field)) plan.push({
							field,
							run: () => this.clear(field)
						});
						continue;
					}
					if (staged.text === spec.format(this.sectionValue(field))) continue;
					const write = spec.parse(staged.text);
					if (write === void 0) plan.push({
						field,
						run: void 0
					});
					else if (write.kind === "clear") plan.push({
						field,
						run: () => this.clear(field)
					});
					else plan.push({
						field,
						run: () => this.store(field, write.value)
					});
				}
				return plan;
			}
			async clear(field) {
				await this.scope.unset(field);
				return !this.stored(field);
			}
			async store(field, value) {
				await this.scope.set(field, value);
				return this.userRecord()?.[field] === value;
			}
			userRecord() {
				const user = this.scope.getSnapshot().user;
				return typeof user === "object" && user !== null ? user : void 0;
			}
			stage(field, edit) {
				this.staged.set(field, edit);
				this.failed = false;
				this.publish();
			}
			specOf(field) {
				const spec = this.specs.get(field);
				if (spec === void 0) throw new Error("settings card has no field " + field);
				return spec;
			}
			sectionValue(field) {
				return this.scope.getSnapshot().value?.[field];
			}
			baseValue(field) {
				const base = this.scope.getSnapshot().base;
				return typeof base === "object" && base !== null ? base[field] : void 0;
			}
			stored(field) {
				const user = this.userRecord();
				return user !== void 0 && Object.hasOwn(user, field);
			}
			publish() {
				for (const listener of this.listeners) listener();
			}
		};
		//#endregion
		//#region src/client/SkillHubSettingsCard.tsx
		/**
		* The skill-hub plugin settings card: bridges the hub's settings
		* namespace (bound through the official settings transport) onto the
		* family-style staged card form (enabled master switch + agent announcement).
		* Registered into `plugins.bundle.config` under the bundle's package name, so
		* the Plugins manager renders it on skill-hub's own page. That slot is
		* dispatched with `view: 'page'` only, so the card always renders its full
		* form (no `summary` one-liner variant).
		*/
		/** Bridges the hub's config scope onto the card's staged form. */
		var SkillHubSettingsCardController = class {
			form;
			store;
			/** @param scope - the hub settings scope the card edits (FormScope-compatible). */
			constructor(scope) {
				this.form = new CardForm(scope, [
					booleanField("enabled"),
					booleanField("announceToAgent"),
					colorField("dotModelColor"),
					colorField("dotUserColor"),
					booleanField("showUseCount"),
					booleanField("showUseTime"),
					booleanField("showGroupSummary"),
					numberField("statsWindowDays", {
						min: 0,
						max: 3650
					}),
					numberField("statsScanMinutes", {
						min: 1,
						max: 1440
					}),
					secretField("githubToken")
				]);
				this.store = this.form.bind(() => this.projection());
			}
			projection() {
				return {
					...this.form.shell(),
					enabled: this.form.field("enabled"),
					announceToAgent: this.form.field("announceToAgent"),
					dotModelColor: this.form.field("dotModelColor"),
					dotUserColor: this.form.field("dotUserColor"),
					showUseCount: this.form.field("showUseCount"),
					showUseTime: this.form.field("showUseTime"),
					showGroupSummary: this.form.field("showGroupSummary"),
					statsWindowDays: this.form.field("statsWindowDays"),
					statsScanMinutes: this.form.field("statsScanMinutes"),
					githubToken: this.form.field("githubToken")
				};
			}
			/**
			* Build the face the card's slot registration injects.
			* @returns the card's snapshot hook and its form actions.
			*/
			inject() {
				return {
					hooks: { skillHubSettingsCard: this.store },
					...this.form.actions()
				};
			}
		};
		/** The card's field rows in render order; the rendered DOM order follows it. */
		const FIELD_ROWS = [
			{
				kind: "switch",
				field: "enabled",
				label: "settings.enabled",
				hint: "settings.enabledHint"
			},
			{
				kind: "switch",
				field: "announceToAgent",
				label: "settings.announceToAgent",
				hint: "settings.announceToAgentHint"
			},
			{
				kind: "color",
				field: "dotModelColor",
				id: "skill-hub-dot-model-color",
				label: "settings.dotModelColor",
				hint: "settings.dotModelColorHint",
				defaultColor: DEFAULT_DOT_MODEL_COLOR
			},
			{
				kind: "color",
				field: "dotUserColor",
				id: "skill-hub-dot-user-color",
				label: "settings.dotUserColor",
				hint: "settings.dotUserColorHint",
				defaultColor: DEFAULT_DOT_USER_COLOR
			},
			{
				kind: "switch",
				field: "showUseCount",
				label: "settings.showUseCount",
				hint: "settings.showUseCountHint"
			},
			{
				kind: "switch",
				field: "showUseTime",
				label: "settings.showUseTime",
				hint: "settings.showUseTimeHint"
			},
			{
				kind: "switch",
				field: "showGroupSummary",
				label: "settings.showGroupSummary",
				hint: "settings.showGroupSummaryHint"
			},
			{
				kind: "number",
				field: "statsWindowDays",
				id: "skill-hub-stats-window-days",
				label: "settings.statsWindowDays",
				hint: "settings.statsWindowDaysHint"
			},
			{
				kind: "number",
				field: "statsScanMinutes",
				id: "skill-hub-stats-scan-minutes",
				label: "settings.statsScanMinutes",
				hint: "settings.statsScanMinutesHint"
			},
			{
				kind: "secret",
				field: "githubToken",
				id: "skill-hub-github-token",
				label: "settings.githubToken",
				hint: "settings.githubTokenHint",
				placeholder: "settings.githubTokenPlaceholder"
			}
		];
		/**
		* Render the skill-hub card.
		* @param props - locale copy, the card snapshot, and its form actions.
		* @returns the card.
		*/
		function SkillHubSettingsCard(props) {
			const { t } = props;
			const state = props.useSkillHubSettingsCard((snapshot) => snapshot);
			const [version, setVersion] = (0, react.useState)(void 0);
			(0, react.useEffect)(() => {
				let cancelled = false;
				new SkillHubApi().config().then((res) => {
					if (!cancelled && res.ok) setVersion(res.pluginVersion);
				}).catch(() => {});
				return () => {
					cancelled = true;
				};
			}, []);
			const disabled = !state.writable;
			const fieldProps = {
				overriddenLabel: t("settings.overridden"),
				resetLabel: t("settings.reset"),
				disabled
			};
			return /* @__PURE__ */ (0, react_jsx_runtime.jsx)(PluginSettingsCard, {
				t,
				titleKey: "settings.title",
				descriptionKey: "settings.description",
				version,
				state,
				onSave: props.save,
				onDiscard: props.discard,
				children: FIELD_ROWS.map((row) => {
					const value = state[row.field];
					const common = {
						label: t(row.label),
						hint: t(row.hint),
						...fieldProps,
						...value,
						onEdit: (text) => {
							props.edit(row.field, text);
						},
						onReset: () => {
							props.resetField(row.field);
						}
					};
					if (row.kind === "switch") return /* @__PURE__ */ (0, react_jsx_runtime.jsx)(SwitchField, { ...common }, row.field);
					if (row.kind === "color") return /* @__PURE__ */ (0, react_jsx_runtime.jsx)(ColorField, {
						...common,
						id: row.id,
						inheritLabel: t("settings.inherit"),
						defaultColor: row.defaultColor
					}, row.field);
					if (row.kind === "number") return /* @__PURE__ */ (0, react_jsx_runtime.jsx)(NumberField, {
						...common,
						id: row.id,
						inheritLabel: t("settings.inherit")
					}, row.field);
					return /* @__PURE__ */ (0, react_jsx_runtime.jsx)(SecretField, {
						...common,
						id: row.id,
						placeholder: t(row.placeholder)
					}, row.field);
				})
			});
		}
		//#endregion
		//#region \0dsh-css:/home/lbf/文档/deepseek-harness/default-workspace/dsh-skill-group/src/client/panel/panel.module.css.mjs
		const css = ".o6fbya_panel{-webkit-font-smoothing:antialiased;color-scheme:light dark;--hub-model:#2f81f7;--hub-user:#3fb950;--hub-accent:var(--dsw-alias-state-business-primary,#2f81f7);--hub-text:var(--dsw-alias-label-primary,currentColor);--hub-text-2:var(--dsw-alias-label-secondary,#61666b);--hub-text-3:var(--dsw-alias-label-tertiary,#81858c);--hub-text-4:var(--dsw-alias-label-caption,#adb2b8);--hub-surface:var(--dsw-alias-bg-module-platform,#8080800f);--hub-hover:var(--dsw-alias-interactive-bg-hover,#80808014);--hub-active:var(--dsw-alias-interactive-bg-active,#80808029);--hub-border:var(--dsw-alias-border-l2,#80808021);--hub-border-2:var(--dsw-alias-border-l3,#80808033);--hub-danger:var(--dsw-alias-state-error-primary,#d1242f);--hub-success:var(--dsw-alias-state-success-primary,#3fb950);--hub-warn:var(--dsw-alias-state-warn-primary,#d29922);--hub-on-accent:var(--dsw-alias-label-primary-foreground,#fff);--hub-skeleton:var(--dsw-alias-bg-skeleton,#8080801a);flex-direction:column;gap:14px;max-width:720px;margin:0 auto;padding:28px 20px 44px;font-family:-apple-system,BlinkMacSystemFont,SF Pro Text,Helvetica Neue,sans-serif;display:flex}.o6fbya_header{flex-wrap:wrap;align-items:baseline;gap:10px;display:flex}.o6fbya_title{letter-spacing:-.02em;margin:0;font-size:24px;font-weight:700}.o6fbya_hint{color:var(--hub-text-3);font-size:12px}.o6fbya_actions{gap:8px;margin-left:auto;display:flex}.o6fbya_segmented{background:var(--hub-hover);border-radius:9px;gap:2px;padding:2px;display:flex}.o6fbya_segBtn{color:var(--hub-text-2);cursor:pointer;background:0 0;border:none;border-radius:7px;padding:5px 13px;font-size:12px;transition:background .15s,opacity .15s}.o6fbya_segBtn:hover{color:var(--hub-text)}.o6fbya_segBtnActive{background:var(--hub-active);opacity:1;font-weight:600}.o6fbya_search{background:var(--hub-surface);width:100%;color:inherit;border:none;border-radius:10px;outline:none;padding:10px 14px;font-size:13px;transition:background .15s}.o6fbya_search::placeholder{opacity:.45}.o6fbya_search:focus{background:var(--hub-active)}.o6fbya_section{background:var(--hub-surface);border-radius:12px;flex-direction:column;margin-top:4px;display:flex;overflow:hidden;box-shadow:0 1px 2px #00000008,0 4px 12px #0000000a}.o6fbya_sectionTitle{margin:14px 16px 2px;font-size:13px;font-weight:700}.o6fbya_groupHead{box-sizing:border-box;align-items:center;gap:8px;min-height:44px;padding:10px 14px;display:flex}.o6fbya_groupTitle{color:var(--hub-text);flex:1;align-items:center;gap:6px;min-width:0;font-size:13px;font-weight:600;line-height:1;display:inline-flex}.o6fbya_groupOps{flex-wrap:wrap;flex:none;align-items:center;gap:6px;display:inline-flex}.o6fbya_opBtn{background:var(--hub-hover);color:inherit;cursor:pointer;border:none;border-radius:999px;padding:3px 11px;font-size:11px;transition:background .15s}.o6fbya_opBtn:hover{background:var(--hub-active)}.o6fbya_opBtn:disabled{opacity:.4;cursor:default}.o6fbya_row{cursor:pointer;background:0 0;align-items:center;gap:12px;padding:10px 14px;transition:background .12s;display:flex}.o6fbya_row:hover{background:var(--hub-hover)}.o6fbya_row:focus-visible{outline:2px solid var(--hub-accent);outline-offset:-2px}.o6fbya_rowStatic{cursor:default}.o6fbya_rowStatic:hover{background:0 0}.o6fbya_row+.o6fbya_row{border-top:.5px solid var(--hub-border)}.o6fbya_rowMain{flex:1;min-width:0}.o6fbya_rowName{align-items:center;gap:5px;font-size:13.5px;display:flex}.o6fbya_rowNameText{font-weight:600}.o6fbya_rowDesc{color:var(--hub-text-3);white-space:nowrap;text-overflow:ellipsis;margin-top:1px;font-size:12.5px;overflow:hidden}.o6fbya_badges{flex:none;align-items:center;gap:6px;display:flex}.o6fbya_badge{border:.5px solid var(--hub-border-2);color:var(--hub-text-2);white-space:nowrap;border-radius:999px;padding:1px 7px;font-size:10.5px}.o6fbya_badgeReadonly{opacity:.5}.o6fbya_switch{border:1px solid var(--hub-border-2);background:var(--dsw-alias-bg-module-platform,#8080804d);cursor:pointer;border-radius:999px;flex:none;width:36px;height:21px;padding:2px;transition:background .18s}.o6fbya_switch:disabled{opacity:.5;cursor:default}.o6fbya_switchOn{background:var(--dsw-alias-state-business-primary,#34c759)}.o6fbya_switchThumb{background:#fff;border-radius:50%;width:17px;height:17px;transition:transform .18s;display:block;transform:translate(0);box-shadow:0 1px 2px #00000040}.o6fbya_switchOn .o6fbya_switchThumb{transform:translate(15px)}.o6fbya_empty{color:var(--hub-text-3);text-align:center;padding:20px 0;font-size:13px}.o6fbya_diagRow{border-left:3px solid var(--hub-warn);background:#d299220f;padding:9px 14px;font-size:12px}.o6fbya_diagPath{color:var(--hub-text-2);word-break:break-all;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:11px}.o6fbya_diagReason{color:var(--hub-text-3);margin-top:1px}.o6fbya_errorBanner{color:var(--hub-danger);white-space:pre-wrap;word-break:break-all;background:#d1242f12;border-radius:10px;align-items:flex-start;gap:10px;padding:10px 14px;font-size:12.5px;display:flex}.o6fbya_successBanner{color:var(--hub-success);white-space:pre-wrap;word-break:break-all;background:#3fb95014;border-radius:10px;align-items:flex-start;gap:10px;padding:10px 14px;font-size:12.5px;display:flex}.o6fbya_detailHead{flex-wrap:wrap;align-items:center;gap:10px;display:flex}.o6fbya_back{background:var(--hub-hover);color:inherit;cursor:pointer;border:none;border-radius:8px;padding:6px 12px;font-size:12.5px}.o6fbya_back:hover{background:var(--hub-active)}.o6fbya_detailName{letter-spacing:-.01em;font-size:19px;font-weight:700}.o6fbya_detailMeta{color:var(--hub-text-3);flex-direction:column;gap:4px;font-size:12px;display:flex}.o6fbya_detailMetaLine{word-break:break-all}.o6fbya_detailContent{white-space:pre-wrap;word-break:break-word;background:var(--hub-surface);border-radius:12px;max-height:62vh;padding:14px 16px;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:12px;line-height:1.6;overflow:auto}.o6fbya_form{background:var(--hub-surface);border-radius:12px;flex-direction:column;gap:10px;padding:14px 16px;display:flex;box-shadow:0 1px 2px #00000008,0 4px 12px #0000000a}.o6fbya_formRow{flex-direction:column;gap:5px;display:flex}.o6fbya_formLabel{color:var(--hub-text-3);font-size:12px}.o6fbya_input,.o6fbya_select{background:var(--hub-surface);color:inherit;border:none;border-radius:9px;outline:none;padding:9px 12px;font-size:13px}.o6fbya_input:focus,.o6fbya_select:focus{background:var(--hub-active)}.o6fbya_buttons{align-items:center;gap:8px;display:flex}.o6fbya_button{cursor:pointer;background:var(--hub-hover);color:inherit;border:none;border-radius:8px;padding:6px 13px;font-size:12.5px;transition:background .15s}.o6fbya_button:hover{background:var(--hub-active)}.o6fbya_primary{background:var(--hub-accent);color:var(--hub-on-accent)}.o6fbya_primary:hover{background:var(--hub-accent);opacity:.92}.o6fbya_primary:disabled{opacity:.45;cursor:default}.o6fbya_danger{background:var(--hub-danger);color:var(--hub-on-accent)}.o6fbya_danger:hover{background:var(--hub-danger);opacity:.92}.o6fbya_danger:disabled{opacity:.45;cursor:default}.o6fbya_formError{color:var(--hub-danger)}.o6fbya_formSuccess{color:var(--hub-success)}.o6fbya_dot{vertical-align:middle;border-radius:50%;width:7px;height:7px;margin-left:5px;display:inline-block}.o6fbya_dotModel{background:var(--hub-model)}.o6fbya_dotUser{background:var(--hub-user)}.o6fbya_displayName{color:var(--hub-text-3);white-space:nowrap;text-overflow:ellipsis;flex-shrink:1;min-width:0;max-width:160px;margin-left:6px;font-size:11px;font-weight:400;overflow:hidden}.o6fbya_legend{color:var(--hub-text-3);flex-wrap:wrap;align-items:center;gap:12px;padding:2px 2px 0;font-size:11.5px;display:flex}.o6fbya_legendItem{align-items:center;gap:4px;display:inline-flex}.o6fbya_legendItem .o6fbya_dot{margin-left:0}.o6fbya_legendHint{opacity:.8}.o6fbya_badgeSource,.o6fbya_badgeCount{background:var(--hub-hover);opacity:.72;border:none}.o6fbya_disclosure{min-width:0;color:inherit;cursor:pointer;text-align:left;background:0 0;border:none;flex:1;align-items:center;gap:7px;min-height:24px;padding:2px 0;display:flex}.o6fbya_disclosure:hover .o6fbya_groupTitle{opacity:1}.o6fbya_chevron{opacity:.55;border-bottom:1.5px solid;border-right:1.5px solid;flex:none;align-self:center;width:8px;height:8px;margin-right:2px;transition:transform .15s;transform:rotate(45deg)translateY(-1px)}.o6fbya_chevronCollapsed{transform:rotate(-45deg)translateY(-1px)}.o6fbya_headerCount{color:var(--hub-text-3);white-space:nowrap;margin-left:2px;font-size:12px}.o6fbya_subbar{flex-wrap:wrap;align-items:center;gap:8px;display:flex}.o6fbya_legendToggle{background:var(--hub-hover);width:22px;height:22px;color:inherit;cursor:pointer;opacity:.55;border:none;border-radius:50%;flex:none;font-size:12px;line-height:1;transition:opacity .15s,background .15s}.o6fbya_legendToggle:hover{opacity:1}.o6fbya_legendToggleActive{opacity:1;background:var(--hub-active)}.o6fbya_filterBar{flex-wrap:wrap;align-items:center;gap:8px;display:flex}.o6fbya_filterBar .o6fbya_formLabel{margin:0}.o6fbya_useCount{color:var(--hub-warn);vertical-align:1px;background:#d299221f;border-radius:999px;margin-left:6px;padding:0 6px;font-size:11px;font-weight:700;line-height:1.6;display:inline-block}.o6fbya_useTime{color:var(--hub-text-4);white-space:nowrap;margin-left:auto;font-size:11px}.o6fbya_switchMixed{background:#2f81f773;background:color-mix(in srgb, var(--hub-accent) 45%, transparent)}.o6fbya_switchMixed .o6fbya_switchThumb{transform:translate(7.5px);box-shadow:0 1px 2px #00000040}.o6fbya_groupTitleInner{align-items:baseline;display:inline-flex}.o6fbya_groupNote{color:var(--hub-text-3);white-space:nowrap;margin-left:8px;font-size:11px;font-weight:400}.o6fbya_pendingBar{background:#d1242f14;border:1px solid #d1242f40;border-radius:8px;flex-wrap:wrap;align-items:center;gap:6px 10px;margin:8px 0;padding:8px 10px;font-size:12px;display:flex}.o6fbya_pendingLabel{color:var(--hub-danger);white-space:nowrap;font-weight:600}.o6fbya_pendingNames{flex-wrap:wrap;gap:6px;min-width:0;display:flex}.o6fbya_pendingItem{background:var(--hub-hover);border-radius:999px;align-items:center;gap:4px;padding:2px 4px 2px 8px;display:inline-flex}.o6fbya_pendingHint{color:var(--hub-text-3);font-size:11px}.o6fbya_sourceLink{color:inherit;opacity:.9;border-bottom:1px dotted;font-weight:600;text-decoration:none}.o6fbya_sourceLink:hover{opacity:1}.o6fbya_providerLabel{opacity:.9}.o6fbya_statusBadges{flex:none;align-items:center;gap:4px;display:inline-flex}.o6fbya_statusBadge{border:.5px solid var(--hub-border-2);opacity:.8;white-space:nowrap;background:var(--hub-hover);border-radius:999px;padding:1px 7px;font-size:10.5px}.o6fbya_statusOk{color:var(--hub-success);background:0 0;border-color:currentColor}.o6fbya_statusUpdated{color:var(--hub-warn);background:#d2992214;border-color:currentColor}.o6fbya_statusError{color:var(--hub-danger);background:#d1242f14;border-color:currentColor}.o6fbya_statusWrap{cursor:pointer;background:0 0;border:none;align-items:center;gap:4px;padding:0;font-family:inherit;display:inline-flex}.o6fbya_statusWrap:hover .o6fbya_statusBadge{opacity:1}.o6fbya_statusButton{cursor:pointer;font-family:inherit}.o6fbya_statusButton:hover{opacity:1}.o6fbya_opDanger{color:var(--hub-danger);background:#d1242f1a}.o6fbya_opDanger:hover{background:#d1242f2e}.o6fbya_sourceCard{background:var(--hub-surface);border-radius:12px;flex-direction:column;gap:4px;padding:12px 14px;font-size:12px;display:flex}.o6fbya_sourceCardTitle{flex-wrap:wrap;align-items:center;gap:8px;display:flex}.o6fbya_dialogOverlay{z-index:50;-webkit-backdrop-filter:blur(2px);background:#00000059;justify-content:center;align-items:center;padding:24px;display:flex;position:fixed;inset:0}.o6fbya_dialog{background:var(--dsw-alias-bg-layer-1,#f5f5f7);min-width:min(320px,100%);max-width:380px;color:var(--dsw-alias-label-primary,#1d1d1f);border-radius:14px;padding:18px 18px 14px;box-shadow:0 12px 40px #00000047,0 2px 8px #00000029}.o6fbya_dialogTitle{letter-spacing:-.01em;margin:0 0 8px;font-size:15px;font-weight:700}.o6fbya_dialogText{color:var(--hub-text-3);margin:0 0 10px;font-size:12.5px;line-height:1.5}.o6fbya_dialogList{flex-direction:column;gap:5px;max-height:200px;margin:0 0 14px;padding:0;list-style:none;display:flex;overflow:auto}.o6fbya_dialogList li{opacity:.85;word-break:break-all;font-size:12.5px}.o6fbya_dialogActions{justify-content:flex-end;gap:8px;display:flex}.o6fbya_dialogForm{flex-direction:column;gap:12px;display:flex}.o6fbya_dialogForm .o6fbya_input,.o6fbya_dialogForm .o6fbya_select,.o6fbya_dialogForm .o6fbya_textarea{box-sizing:border-box;width:100%}.o6fbya_dialogWide{box-sizing:border-box;width:100%;max-width:560px;max-height:calc(100vh - 48px);padding:18px;overflow:auto}.o6fbya_dialogWide .o6fbya_dialogTitle{margin-bottom:12px}.o6fbya_dialogForm .o6fbya_textarea{background:var(--hub-surface);color:inherit;resize:vertical;border:none;border-radius:9px;outline:none;padding:10px 12px;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:12px;line-height:1.65}.o6fbya_dialogForm .o6fbya_textarea:focus{background:var(--hub-active)}.o6fbya_dialogForm .o6fbya_textarea::placeholder{opacity:.45}.o6fbya_filterBar .o6fbya_search{flex:1;min-width:160px}.o6fbya_filterBar .o6fbya_formLabel{flex:none}.o6fbya_filterBar .o6fbya_select{flex:none;max-width:150px}.o6fbya_filterBar .o6fbya_segmented{flex:none}.o6fbya_titleIcon{vertical-align:-2px;opacity:.8;margin-right:2px;display:inline-block}.o6fbya_grow{flex:1}.o6fbya_hintLine{color:var(--hub-text-3);margin:0;font-size:11.5px}.o6fbya_hintPadded{margin:6px 12px 2px}.o6fbya_hintInline{margin:4px 2px}.o6fbya_rowMuted{cursor:default;opacity:.55}.o6fbya_actionsPadded{padding:8px 12px}.o6fbya_actionsTop{margin-top:8px}.o6fbya_groupTime{margin-left:6px}.o6fbya_sectionHeadRow{align-items:center;gap:8px;display:flex}.o6fbya_sectionTitleFill{flex:1}.o6fbya_dialogSelect{width:100%;margin-bottom:12px}.o6fbya_dialogRow{align-items:center;gap:8px;display:flex}.o6fbya_scanList{border:.5px solid var(--hub-border-2);background:var(--hub-surface);border-radius:12px;max-height:360px;margin-top:8px;overflow:auto}.o6fbya_scanProgressTrack{background:var(--hub-surface);border-radius:4px;flex:1;height:6px;overflow:hidden}.o6fbya_scanProgressFill{background:var(--hub-accent);height:100%;transition:width .2s}.o6fbya_filterPanel{background:var(--hub-surface);border-radius:10px;flex-wrap:wrap;align-items:center;gap:12px;padding:10px 12px;display:flex}.o6fbya_filterField{align-items:center;gap:6px;display:inline-flex}.o6fbya_filterField .o6fbya_formLabel{margin:0}.o6fbya_filterField .o6fbya_select{max-width:150px}.o6fbya_listTools{justify-content:flex-end;align-items:center;gap:8px;padding:0 2px;display:flex}.o6fbya_opBtn:focus-visible,.o6fbya_button:focus-visible,.o6fbya_segBtn:focus-visible,.o6fbya_disclosure:focus-visible,.o6fbya_switch:focus-visible,.o6fbya_legendToggle:focus-visible,.o6fbya_back:focus-visible,.o6fbya_statusWrap:focus-visible,.o6fbya_input:focus-visible,.o6fbya_select:focus-visible,.o6fbya_search:focus-visible,.o6fbya_sourceLink:focus-visible{outline:2px solid var(--hub-accent);outline-offset:2px}.o6fbya_opBtn{padding:4px 12px}.o6fbya_segBtn{padding:6px 13px}.o6fbya_legendToggle{width:28px;height:28px}.o6fbya_skeleton{background:var(--hub-surface);border-radius:12px;flex-direction:column;gap:8px;padding:14px;display:flex}.o6fbya_skeletonRow{background:var(--hub-skeleton);border-radius:7px;height:14px;animation:1.4s ease-in-out infinite o6fbya_hubPulse}.o6fbya_skeletonRow:nth-child(2){width:82%}.o6fbya_skeletonRow:nth-child(3){width:64%}@keyframes o6fbya_hubPulse{0%,to{opacity:.55}50%{opacity:1}}@media (prefers-reduced-motion:reduce){.o6fbya_panel *,.o6fbya_panel :before,.o6fbya_panel :after{transition-duration:.01ms!important;animation-duration:.01ms!important;animation-iteration-count:1!important}}";
		const tagId = "dsh-skill-group/panel.module.css";
		if (typeof document !== "undefined" && document.querySelector("style[data-plugin-css=" + JSON.stringify(tagId) + "]") === null) {
			const tag = document.createElement("style");
			tag.dataset.plugin = "dsh-skill-group";
			tag.dataset.pluginCss = tagId;
			tag.textContent = css;
			document.head.appendChild(tag);
		}
		var panel_module_css_default = {
			"actions": "o6fbya_actions",
			"actionsPadded": "o6fbya_actionsPadded",
			"actionsTop": "o6fbya_actionsTop",
			"back": "o6fbya_back",
			"badge": "o6fbya_badge",
			"badgeCount": "o6fbya_badgeCount",
			"badgeReadonly": "o6fbya_badgeReadonly",
			"badgeSource": "o6fbya_badgeSource",
			"badges": "o6fbya_badges",
			"button": "o6fbya_button",
			"buttons": "o6fbya_buttons",
			"chevron": "o6fbya_chevron",
			"chevronCollapsed": "o6fbya_chevronCollapsed",
			"danger": "o6fbya_danger",
			"detailContent": "o6fbya_detailContent",
			"detailHead": "o6fbya_detailHead",
			"detailMeta": "o6fbya_detailMeta",
			"detailMetaLine": "o6fbya_detailMetaLine",
			"detailName": "o6fbya_detailName",
			"diagPath": "o6fbya_diagPath",
			"diagReason": "o6fbya_diagReason",
			"diagRow": "o6fbya_diagRow",
			"dialog": "o6fbya_dialog",
			"dialogActions": "o6fbya_dialogActions",
			"dialogForm": "o6fbya_dialogForm",
			"dialogList": "o6fbya_dialogList",
			"dialogOverlay": "o6fbya_dialogOverlay",
			"dialogRow": "o6fbya_dialogRow",
			"dialogSelect": "o6fbya_dialogSelect",
			"dialogText": "o6fbya_dialogText",
			"dialogTitle": "o6fbya_dialogTitle",
			"dialogWide": "o6fbya_dialogWide",
			"disclosure": "o6fbya_disclosure",
			"displayName": "o6fbya_displayName",
			"dot": "o6fbya_dot",
			"dotModel": "o6fbya_dotModel",
			"dotUser": "o6fbya_dotUser",
			"empty": "o6fbya_empty",
			"errorBanner": "o6fbya_errorBanner",
			"filterBar": "o6fbya_filterBar",
			"filterField": "o6fbya_filterField",
			"filterPanel": "o6fbya_filterPanel",
			"form": "o6fbya_form",
			"formError": "o6fbya_formError",
			"formLabel": "o6fbya_formLabel",
			"formRow": "o6fbya_formRow",
			"formSuccess": "o6fbya_formSuccess",
			"groupHead": "o6fbya_groupHead",
			"groupNote": "o6fbya_groupNote",
			"groupOps": "o6fbya_groupOps",
			"groupTime": "o6fbya_groupTime",
			"groupTitle": "o6fbya_groupTitle",
			"groupTitleInner": "o6fbya_groupTitleInner",
			"grow": "o6fbya_grow",
			"header": "o6fbya_header",
			"headerCount": "o6fbya_headerCount",
			"hint": "o6fbya_hint",
			"hintInline": "o6fbya_hintInline",
			"hintLine": "o6fbya_hintLine",
			"hintPadded": "o6fbya_hintPadded",
			"hubPulse": "o6fbya_hubPulse",
			"input": "o6fbya_input",
			"legend": "o6fbya_legend",
			"legendHint": "o6fbya_legendHint",
			"legendItem": "o6fbya_legendItem",
			"legendToggle": "o6fbya_legendToggle",
			"legendToggleActive": "o6fbya_legendToggleActive",
			"listTools": "o6fbya_listTools",
			"opBtn": "o6fbya_opBtn",
			"opDanger": "o6fbya_opDanger",
			"panel": "o6fbya_panel",
			"pendingBar": "o6fbya_pendingBar",
			"pendingHint": "o6fbya_pendingHint",
			"pendingItem": "o6fbya_pendingItem",
			"pendingLabel": "o6fbya_pendingLabel",
			"pendingNames": "o6fbya_pendingNames",
			"primary": "o6fbya_primary",
			"providerLabel": "o6fbya_providerLabel",
			"row": "o6fbya_row",
			"rowDesc": "o6fbya_rowDesc",
			"rowMain": "o6fbya_rowMain",
			"rowMuted": "o6fbya_rowMuted",
			"rowName": "o6fbya_rowName",
			"rowNameText": "o6fbya_rowNameText",
			"rowStatic": "o6fbya_rowStatic",
			"scanList": "o6fbya_scanList",
			"scanProgressFill": "o6fbya_scanProgressFill",
			"scanProgressTrack": "o6fbya_scanProgressTrack",
			"search": "o6fbya_search",
			"section": "o6fbya_section",
			"sectionHeadRow": "o6fbya_sectionHeadRow",
			"sectionTitle": "o6fbya_sectionTitle",
			"sectionTitleFill": "o6fbya_sectionTitleFill",
			"segBtn": "o6fbya_segBtn",
			"segBtnActive": "o6fbya_segBtnActive",
			"segmented": "o6fbya_segmented",
			"select": "o6fbya_select",
			"skeleton": "o6fbya_skeleton",
			"skeletonRow": "o6fbya_skeletonRow",
			"sourceCard": "o6fbya_sourceCard",
			"sourceCardTitle": "o6fbya_sourceCardTitle",
			"sourceLink": "o6fbya_sourceLink",
			"statusBadge": "o6fbya_statusBadge",
			"statusBadges": "o6fbya_statusBadges",
			"statusButton": "o6fbya_statusButton",
			"statusError": "o6fbya_statusError",
			"statusOk": "o6fbya_statusOk",
			"statusUpdated": "o6fbya_statusUpdated",
			"statusWrap": "o6fbya_statusWrap",
			"subbar": "o6fbya_subbar",
			"successBanner": "o6fbya_successBanner",
			"switch": "o6fbya_switch",
			"switchMixed": "o6fbya_switchMixed",
			"switchOn": "o6fbya_switchOn",
			"switchThumb": "o6fbya_switchThumb",
			"textarea": "o6fbya_textarea",
			"title": "o6fbya_title",
			"titleIcon": "o6fbya_titleIcon",
			"useCount": "o6fbya_useCount",
			"useTime": "o6fbya_useTime"
		};
		//#endregion
		//#region src/client/panel/SourceStatusBadge.tsx
		function SourceStatusBadge(props) {
			const { check, checking, onCheck } = props;
			if (checking === true) return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
				className: panel_module_css_default.statusBadge,
				children: tt("source.checking")
			});
			if (check === void 0) {
				if (onCheck === void 0) return null;
				return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
					type: "button",
					className: panel_module_css_default.statusBadge + " " + panel_module_css_default.statusButton,
					title: tt("source.checkHint"),
					onClick: onCheck,
					children: tt("source.check")
				});
			}
			const badges = (() => {
				if (check.error !== void 0) return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
					className: panel_module_css_default.statusBadge + " " + panel_module_css_default.statusError,
					children: tt("source.error")
				});
				if (check.throttled === true) return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
					className: panel_module_css_default.statusBadge,
					children: tt("source.throttled")
				});
				if (check.unverified === true) return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
					className: panel_module_css_default.statusBadge,
					children: tt("source.unverified")
				});
				if (check.changed) return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
					className: panel_module_css_default.statusBadges,
					children: [check.updated.length > 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
						className: panel_module_css_default.statusBadge + " " + panel_module_css_default.statusUpdated,
						children: tt("source.updated", { count: check.updated.length })
					}) : null, check.deleted.length > 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
						className: panel_module_css_default.statusBadge + " " + panel_module_css_default.statusError,
						children: tt("source.deleted", { count: check.deleted.length })
					}) : null]
				});
				return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
					className: panel_module_css_default.statusBadge + " " + panel_module_css_default.statusOk,
					children: tt("source.upToDate")
				});
			})();
			if (onCheck === void 0) return badges;
			return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
				type: "button",
				className: panel_module_css_default.statusWrap,
				title: tt("source.checkHint"),
				onClick: onCheck,
				children: badges
			});
		}
		//#endregion
		//#region src/client/panel/SkillDetailView.tsx
		/**
		* Full-page skill detail view: metadata, upstream source card with check/sync
		* actions, and the raw SKILL.md body. Pure presentation — every state value
		* and action arrives as a prop, so the panel stays the single owner of state.
		*/
		function SkillDetailView(props) {
			const { detail, notices, hubConfig, uses, groupsState, sourcesState, sourceCheck, checkingSource, syncingSource, onEnable, onBack, onCheck, onSync } = props;
			const detailSource = sourcesState?.sources.find((source) => source.skills.includes(detail.name));
			const detailCheck = detailSource !== void 0 ? sourceCheck[detailSource.repo] : void 0;
			const [copied, setCopied] = (0, react.useState)(null);
			const copyTimer = (0, react.useRef)(void 0);
			(0, react.useEffect)(() => () => {
				window.clearTimeout(copyTimer.current);
			}, []);
			const copyText = (text, key) => {
				copyTextToClipboard(text).then((ok) => {
					if (!ok) return;
					setCopied(key);
					window.clearTimeout(copyTimer.current);
					copyTimer.current = window.setTimeout(() => {
						setCopied(null);
					}, 1200);
				});
			};
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: panel_module_css_default.panel,
				children: [
					notices,
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: panel_module_css_default.detailHead,
						children: [
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
								type: "button",
								className: panel_module_css_default.back,
								onClick: onBack,
								children: tt("detail.back")
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
								className: panel_module_css_default.detailName,
								style: {
									display: "inline-flex",
									alignItems: "center",
									gap: 6,
									flexWrap: "wrap"
								},
								children: [
									detail.name,
									isDisplayNameDistinct(detail.name, detail.displayName) ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
										className: panel_module_css_default.displayName,
										style: {
											fontSize: 13,
											marginLeft: 0
										},
										children: detail.displayName
									}) : null,
									detail.invocation.modelInvocable ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
										className: panel_module_css_default.dot + " " + panel_module_css_default.dotModel,
										style: dotStyle(hubConfig?.dotModelColor),
										title: tt("legend.model")
									}) : detail.invocation.userInvocable ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
										className: panel_module_css_default.dot + " " + panel_module_css_default.dotUser,
										style: dotStyle(hubConfig?.dotUserColor),
										title: tt("legend.user")
									}) : null
								]
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
								className: panel_module_css_default.actions,
								style: {
									marginLeft: "auto",
									gap: 6
								},
								children: [
									detail.enabled === false && onEnable !== void 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
										type: "button",
										className: panel_module_css_default.opBtn,
										role: "switch",
										"aria-checked": false,
										"aria-label": tt("row.enable"),
										onClick: onEnable,
										children: tt("row.enable")
									}) : null,
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
										type: "button",
										className: panel_module_css_default.opBtn,
										onClick: () => {
											copyText("$" + detail.name, "mention");
										},
										children: copied === "mention" ? tt("detail.copied") : tt("detail.copyMention")
									}),
									detail.path !== void 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
										type: "button",
										className: panel_module_css_default.opBtn,
										onClick: () => {
											const path = detail.path;
											if (path !== void 0) copyText(path, "path");
										},
										children: copied === "path" ? tt("detail.copied") : tt("detail.copyPath")
									}) : null
								]
							})
						]
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: panel_module_css_default.detailMeta,
						children: [
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
								className: panel_module_css_default.detailMetaLine,
								children: [
									tt("detail.provider"),
									": ",
									detail.provider
								]
							}),
							detail.addedAt !== void 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
								className: panel_module_css_default.detailMetaLine,
								children: [
									tt("detail.addedAt"),
									": ",
									formatDateTime(detail.addedAt)
								]
							}) : null,
							detail.updatedAt !== void 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
								className: panel_module_css_default.detailMetaLine,
								children: [
									tt("detail.updatedAt"),
									": ",
									formatDateTime(detail.updatedAt)
								]
							}) : null,
							detail.path !== void 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
								className: panel_module_css_default.detailMetaLine,
								children: [
									tt("detail.path"),
									": ",
									detail.path
								]
							}) : null,
							detail.whenToUse !== void 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
								className: panel_module_css_default.detailMetaLine,
								children: [
									tt("detail.whenToUse"),
									": ",
									detail.whenToUse
								]
							}) : null,
							(() => {
								const stat = uses.get(detail.name);
								if (stat === void 0 || stat.count === 0) return null;
								const at = stat.lastUsed !== void 0 ? " · " + new Date(stat.lastUsed).toLocaleString() : "";
								return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
									className: panel_module_css_default.detailMetaLine,
									children: [
										tt("detail.uses"),
										": ",
										stat.count,
										at
									]
								});
							})(),
							(() => {
								const tags = (groupsState?.tags ?? []).filter((tag) => tag.skillNames.includes(detail.name)).map((tag) => tag.name);
								return tags.length > 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
									className: panel_module_css_default.detailMetaLine,
									children: [
										tt("detail.groups"),
										": ",
										tags.join(", ")
									]
								}) : null;
							})()
						]
					}),
					detailSource !== void 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: panel_module_css_default.sourceCard,
						children: [
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
								className: panel_module_css_default.sourceCardTitle,
								children: [
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("a", {
										className: panel_module_css_default.sourceLink,
										href: "https://github.com/" + detailSource.repo,
										target: "_blank",
										rel: "noreferrer",
										children: detailSource.repo
									}),
									detailSource.ref !== void 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
										className: panel_module_css_default.badge + " " + panel_module_css_default.badgeSource,
										children: detailSource.ref
									}) : null,
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)(SourceStatusBadge, { check: detailCheck })
								]
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
								className: panel_module_css_default.detailMetaLine,
								children: [
									tt("source.commit"),
									": ",
									detailSource.commitSha === "" ? tt("source.unverified") : shortSha(detailSource.commitSha)
								]
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
								className: panel_module_css_default.buttons + " " + panel_module_css_default.actionsTop,
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
									type: "button",
									className: panel_module_css_default.opBtn,
									disabled: checkingSource !== null,
									onClick: () => {
										onCheck(detailSource.repo);
									},
									children: checkingSource === detailSource.repo ? tt("source.checking") : tt("source.check")
								}), detail.enabled ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
									type: "button",
									className: panel_module_css_default.opBtn,
									disabled: syncingSource !== null,
									onClick: () => {
										onSync(detailSource.repo, [detail.name]);
									},
									children: syncingSource === detailSource.repo ? tt("source.syncing") : tt("source.sync")
								}) : null]
							})
						]
					}) : /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
						className: panel_module_css_default.hintLine,
						children: tt("source.private")
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("pre", {
						className: panel_module_css_default.detailContent,
						children: detail.content
					})
				]
			});
		}
		//#endregion
		//#region src/client/panel/TagEditorView.tsx
		function TagEditorView(props) {
			const { tag, notices, editName, membersDraft, editSearch, catalog, tagBusy, onBack, onEditName, onEditSearch, onToggleMember, onRename, onDelete, onSaveMembers } = props;
			const editQuery = editSearch.trim().toLocaleLowerCase();
			const matches = (name, description) => editQuery.length === 0 || name.toLocaleLowerCase().includes(editQuery) || description.toLocaleLowerCase().includes(editQuery);
			const editSkills = (catalog?.skills ?? []).filter((skill) => matches(skill.name, skill.description));
			const editDisabled = disabledSkills(catalog).filter((record) => matches(record.name, record.description));
			const known = new Set((catalog?.skills ?? []).map((skill) => skill.name));
			/** 组内引用了、但目录里已经不存在的成员（已删除或改名），可在此勾掉。 */
			const editGhosts = tag.skillNames.filter((name) => !known.has(name) && (editQuery.length === 0 || name.toLocaleLowerCase().includes(editQuery)));
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: panel_module_css_default.panel,
				children: [
					notices,
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: panel_module_css_default.detailHead,
						children: [
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
								type: "button",
								className: panel_module_css_default.back,
								onClick: onBack,
								children: tt("detail.back")
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
								className: panel_module_css_default.input + " " + panel_module_css_default.grow,
								value: editName,
								onChange: (event) => {
									onEditName(event.target.value);
								},
								placeholder: tt("groups.namePlaceholder")
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
								type: "button",
								className: panel_module_css_default.opBtn,
								disabled: tagBusy || editName.trim() === "",
								onClick: onRename,
								children: tt("groups.rename")
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
								type: "button",
								className: panel_module_css_default.opBtn,
								disabled: tagBusy,
								onClick: onDelete,
								children: tt("groups.delete")
							})
						]
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
						className: panel_module_css_default.hintLine,
						children: tt("groups.membersHint")
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
						className: panel_module_css_default.search,
						value: editSearch,
						onChange: (event) => {
							onEditSearch(event.target.value);
						},
						placeholder: tt("panel.search")
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: panel_module_css_default.section,
						children: [
							editSkills.map((skill) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", {
								className: panel_module_css_default.row,
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
									type: "checkbox",
									checked: membersDraft.has(skill.name),
									onChange: (event) => {
										onToggleMember(skill.name, event.target.checked);
									}
								}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
									className: panel_module_css_default.rowMain,
									children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
										className: panel_module_css_default.rowName,
										children: skill.name
									}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
										className: panel_module_css_default.rowDesc,
										children: skill.description
									})]
								})]
							}, skill.name)),
							editDisabled.map((record) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", {
								className: panel_module_css_default.row,
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
									type: "checkbox",
									checked: membersDraft.has(record.name),
									onChange: (event) => {
										onToggleMember(record.name, event.target.checked);
									}
								}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
									className: panel_module_css_default.rowMain,
									children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
										className: panel_module_css_default.rowName,
										children: record.name
									}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
										className: panel_module_css_default.rowDesc,
										children: [
											record.description,
											" · ",
											tt("panel.disabled")
										]
									})]
								})]
							}, record.name)),
							editGhosts.map((name) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", {
								className: panel_module_css_default.row,
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
									type: "checkbox",
									checked: membersDraft.has(name),
									onChange: (event) => {
										onToggleMember(name, event.target.checked);
									}
								}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
									className: panel_module_css_default.rowMain,
									children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
										className: panel_module_css_default.rowName,
										children: name
									}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
										className: panel_module_css_default.rowDesc,
										children: tt("groups.missingOne")
									})]
								})]
							}, name))
						]
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						className: panel_module_css_default.buttons,
						children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
							type: "button",
							className: panel_module_css_default.button + " " + panel_module_css_default.primary,
							disabled: tagBusy,
							onClick: onSaveMembers,
							children: tt("groups.saveMembers")
						})
					})
				]
			});
		}
		//#endregion
		//#region src/client/panel/SkillRow.tsx
		function SkillRow(props) {
			const { skill, uses, hubConfig, busyNames, duplicateNames, toggle, openDetail, stageDelete } = props;
			const stat = uses.get(skill.name);
			const count = stat?.count ?? 0;
			const lastUsed = stat?.lastUsed;
			const isDuplicate = duplicateNames.has(skill.name);
			/** 单一状态圆点：模型可调 → 蓝；否则用户可调 → 绿。与聊天 / 菜单同规则。 */
			const dot = skill.invocation.modelInvocable ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
				className: panel_module_css_default.dot + " " + panel_module_css_default.dotModel,
				style: dotStyle(hubConfig?.dotModelColor),
				title: tt("legend.model")
			}) : skill.invocation.userInvocable ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
				className: panel_module_css_default.dot + " " + panel_module_css_default.dotUser,
				style: dotStyle(hubConfig?.dotUserColor),
				title: tt("legend.user")
			}) : null;
			/** 键盘打开详情：Enter 或空格。仅当焦点在行本身（而非行内按钮）时生效。 */
			const onKeyDown = (event) => {
				if (event.target !== event.currentTarget) return;
				if (event.key === "Enter" || event.key === " ") {
					event.preventDefault();
					openDetail(skill.name);
				}
			};
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: panel_module_css_default.row,
				role: "button",
				tabIndex: 0,
				"aria-label": tt("row.open", { name: skill.name }),
				onClick: () => {
					openDetail(skill.name);
				},
				onKeyDown,
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: panel_module_css_default.rowMain,
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							className: panel_module_css_default.rowName,
							children: [
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
									className: panel_module_css_default.rowNameText,
									children: skill.name
								}),
								isDisplayNameDistinct(skill.name, skill.displayName) ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
									className: panel_module_css_default.displayName,
									title: skill.displayName,
									children: skill.displayName
								}) : null,
								count > 0 && hubConfig?.showUseCount !== false ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
									className: panel_module_css_default.useCount,
									children: count
								}) : null,
								dot,
								isDuplicate ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
									className: panel_module_css_default.badge + " " + panel_module_css_default.statusError,
									title: tt("row.duplicateHint"),
									children: tt("row.duplicate")
								}) : null,
								lastUsed !== void 0 && hubConfig?.showUseTime !== false ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
									className: panel_module_css_default.useTime,
									children: relativeTimeText(lastUsed)
								}) : null
							]
						}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
							className: panel_module_css_default.rowDesc,
							title: skill.description,
							children: skill.shortDescription ?? skill.description
						})]
					}),
					skill.writable ? null : /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
						className: panel_module_css_default.badge + " " + panel_module_css_default.badgeReadonly,
						children: tt("row.readonly")
					}),
					stageDelete !== void 0 && skill.writable ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
						type: "button",
						className: panel_module_css_default.opBtn + " " + panel_module_css_default.opDanger,
						title: tt("row.deleteHint"),
						"aria-label": tt("row.delete"),
						onClick: (event) => {
							event.stopPropagation();
							stageDelete(skill.name);
						},
						children: tt("row.delete")
					}) : null,
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
						type: "button",
						role: "switch",
						"aria-checked": true,
						"aria-label": tt("row.disable"),
						className: panel_module_css_default.switch + " " + panel_module_css_default.switchOn,
						disabled: busyNames.has(skill.name),
						onClick: (event) => {
							event.stopPropagation();
							toggle(skill, false);
						},
						children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { className: panel_module_css_default.switchThumb })
					})
				]
			});
		}
		//#endregion
		//#region src/client/panel/DisabledRow.tsx
		/** Source badge label for a switched-off row, derived from its origin. */
		function disabledSourceLabel(source) {
			return tt("badge.source." + source);
		}
		function DisabledRow(props) {
			const { record, busy, onEnable, duplicate, onOpen, stageDelete } = props;
			/** 键盘打开详情：Enter 或空格。仅当焦点在行本身（而非行内开关）时生效。 */
			const onKeyDown = (event) => {
				if (onOpen === void 0 || event.target !== event.currentTarget) return;
				if (event.key === "Enter" || event.key === " ") {
					event.preventDefault();
					onOpen();
				}
			};
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: panel_module_css_default.row + (onOpen === void 0 ? " " + panel_module_css_default.rowStatic : ""),
				role: onOpen === void 0 ? void 0 : "button",
				tabIndex: onOpen === void 0 ? void 0 : 0,
				"aria-label": onOpen === void 0 ? void 0 : tt("row.open", { name: record.name }),
				onClick: onOpen,
				onKeyDown,
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: panel_module_css_default.rowMain,
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							className: panel_module_css_default.rowName,
							children: [record.name, duplicate === true ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
								className: panel_module_css_default.badge + " " + panel_module_css_default.statusError,
								style: { marginLeft: 6 },
								title: tt("row.duplicateHint"),
								children: tt("row.duplicate")
							}) : null]
						}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
							className: panel_module_css_default.rowDesc,
							title: record.description,
							children: record.description
						})]
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
						className: panel_module_css_default.badges,
						children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
							className: panel_module_css_default.badge + " " + panel_module_css_default.badgeSource,
							children: disabledSourceLabel(record.source)
						})
					}),
					stageDelete !== void 0 && record.writable ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
						type: "button",
						className: panel_module_css_default.opBtn + " " + panel_module_css_default.opDanger,
						title: tt("row.deleteHint"),
						"aria-label": tt("row.delete"),
						onClick: (event) => {
							event.stopPropagation();
							stageDelete(record.name);
						},
						children: tt("row.delete")
					}) : null,
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
						type: "button",
						role: "switch",
						"aria-checked": false,
						"aria-label": tt("row.enable"),
						className: panel_module_css_default.switch,
						disabled: busy,
						onClick: (event) => {
							event.stopPropagation();
							onEnable();
						},
						children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { className: panel_module_css_default.switchThumb })
					})
				]
			});
		}
		//#endregion
		//#region src/client/panel/GroupSummary.tsx
		function GroupSummary(props) {
			const { members, uses, hubConfig } = props;
			let total = 0;
			let latest;
			for (const name of members) {
				const stat = uses.get(name);
				if (stat === void 0) continue;
				total += stat.count;
				if (stat.lastUsed !== void 0 && (latest === void 0 || stat.lastUsed > latest)) latest = stat.lastUsed;
			}
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
				className: panel_module_css_default.groupTitleInner,
				children: [hubConfig?.showGroupSummary !== false && total > 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
					className: panel_module_css_default.useCount,
					children: total
				}) : null, hubConfig?.showGroupSummary !== false && latest !== void 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
					className: panel_module_css_default.useTime + " " + panel_module_css_default.groupTime,
					children: relativeTimeText(latest)
				}) : null]
			});
		}
		//#endregion
		//#region src/client/panel/GroupSwitchButton.tsx
		function GroupSwitchButton(props) {
			const { state, label, memberCount, missingCount, batchBusy, hasTogglable, onToggle } = props;
			const canToggle = memberCount > 0 && (state === "off" || hasTogglable) && !batchBusy;
			const stateHint = state === "on" ? tt("groups.switchOn") : state === "off" ? tt("groups.switchOff") : tt("groups.switchMixed");
			return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
				type: "button",
				role: "switch",
				title: canToggle ? stateHint + (missingCount > 0 ? " · " + tt("groups.missing", { count: missingCount }) : "") : tt("groups.noToggleable"),
				"aria-checked": state === "mixed" ? "mixed" : state === "on",
				"aria-label": label,
				className: panel_module_css_default.switch + (state === "on" ? " " + panel_module_css_default.switchOn : state === "mixed" ? " " + panel_module_css_default.switchMixed : ""),
				disabled: !canToggle,
				onClick: (event) => {
					event.stopPropagation();
					onToggle();
				},
				children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { className: panel_module_css_default.switchThumb })
			});
		}
		//#endregion
		//#region src/client/panel/CollectionCard.tsx
		function CollectionCard(props) {
			const { collection, rows, collapsed, view, check, hasTogglable, checkingSource, syncingSource, batchBusy, rowProps, toggleGroupCollapse, checkSources, requestSync, toggleGroup } = props;
			const { busyNames, duplicateNames, uses, hubConfig } = rowProps;
			/** 插件 provider 组：没有上游仓库，只做分组与开关。 */
			const providerGroup = collection.kind === "provider";
			const memberCount = view.enabled.length + view.disabled.length;
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("section", {
				className: panel_module_css_default.section,
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					className: panel_module_css_default.groupHead,
					children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("button", {
						type: "button",
						className: panel_module_css_default.disclosure,
						"aria-expanded": !collapsed,
						onClick: () => {
							toggleGroupCollapse("col:" + collection.name);
						},
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { className: panel_module_css_default.chevron + (collapsed ? " " + panel_module_css_default.chevronCollapsed : "") }), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
							className: panel_module_css_default.groupTitle,
							children: [
								providerGroup ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
									className: panel_module_css_default.providerLabel,
									children: collection.name
								}) : /* @__PURE__ */ (0, react_jsx_runtime.jsx)("a", {
									className: panel_module_css_default.sourceLink,
									href: "https://github.com/" + collection.name,
									target: "_blank",
									rel: "noreferrer",
									onClick: (event) => {
										event.stopPropagation();
									},
									children: collection.name
								}),
								" · " + memberCount,
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)(GroupSummary, {
									members: collection.skillNames,
									uses,
									hubConfig
								}),
								providerGroup ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
									className: panel_module_css_default.groupNote,
									children: tt("groups.provider")
								}) : null,
								view.missing.length > 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
									className: panel_module_css_default.groupNote,
									children: tt("groups.missing", { count: view.missing.length })
								}) : null
							]
						})]
					}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
						className: panel_module_css_default.groupOps,
						children: [providerGroup ? null : /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)(SourceStatusBadge, {
							check,
							checking: checkingSource === collection.name,
							onCheck: () => {
								checkSources(collection.name);
							}
						}), check !== void 0 && check.changed && check.updated.length > 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
							type: "button",
							className: panel_module_css_default.opBtn,
							disabled: syncingSource !== null,
							onClick: (event) => {
								event.stopPropagation();
								requestSync(collection.name, check.updated);
							},
							children: syncingSource === collection.name ? tt("source.syncing") : tt("source.sync")
						}) : null] }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)(GroupSwitchButton, {
							state: view.state,
							label: collection.name,
							memberCount,
							missingCount: view.missing.length,
							batchBusy,
							hasTogglable,
							onToggle: () => {
								toggleGroup("col:" + collection.name, collection.name, view.state);
							}
						})]
					})]
				}), !collapsed ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)(react_jsx_runtime.Fragment, { children: rows.map((row) => row.kind === "skill" ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)(SkillRow, {
					skill: row.skill,
					...rowProps
				}, row.skill.name) : /* @__PURE__ */ (0, react_jsx_runtime.jsx)(DisabledRow, {
					record: row.record,
					busy: busyNames.has(row.record.name),
					duplicate: duplicateNames.has(row.record.name),
					onEnable: () => {
						rowProps.toggle(row.record, true);
					},
					onOpen: () => {
						rowProps.openDetail(row.record.name);
					},
					stageDelete: rowProps.stageDelete
				}, row.record.name)) }) : null]
			});
		}
		//#endregion
		//#region src/client/panel/SourcesView.tsx
		/**
		* Sources tab: the flat skill list or the grouped view — one card per upstream
		* collection with check/sync actions and the tri-state switch, plus the
		* uncategorized "personal" card for skills that no source record claims.
		*/
		function SourcesView(props) {
			const { hub } = props;
			const { catalog, groupsState, skillView, sourceFilter, origins, sorted, normalized, collapsedGroups, viewNames, sourceCheck, actionNames, checkingSource, syncingSource, batchBusy, busyNames, toggleGroupCollapse, setAllGroupsCollapsed, checkSources, requestSync, toggleGroup } = hub;
			/** 重复技能名集合：整表只建一次，行内用 has 取代逐行线性 includes。 */
			const duplicateNames = (0, react.useMemo)(() => new Set(catalog?.duplicateNames ?? []), [catalog]);
			/** 已运行时关闭的行（暂存待删除的在目录域里已经剔除）。 */
			const offSkills = hub.offSkills;
			const sourceFiltered = filterBySource(sorted, sourceFilter, origins);
			const visible = visibleCollections(groupsState?.collections ?? [], sourceFiltered, offSkills, normalized, sourceFilter, origins);
			const collections = visible.map((entry) => entry.collection);
			const uncategorized = sourceFiltered.filter((skill) => origins[skill.name] === void 0);
			const personalDisabled = offSkills.filter((record) => origins[record.name] === void 0).filter((record) => normalized.length === 0 || record.name.toLocaleLowerCase().includes(normalized) || record.description.toLocaleLowerCase().includes(normalized)).filter(() => sourceFilter === "all" || sourceFilter === "private");
			const allPersonalNames = [...uncategorized.map((s) => s.name), ...personalDisabled.map((r) => r.name)];
			const hasPersonal = allPersonalNames.length > 0;
			const defaultTopKeys = [...collections.map((c) => "col:" + c.name), ...hasPersonal ? ["uncategorized-source"] : []];
			const storedTopOrder = groupsState?.sourceGroupOrder ?? [];
			const topOrderedKeys = (() => {
				if (storedTopOrder.length === 0) return defaultTopKeys;
				const set = new Set(storedTopOrder);
				const result = storedTopOrder.filter((k) => defaultTopKeys.includes(k));
				for (const k of defaultTopKeys) if (!set.has(k)) result.push(k);
				if (result.length === 0) return defaultTopKeys;
				return result;
			})();
			/** 顶层分组是否已全部折叠（决定「全部折叠/展开」按钮的文案）。 */
			const allTopCollapsed = topOrderedKeys.length > 0 && topOrderedKeys.every((key) => collapsedGroups.has(key));
			/** SkillRow 收窄后的 props：父组件统一传入它实际消费的字段。 */
			const rowProps = {
				uses: hub.uses,
				hubConfig: hub.hubConfig,
				busyNames,
				duplicateNames,
				toggle: hub.toggle,
				openDetail: hub.openDetail,
				stageDelete: hub.editMode ? hub.stageDelete : void 0
			};
			/** 排序「按使用次数」时取调用统计（与目录域同一个 map）。 */
			const getUses = (name) => hub.uses.get(name)?.count;
			/**
			* 来源 tab 的工具行：左边「全部折叠/展开」（分组视图才有意义），右边
			* 「新建」与「编辑/完成」——这两件事就是在直接管理技能文件，所以放在
			* 技能真正落地的那一 tab 里，而不是面板标题栏。
			*/
			const listTools = /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: panel_module_css_default.listTools,
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
						type: "button",
						className: panel_module_css_default.button + " " + panel_module_css_default.primary,
						onClick: () => {
							hub.setFormMessage(null);
							hub.setShowForm(true);
						},
						children: tt("panel.new")
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
						type: "button",
						className: panel_module_css_default.button + (hub.editMode ? " " + panel_module_css_default.primary : ""),
						"aria-pressed": hub.editMode,
						title: tt("edit.hint"),
						onClick: () => {
							if (hub.editMode && hub.pendingDeletes.length > 0) {
								hub.setDeleteDialog(true);
								return;
							}
							hub.setEditMode((value) => !value);
						},
						children: tt(hub.editMode ? "edit.done" : "edit.start")
					}),
					skillView === "groups" && topOrderedKeys.length > 1 ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
						type: "button",
						className: panel_module_css_default.opBtn,
						onClick: () => {
							setAllGroupsCollapsed(allTopCollapsed ? null : topOrderedKeys);
						},
						children: allTopCollapsed ? tt("groups.expandAll") : tt("groups.collapseAll")
					}) : null
				]
			});
			if (skillView === "flat") return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [listTools, mergeGroupRows(sourceFiltered, filterDisabled(offSkills, normalized, sourceFilter, origins), hub.sortKey, getUses).map((row) => row.kind === "skill" ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)(SkillRow, {
				skill: row.skill,
				...rowProps
			}, row.skill.name) : /* @__PURE__ */ (0, react_jsx_runtime.jsx)(DisabledRow, {
				record: row.record,
				busy: busyNames.has(row.record.name),
				duplicate: duplicateNames.has(row.record.name),
				onEnable: () => {
					hub.toggle(row.record, true);
				},
				onOpen: () => {
					hub.openDetail(row.record.name);
				},
				stageDelete: rowProps.stageDelete
			}, row.record.name))] });
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [
				collections.length === 0 && !hasPersonal ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
					className: panel_module_css_default.empty,
					children: tt("groups.noCollections")
				}) : null,
				listTools,
				topOrderedKeys.map((topKey) => {
					if (topKey.startsWith("col:")) {
						const colName = topKey.slice(4);
						const entry = visible.find((item) => item.collection.name === colName);
						if (entry === void 0) return null;
						const { collection, skills, disabledMembers } = entry;
						const collapsed = collapsedGroups.has("col:" + collection.name);
						const view = groupSwitchView(collection.skillNames, viewNames, actionNames);
						const check = sourceCheck[collection.name];
						const hasTogglable = collection.skillNames.some((name) => actionNames.has(name));
						return /* @__PURE__ */ (0, react_jsx_runtime.jsx)(CollectionCard, {
							collection,
							rows: mergeGroupRows(skills, disabledMembers, hub.sortKey, getUses),
							collapsed,
							view,
							check,
							hasTogglable,
							checkingSource,
							syncingSource,
							batchBusy,
							rowProps,
							toggleGroupCollapse,
							checkSources,
							requestSync,
							toggleGroup
						}, "col:" + collection.name);
					}
					if (topKey === "uncategorized-source" && hasPersonal) {
						if (allPersonalNames.length === 0) return null;
						const collapsed = collapsedGroups.has("uncategorized-source");
						return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("section", {
							className: panel_module_css_default.section,
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
								className: panel_module_css_default.groupHead,
								children: /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("button", {
									type: "button",
									className: panel_module_css_default.disclosure,
									"aria-expanded": !collapsed,
									onClick: () => {
										toggleGroupCollapse("uncategorized-source");
									},
									children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { className: panel_module_css_default.chevron + (collapsed ? " " + panel_module_css_default.chevronCollapsed : "") }), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
										className: panel_module_css_default.groupTitle,
										children: [
											tt("groups.personal"),
											" · ",
											allPersonalNames.length,
											/* @__PURE__ */ (0, react_jsx_runtime.jsx)(GroupSummary, {
												members: allPersonalNames,
												uses: hub.uses,
												hubConfig: hub.hubConfig
											})
										]
									})]
								})
							}), !collapsed ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)(react_jsx_runtime.Fragment, { children: mergeGroupRows(uncategorized, personalDisabled, hub.sortKey, getUses).map((row) => row.kind === "skill" ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)(SkillRow, {
								skill: row.skill,
								...rowProps
							}, row.skill.name) : /* @__PURE__ */ (0, react_jsx_runtime.jsx)(DisabledRow, {
								record: row.record,
								busy: busyNames.has(row.record.name),
								duplicate: duplicateNames.has(row.record.name),
								onEnable: () => {
									hub.toggle(row.record, true);
								},
								onOpen: () => {
									hub.openDetail(row.record.name);
								},
								stageDelete: rowProps.stageDelete
							}, row.record.name)) }) : null]
						}, "uncategorized-source");
					}
					return null;
				})
			] });
		}
		//#endregion
		//#region src/client/panel/ScenesView.tsx
		/**
		* Scenes tab: user tag groups (one card per scene with the tri-state switch
		* and edit entry) plus the new-scene form. Scenes are the user's own
		* enable/disable units (e.g. a Godot scene vs a Java scene); upstream repos
		* are managed in the sources tab.
		*/
		function ScenesView(props) {
			const { hub } = props;
			const { catalog, groupsState, sorted, normalized, collapsedGroups, viewNames, actionNames, batchBusy, busyNames, newTagName, setNewTagName, tagBusy, createTag, toggleGroupCollapse, setAllGroupsCollapsed, toggleGroup, setEditingTag, setEditName, setMembersDraft, setEditSearch } = hub;
			/** 重复技能名集合：整表只建一次，行内用 has 取代逐行线性 includes。 */
			const duplicateNames = (0, react.useMemo)(() => new Set(catalog?.duplicateNames ?? []), [catalog]);
			/** 已运行时关闭的行（暂存待删除的在目录域里已经剔除）。 */
			const offSkills = hub.offSkills;
			const tagKeys = (groupsState?.tags ?? []).map((tag) => "tag:" + tag.id);
			/** 所有场景是否已折叠（决定「全部折叠/展开」按钮的文案）。 */
			const allTagsCollapsed = tagKeys.length > 0 && tagKeys.every((key) => collapsedGroups.has(key));
			/** SkillRow 收窄后的 props：父组件统一传入它实际消费的字段。 */
			const rowProps = {
				uses: hub.uses,
				hubConfig: hub.hubConfig,
				busyNames,
				duplicateNames,
				toggle: hub.toggle,
				openDetail: hub.openDetail,
				stageDelete: hub.editMode ? hub.stageDelete : void 0
			};
			/** 排序「按使用次数」时取调用统计（与目录域同一个 map）。 */
			const getUses = (name) => hub.uses.get(name)?.count;
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [
				/* @__PURE__ */ (0, react_jsx_runtime.jsx)("form", {
					className: panel_module_css_default.form,
					onSubmit: (event) => {
						createTag(event);
					},
					children: /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: panel_module_css_default.buttons,
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
							className: panel_module_css_default.input + " " + panel_module_css_default.grow,
							value: newTagName,
							onChange: (event) => {
								setNewTagName(event.target.value);
							},
							placeholder: tt("groups.namePlaceholder")
						}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
							type: "submit",
							className: panel_module_css_default.button + " " + panel_module_css_default.primary,
							disabled: tagBusy || newTagName.trim() === "",
							children: tt("groups.new")
						})]
					})
				}),
				groupsState !== null && groupsState.tags.length === 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
					className: panel_module_css_default.empty,
					children: tt("groups.empty")
				}) : null,
				tagKeys.length > 1 ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
					className: panel_module_css_default.listTools,
					children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
						type: "button",
						className: panel_module_css_default.opBtn,
						onClick: () => {
							setAllGroupsCollapsed(allTagsCollapsed ? null : tagKeys);
						},
						children: allTagsCollapsed ? tt("groups.expandAll") : tt("groups.collapseAll")
					})
				}) : null,
				groupsState?.tags.map((tag) => {
					const skills = sorted.filter((skill) => tag.skillNames.includes(skill.name));
					const disabledMembers = offSkills.filter((record) => tag.skillNames.includes(record.name) && (normalized.length === 0 || record.name.toLocaleLowerCase().includes(normalized) || record.description.toLocaleLowerCase().includes(normalized)));
					const collapsed = collapsedGroups.has("tag:" + tag.id);
					const view = groupSwitchView(tag.skillNames, viewNames, actionNames);
					const hasTogglable = tag.skillNames.some((name) => actionNames.has(name));
					const memberCount = view.enabled.length + view.disabled.length;
					return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("section", {
						className: panel_module_css_default.section,
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							className: panel_module_css_default.groupHead,
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("button", {
								type: "button",
								className: panel_module_css_default.disclosure,
								"aria-expanded": !collapsed,
								onClick: () => {
									toggleGroupCollapse("tag:" + tag.id);
								},
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { className: panel_module_css_default.chevron + (collapsed ? " " + panel_module_css_default.chevronCollapsed : "") }), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
									className: panel_module_css_default.groupTitle,
									children: [
										tag.name,
										" · ",
										memberCount,
										/* @__PURE__ */ (0, react_jsx_runtime.jsx)(GroupSummary, {
											members: tag.skillNames,
											uses: hub.uses,
											hubConfig: hub.hubConfig
										}),
										view.missing.length > 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
											className: panel_module_css_default.groupNote,
											children: tt("groups.missing", { count: view.missing.length })
										}) : null
									]
								})]
							}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
								className: panel_module_css_default.groupOps,
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)(GroupSwitchButton, {
									state: view.state,
									label: tag.name,
									memberCount,
									missingCount: view.missing.length,
									batchBusy,
									hasTogglable,
									onToggle: () => {
										toggleGroup("tag:" + tag.id, tag.name, view.state);
									}
								}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
									type: "button",
									className: panel_module_css_default.opBtn,
									onClick: () => {
										setEditingTag(tag);
										setEditName(tag.name);
										setMembersDraft(new Set(tag.skillNames));
										setEditSearch("");
									},
									children: tt("groups.edit")
								})]
							})]
						}), !collapsed ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)(react_jsx_runtime.Fragment, { children: mergeGroupRows(skills, disabledMembers, hub.sortKey, getUses).map((row) => row.kind === "skill" ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)(SkillRow, {
							skill: row.skill,
							...rowProps
						}, row.skill.name) : /* @__PURE__ */ (0, react_jsx_runtime.jsx)(DisabledRow, {
							record: row.record,
							busy: busyNames.has(row.record.name),
							duplicate: duplicateNames.has(row.record.name),
							onEnable: () => {
								hub.toggle(row.record, true);
							},
							onOpen: () => {
								hub.openDetail(row.record.name);
							},
							stageDelete: rowProps.stageDelete
						}, row.record.name)) }) : null]
					}, "tag:" + tag.id);
				})
			] });
		}
		//#endregion
		//#region src/client/market-catalog.ts
		/** 默认市场目录：精选技能仓库（顺序即展示顺序）。 */
		const MARKET_CATALOG = [
			{
				repo: "anthropics/skills",
				descriptionKey: "market.catalog.anthropics"
			},
			{
				repo: "obra/superpowers",
				descriptionKey: "market.catalog.superpowers"
			},
			{
				repo: "mattpocock/skills",
				descriptionKey: "market.catalog.mattpocock"
			},
			{
				repo: "nexu-io/open-design",
				descriptionKey: "market.catalog.openDesign"
			}
		];
		//#endregion
		//#region src/client/panel/dialogs.tsx
		/**
		* Shared dialog family for the panel: one overlay shell plus the specific
		* dialogs (group-close conflict, sync/delete confirm, branch picker, market
		* sync selection, and the new-skill scaffold). Every dialog closes on outside
		* click and keeps the same role/aria shell; the panel owns all dialog state.
		*/
		/** Overlay + centered dialog shell; outside click or Escape cancels. */
		function DialogShell(props) {
			(0, react.useEffect)(() => {
				const onKey = (event) => {
					if (event.key === "Escape") props.onClose();
				};
				window.addEventListener("keydown", onKey);
				return () => {
					window.removeEventListener("keydown", onKey);
				};
			});
			return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
				className: panel_module_css_default.dialogOverlay,
				onClick: props.onClose,
				children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
					className: props.wide === true ? panel_module_css_default.dialog + " " + panel_module_css_default.dialogWide : panel_module_css_default.dialog,
					role: props.role ?? "alertdialog",
					"aria-modal": "true",
					onClick: (event) => {
						event.stopPropagation();
					},
					children: props.children
				})
			});
		}
		/** Simple confirm dialog: title + text + optional skill list + cancel/confirm. */
		function ConfirmDialog(props) {
			const { title, text, items, confirmLabel, danger, onCancel, onConfirm } = props;
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(DialogShell, {
				onClose: onCancel,
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("h3", {
						className: panel_module_css_default.dialogTitle,
						children: title
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
						className: panel_module_css_default.dialogText,
						children: text
					}),
					items !== void 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("ul", {
						className: panel_module_css_default.dialogList,
						children: items.map((name) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)("li", { children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
							className: panel_module_css_default.rowNameText,
							children: name
						}) }, name))
					}) : null,
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: panel_module_css_default.dialogActions,
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
							type: "button",
							className: panel_module_css_default.button,
							onClick: onCancel,
							children: tt("form.cancel")
						}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
							type: "button",
							className: panel_module_css_default.button + (danger === true ? " " + panel_module_css_default.danger : " " + panel_module_css_default.primary),
							onClick: onConfirm,
							children: confirmLabel
						})]
					})
				]
			});
		}
		/** New-skill scaffold: name + routing description + markdown body + target root, in a dialog. */
		function CreateSkillDialog(props) {
			const { name, desc, content, root, busy, message, onName, onDesc, onContent, onRoot, onCancel, onSubmit } = props;
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(DialogShell, {
				role: "dialog",
				wide: true,
				onClose: onCancel,
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("h3", {
					className: panel_module_css_default.dialogTitle,
					children: tt("form.title")
				}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("form", {
					className: panel_module_css_default.dialogForm,
					onSubmit: (event) => {
						event.preventDefault();
						onSubmit();
					},
					children: [
						/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							className: panel_module_css_default.formRow,
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("label", {
								className: panel_module_css_default.formLabel,
								children: tt("form.name")
							}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
								className: panel_module_css_default.input,
								value: name,
								autoFocus: true,
								onChange: (event) => {
									onName(event.target.value);
								},
								placeholder: "code-review"
							})]
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							className: panel_module_css_default.formRow,
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("label", {
								className: panel_module_css_default.formLabel,
								children: tt("form.desc")
							}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
								className: panel_module_css_default.input,
								value: desc,
								onChange: (event) => {
									onDesc(event.target.value);
								},
								placeholder: tt("form.descPlaceholder")
							})]
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							className: panel_module_css_default.formRow,
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("label", {
								className: panel_module_css_default.formLabel,
								children: tt("form.content")
							}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("textarea", {
								className: panel_module_css_default.textarea,
								value: content,
								rows: 9,
								spellCheck: false,
								onChange: (event) => {
									onContent(event.target.value);
								},
								placeholder: tt("form.contentPlaceholder")
							})]
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							className: panel_module_css_default.formRow,
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("label", {
								className: panel_module_css_default.formLabel,
								children: tt("form.root")
							}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("select", {
								className: panel_module_css_default.select,
								value: root,
								onChange: (event) => {
									onRoot(event.target.value);
								},
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("option", {
									value: "user-dsh",
									children: "~/.dsh/skills"
								}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("option", {
									value: "user-agents",
									children: "~/.agents/skills"
								})]
							})]
						}),
						message !== null ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
							className: message.kind === "error" ? panel_module_css_default.formError : panel_module_css_default.formSuccess,
							children: message.text
						}) : null,
						/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							className: panel_module_css_default.dialogActions,
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
								type: "button",
								className: panel_module_css_default.button,
								onClick: onCancel,
								children: tt("form.cancel")
							}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
								type: "submit",
								className: panel_module_css_default.button + " " + panel_module_css_default.primary,
								disabled: busy,
								children: busy ? tt("form.busy") : tt("form.submit")
							})]
						})
					]
				})]
			});
		}
		/** Group-close conflict: which skills stay on, and which other groups also enable them. */
		function ConflictDialog(props) {
			const { dialog, tags, collections, onClose, onKeepOn, onCloseAll } = props;
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(DialogShell, {
				onClose,
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("h3", {
						className: panel_module_css_default.dialogTitle,
						children: tt("groups.conflictTitle")
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
						className: panel_module_css_default.dialogText,
						children: tt("groups.conflictText")
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("ul", {
						className: panel_module_css_default.dialogList,
						children: dialog.conflicts.map((name) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("li", { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
							className: panel_module_css_default.rowNameText,
							children: name
						}), " — " + groupNamesOf(name, [...tags], [...collections]).join(", ")] }, name))
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: panel_module_css_default.dialogActions,
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
							type: "button",
							className: panel_module_css_default.button,
							onClick: onKeepOn,
							children: tt("groups.keepOn")
						}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
							type: "button",
							className: panel_module_css_default.button + " " + panel_module_css_default.primary,
							onClick: onCloseAll,
							children: tt("groups.closeAll")
						})]
					})
				]
			});
		}
		/** Branch picker for a repo without releases (pins the ref, then rescans). */
		function BranchChoiceDialog(props) {
			const { choice, busy, onSelect, onCancel, onConfirm } = props;
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(DialogShell, {
				onClose: onCancel,
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("h3", {
						className: panel_module_css_default.dialogTitle,
						children: tt("market.branchTitle")
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
						className: panel_module_css_default.dialogText,
						children: tt("market.branchHint")
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("select", {
						className: panel_module_css_default.select + " " + panel_module_css_default.dialogSelect,
						value: choice.selected,
						onChange: (event) => {
							onSelect(event.target.value);
						},
						children: choice.branches.map((branch) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)("option", {
							value: branch,
							children: branch
						}, branch))
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: panel_module_css_default.dialogActions,
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
							type: "button",
							className: panel_module_css_default.button,
							onClick: onCancel,
							children: tt("form.cancel")
						}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
							type: "button",
							className: panel_module_css_default.button + " " + panel_module_css_default.primary,
							disabled: busy,
							onClick: onConfirm,
							children: tt("market.branchConfirm")
						})]
					})
				]
			});
		}
		/** Version picker: switch a market source's tracked ref (release / branch / custom). */
		function VersionChoiceDialog(props) {
			const { choice, busy, onSelect, onCustom, onCancel, onConfirm } = props;
			const effective = choice.custom.trim() !== "" ? choice.custom.trim() : choice.selected;
			const branchOptions = choice.branches.filter((branch) => !choice.releases.includes(branch));
			const [refGroup, setRefGroup] = (0, react.useState)(choice.releases.includes(choice.selected) || choice.branches.length === 0 ? "releases" : "branches");
			(0, react.useEffect)(() => {
				if (choice.loading) return;
				if (choice.releases.includes(choice.selected)) setRefGroup("releases");
				else if (branchOptions.includes(choice.selected)) setRefGroup("branches");
			}, [choice.loading, choice.repo]);
			const activeRefs = refGroup === "releases" ? choice.releases : branchOptions;
			const listedRefs = [...choice.releases, ...branchOptions];
			const currentUnlistedRef = choice.selected !== "" && !listedRefs.includes(choice.selected) ? choice.selected : void 0;
			const selectRefs = currentUnlistedRef !== void 0 ? [currentUnlistedRef, ...activeRefs] : activeRefs;
			const selectValue = selectRefs.includes(choice.selected) ? choice.selected : selectRefs[0] ?? "";
			const selectGroup = (next) => {
				setRefGroup(next);
				const nextRefs = next === "releases" ? choice.releases : branchOptions;
				if (nextRefs.length > 0 && !nextRefs.includes(choice.selected)) onSelect(nextRefs[0]);
			};
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(DialogShell, {
				onClose: onCancel,
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("h3", {
						className: panel_module_css_default.dialogTitle,
						children: tt("market.versionTitle")
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("p", {
						className: panel_module_css_default.dialogText,
						children: [tt("market.versionText", { repo: choice.repo }), choice.current !== void 0 ? ` (${tt("market.versionCurrent", { ref: choice.current })})` : ""]
					}),
					choice.loading ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
						className: panel_module_css_default.dialogText,
						children: tt("market.scanning")
					}) : /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [
						/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							className: panel_module_css_default.segmented,
							role: "group",
							"aria-label": tt("market.versionTitle"),
							style: { marginBottom: 8 },
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
								type: "button",
								className: panel_module_css_default.segBtn + (refGroup === "releases" ? " " + panel_module_css_default.segBtnActive : ""),
								disabled: choice.releases.length === 0,
								"aria-pressed": refGroup === "releases",
								onClick: () => {
									selectGroup("releases");
								},
								children: tt("market.versionReleases")
							}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
								type: "button",
								className: panel_module_css_default.segBtn + (refGroup === "branches" ? " " + panel_module_css_default.segBtnActive : ""),
								disabled: branchOptions.length === 0,
								"aria-pressed": refGroup === "branches",
								onClick: () => {
									selectGroup("branches");
								},
								children: tt("market.versionBranches")
							})]
						}),
						selectValue !== "" ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("select", {
							className: panel_module_css_default.select + " " + panel_module_css_default.dialogSelect,
							value: selectValue,
							onChange: (event) => {
								onSelect(event.target.value);
							},
							children: selectRefs.map((ref) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)("option", {
								value: ref,
								children: ref
							}, ref))
						}) : null,
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
							className: panel_module_css_default.dialogText,
							style: { marginBottom: 4 },
							children: tt("market.versionCustom")
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
							className: panel_module_css_default.input + " " + panel_module_css_default.dialogSelect,
							value: choice.custom,
							onChange: (event) => {
								onCustom(event.target.value);
							},
							placeholder: "v1.2.3 / main / abc1234"
						})
					] }),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: panel_module_css_default.dialogActions,
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
							type: "button",
							className: panel_module_css_default.button,
							onClick: onCancel,
							children: tt("form.cancel")
						}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
							type: "button",
							className: panel_module_css_default.button + " " + panel_module_css_default.primary,
							disabled: busy || choice.loading || effective === "",
							onClick: onConfirm,
							children: busy ? tt("source.syncing") : tt("market.versionConfirm", { ref: effective })
						})]
					})
				]
			});
		}
		/** Post-sync selection: which tracked skills to batch-update to the new version. */
		function MarketSyncDialog(props) {
			const { dialog, busy, onToggle, onCancel, onConfirm } = props;
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(DialogShell, {
				onClose: onCancel,
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("h3", {
						className: panel_module_css_default.dialogTitle,
						children: tt("market.syncTitle")
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
						className: panel_module_css_default.dialogText,
						children: tt("market.syncText", { ref: dialog.ref })
					}),
					dialog.skills.length === 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
						className: panel_module_css_default.dialogText,
						children: tt("market.syncNone")
					}) : /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						className: panel_module_css_default.dialogList,
						children: dialog.skills.map((name) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", {
							className: panel_module_css_default.dialogRow,
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
								type: "checkbox",
								checked: dialog.selected.has(name),
								onChange: (event) => {
									onToggle(name, event.target.checked);
								}
							}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
								className: panel_module_css_default.rowNameText,
								children: name
							})]
						}, name))
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: panel_module_css_default.dialogActions,
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
							type: "button",
							className: panel_module_css_default.button,
							onClick: onCancel,
							children: tt("market.syncCancel")
						}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
							type: "button",
							className: panel_module_css_default.button + " " + panel_module_css_default.primary,
							disabled: busy || dialog.skills.length === 0,
							onClick: onConfirm,
							children: busy ? tt("source.syncing") : tt("source.sync")
						})]
					})
				]
			});
		}
		//#endregion
		//#region src/client/panel/market-format.ts
		/** Market tab number formatting (stars/downloads/bytes/speed). Pure, no deps. */
		/** Compact count for stars/downloads (1234 → 1.2k). */
		function formatCount(n) {
			if (n < 1e3) return String(n);
			if (n < 1e6) return (n / 1e3).toFixed(1).replace(/\.0$/, "") + "k";
			return (n / 1e6).toFixed(1).replace(/\.0$/, "") + "M";
		}
		/** Compact byte size for repo preview rows. */
		function formatBytes(bytes) {
			if (bytes < 1024) return bytes + " B";
			if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
			return (bytes / 1024 / 1024).toFixed(1) + " MB";
		}
		function formatSpeed(bps) {
			if (bps === void 0 || bps <= 0) return "";
			if (bps < 1024) return bps + " B/s";
			if (bps < 1024 * 1024) return (bps / 1024).toFixed(1) + " KB/s";
			return (bps / 1024 / 1024).toFixed(1) + " MB/s";
		}
		//#endregion
		//#region src/client/panel/MarketSourceRow.tsx
		function MarketSourceRow(props) {
			const { hub, record } = props;
			const { marketCheck, sourceCheck, scanningRepo, syncingMarket, checkingSource, tagBusy, checkSources, checkMarket, syncMarketSource, scanRepo, removeMarketSource } = hub;
			const releaseCheck = marketCheck[record.repo];
			const skillCheck = sourceCheck[record.repo];
			const scanning = scanningRepo === record.repo;
			const syncing = syncingMarket === record.repo;
			const checking = checkingSource === record.repo;
			const hasSkillUpdate = skillCheck?.changed === true && skillCheck.updated.length > 0;
			const hasReleaseUpdate = releaseCheck?.updateAvailable === true;
			const hasUpdate = hasSkillUpdate || hasReleaseUpdate;
			const isChecked = releaseCheck !== void 0 || skillCheck !== void 0;
			let updateLabel;
			let updateDisabled = false;
			let updateDanger = false;
			let updateAction = () => {};
			if (syncing) {
				updateLabel = tt("market.syncing");
				updateDisabled = true;
			} else if (checking) {
				updateLabel = tt("market.checking");
				updateDisabled = true;
			} else if (!isChecked) {
				updateLabel = tt("market.checkUpdate");
				updateAction = () => {
					checkSources(record.repo);
					checkMarket();
				};
			} else if (hasUpdate) {
				const count = hasSkillUpdate ? skillCheck.updated.length : 1;
				updateLabel = count > 1 || hasSkillUpdate ? tt("market.updateCount", { count }) : tt("market.update");
				updateDanger = true;
				updateAction = () => {
					syncMarketSource(record.repo);
				};
			} else {
				updateLabel = tt("market.upToDate");
				updateDisabled = true;
			}
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: panel_module_css_default.row + " " + panel_module_css_default.rowStatic,
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: panel_module_css_default.rowMain,
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							className: panel_module_css_default.rowName,
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("a", {
								className: panel_module_css_default.sourceLink,
								href: "https://github.com/" + record.repo,
								target: "_blank",
								rel: "noreferrer",
								children: record.repo
							}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
								type: "button",
								className: panel_module_css_default.badge + " " + panel_module_css_default.badgeSource,
								style: {
									cursor: "pointer",
									fontFamily: "inherit"
								},
								title: tt("market.versionHint"),
								onClick: () => {
									hub.openVersionDialog(record.repo);
								},
								children: record.ref ?? tt("market.unpinned")
							})]
						}), (() => {
							const stats = hub.marketStats[record.repo];
							const hasDeleted = skillCheck !== void 0 && skillCheck.deleted.length > 0;
							if (stats === void 0 && !hasSkillUpdate && !hasDeleted && !hasReleaseUpdate) return null;
							return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
								className: panel_module_css_default.hintLine,
								style: {
									display: "flex",
									gap: 4,
									flexWrap: "wrap",
									marginTop: 3
								},
								children: [
									hasSkillUpdate ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
										className: panel_module_css_default.badge + " " + panel_module_css_default.statusUpdated,
										children: tt("market.updatable", { count: skillCheck.updated.length })
									}) : null,
									hasDeleted ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
										className: panel_module_css_default.badge + " " + panel_module_css_default.statusError,
										children: tt("market.deletedUpstream", { count: skillCheck.deleted.length })
									}) : null,
									hasReleaseUpdate ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
										className: panel_module_css_default.badge + " " + panel_module_css_default.statusUpdated,
										children: releaseCheck.latestTag !== void 0 ? tt("market.newRelease", { version: releaseCheck.latestTag }) : tt("market.updated")
									}) : null,
									stats !== void 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
										className: panel_module_css_default.badge + " " + panel_module_css_default.badgeCount,
										title: tt("market.starsHint", { count: stats.stars }),
										children: ["★ ", formatCount(stats.stars)]
									}) : null,
									stats !== void 0 && stats.downloads > 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
										className: panel_module_css_default.badge + " " + panel_module_css_default.badgeCount,
										title: tt("market.downloadsHint", { count: stats.downloads }),
										children: ["⭳ ", formatCount(stats.downloads)]
									}) : null
								]
							});
						})()]
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
						type: "button",
						className: panel_module_css_default.button + " " + panel_module_css_default.primary,
						style: {
							padding: "4px 10px",
							fontSize: 12
						},
						disabled: scanning,
						onClick: () => {
							scanRepo(record.repo);
						},
						children: scanning ? tt("market.scanning") : tt("market.scan")
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
						type: "button",
						className: panel_module_css_default.opBtn + (updateDanger ? " " + panel_module_css_default.opDanger : ""),
						disabled: updateDisabled,
						title: hasUpdate ? tt("market.syncHint") : void 0,
						onClick: updateAction,
						children: updateLabel
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
						type: "button",
						className: panel_module_css_default.opBtn,
						disabled: tagBusy,
						title: tt("market.removeHint"),
						"aria-label": tt("market.deleteSource"),
						onClick: () => {
							removeMarketSource(record.repo);
						},
						style: {
							padding: "4px 8px",
							minWidth: 28
						},
						children: "×"
					})
				]
			});
		}
		//#endregion
		//#region src/client/panel/RepoScanCard.tsx
		/**
		* RepoScanCard — 扫描结果归属卡片：扫描中/错误/就绪（搜索+过滤+分页+
		* 勾选导入+进度+结果）都包在这里。搜索/过滤/分页是卡片级本地状态，
		* 随卡片挂载而生、关闭而灭。从 MarketView.tsx 原样搬出，渲染逻辑不变。
		*/
		/**
		* 已知技能根的显示名键；未知根直接显示目录名。
		* zh 字典里这两项就是目录名本身（与接线前的硬编码文本一致）。
		* 空串是「技能就在仓库根」的哨兵根（host 侧 REPO_ROOT），目录名无从显示，
		* 给它一个可读标签，否则筛选按钮会是一片空白。
		*/
		function rootLabelKey(root) {
			if (root === "") return "repo.root.self";
			if (root === "skills") return "repo.root.skills";
			if (root === "design-templates") return "repo.root.designTemplates";
			return "repo.root.generic";
		}
		function RepoScanCard(props) {
			const { hub } = props;
			const { repoDiscoverState, scanningRepo, repoResult, repoSelected, setRepoSelected, repoImporting, toggleRepoSelected, importRepo, cancelImport } = hub;
			const [repoSearch, setRepoSearch] = (0, react.useState)("");
			const [repoFilter, setRepoFilter] = (0, react.useState)("all");
			const [visibleCount, setVisibleCount] = (0, react.useState)(50);
			(0, react.useEffect)(() => {
				setVisibleCount(50);
			}, [
				repoDiscoverState,
				repoSearch,
				repoFilter
			]);
			if (repoDiscoverState.status === "idle" && repoResult === null) return null;
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("section", {
				className: panel_module_css_default.section,
				style: {
					borderLeft: "3px solid var(--hub-model, #2f81f7)",
					background: "rgba(47,129,247,0.04)"
				},
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					className: panel_module_css_default.sectionTitle + " " + panel_module_css_default.sectionHeadRow,
					style: { margin: "10px 14px 6px" },
					children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
						className: panel_module_css_default.sectionTitleFill,
						style: {
							display: "flex",
							alignItems: "center",
							gap: 6
						},
						children: [tt("repo.scanTitle"), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
							style: {
								fontWeight: 400,
								opacity: .75
							},
							children: [
								"— ",
								repoDiscoverState.status === "ready" ? repoDiscoverState.data.repo : repoDiscoverState.status === "error" ? scanningRepo ?? "" : scanningRepo ?? "",
								repoDiscoverState.status === "ready" && repoDiscoverState.data.ref !== null ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
									style: {
										opacity: .5,
										marginLeft: 6
									},
									children: ["ref ", repoDiscoverState.data.ref]
								}) : null
							]
						})]
					}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
						type: "button",
						className: panel_module_css_default.opBtn,
						onClick: () => {
							hub.clearScan();
						},
						children: tt("repo.close")
					})]
				}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					style: { padding: "0 12px 12px" },
					children: [
						repoDiscoverState.status === "scanning" ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
							className: panel_module_css_default.empty,
							style: { padding: "12px 0" },
							children: tt("market.scanning")
						}) : null,
						repoDiscoverState.status === "error" ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
							className: panel_module_css_default.errorBanner,
							children: repoDiscoverState.message
						}) : null,
						repoDiscoverState.status === "ready" ? (() => {
							const entries = repoDiscoverState.data.entries;
							const installedNames = /* @__PURE__ */ new Set([
								...(hub.catalog?.skills ?? []).map((s) => s.name),
								...(repoResult?.imported ?? []).map((r) => r.name),
								...(repoResult?.skipped ?? []).map((r) => r.name)
							]);
							const isExisting = (entry) => entry.existing || installedNames.has(entry.name);
							const selected = entries.filter((entry) => repoSelected.has(entry.path) && !isExisting(entry));
							const selectedBytes = selected.reduce((s, e) => s + e.totalBytes, 0);
							const filtered = entries.filter((entry) => {
								if (repoFilter !== "all" && entry.root !== repoFilter) return false;
								if (repoSearch.trim() !== "" && !entry.name.toLowerCase().includes(repoSearch.trim().toLowerCase())) return false;
								return true;
							}).sort((a, b) => a.name.localeCompare(b.name));
							const paged = filtered.slice(0, visibleCount);
							return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [
								/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("p", {
									className: panel_module_css_default.hintLine + " " + panel_module_css_default.hintInline,
									children: [
										tt("repo.ready", { count: entries.length }),
										" · ",
										repoDiscoverState.data.ref !== null ? `ref ${repoDiscoverState.data.ref}` : ""
									]
								}),
								repoDiscoverState.data.truncated === true ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
									className: panel_module_css_default.errorBanner,
									style: {
										background: "rgba(210,153,34,0.08)",
										color: "#d29922",
										borderLeft: "3px solid #d29922"
									},
									children: tt("repo.truncated")
								}) : null,
								entries.length === 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
									className: panel_module_css_default.empty,
									children: tt("repo.empty")
								}) : /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [
									(() => {
										const order = /* @__PURE__ */ new Map([["skills", 0], ["design-templates", 1]]);
										const roots = [...new Set(entries.map((e) => e.root))].sort((a, b) => {
											const ao = order.get(a) ?? 99;
											const bo = order.get(b) ?? 99;
											return ao !== bo ? ao - bo : a.localeCompare(b);
										});
										const counts = /* @__PURE__ */ new Map();
										for (const e of entries) counts.set(e.root, (counts.get(e.root) ?? 0) + 1);
										return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
											style: {
												display: "flex",
												gap: 8,
												marginBottom: 8,
												flexWrap: "wrap"
											},
											children: [
												/* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
													className: panel_module_css_default.input,
													style: {
														flex: 1,
														minWidth: 140
													},
													value: repoSearch,
													onChange: (e) => setRepoSearch(e.target.value),
													placeholder: tt("repo.searchPlaceholder")
												}),
												/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
													type: "button",
													className: panel_module_css_default.button + (repoFilter === "all" ? " " + panel_module_css_default.primary : ""),
													style: {
														padding: "6px 10px",
														fontSize: 12
													},
													onClick: () => setRepoFilter("all"),
													children: tt("repo.allRoots", { count: entries.length })
												}),
												roots.map((root) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("button", {
													type: "button",
													className: panel_module_css_default.button + (repoFilter === root ? " " + panel_module_css_default.primary : ""),
													style: {
														padding: "6px 10px",
														fontSize: 12
													},
													onClick: () => setRepoFilter(root),
													children: [
														tt(rootLabelKey(root), { root }),
														" ",
														counts.get(root) ?? 0
													]
												}, root === "" ? "repo-root" : root))
											]
										});
									})(),
									/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
										className: panel_module_css_default.hintLine,
										style: {
											display: "flex",
											justifyContent: "space-between",
											flexWrap: "wrap",
											gap: 8
										},
										children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: tt("repo.selection", {
											selected: selected.length,
											total: entries.length,
											size: formatBytes(selectedBytes),
											shown: paged.length,
											filtered: filtered.length
										}) }), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
											style: {
												display: "flex",
												gap: 6
											},
											children: [
												/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
													type: "button",
													className: panel_module_css_default.button,
													style: {
														padding: "4px 8px",
														fontSize: 11
													},
													onClick: () => {
														setRepoSelected(new Set(filtered.filter((e) => !isExisting(e)).slice(0, visibleCount).map((e) => e.path)));
													},
													children: tt("repo.selectVisible")
												}),
												/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
													type: "button",
													className: panel_module_css_default.button,
													style: {
														padding: "4px 8px",
														fontSize: 11
													},
													onClick: () => {
														setRepoSelected(new Set(entries.filter((e) => !isExisting(e)).map((e) => e.path)));
													},
													children: tt("repo.selectAllN", { count: entries.filter((e) => !isExisting(e)).length })
												}),
												/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
													type: "button",
													className: panel_module_css_default.button,
													style: {
														padding: "4px 8px",
														fontSize: 11
													},
													onClick: () => {
														setRepoSelected(/* @__PURE__ */ new Set());
													},
													children: tt("repo.clearAll")
												})
											]
										})]
									}),
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
										className: panel_module_css_default.scanList,
										children: paged.length === 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
											className: panel_module_css_default.empty,
											style: { padding: 20 },
											children: tt("repo.noMatch")
										}) : paged.map((entry) => {
											const existing = isExisting(entry);
											return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", {
												className: panel_module_css_default.row + (existing ? " " + panel_module_css_default.rowMuted : ""),
												children: [
													/* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
														type: "checkbox",
														checked: repoSelected.has(entry.path),
														disabled: existing,
														onChange: (event) => {
															toggleRepoSelected(entry.path, event.target.checked);
														}
													}),
													/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
														className: panel_module_css_default.rowMain,
														children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
															className: panel_module_css_default.rowName,
															children: entry.name
														}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
															className: panel_module_css_default.rowDesc,
															children: [
																entry.dir === "" ? tt("repo.root.self") : entry.dir,
																" · ",
																tt("repo.files", {
																	count: entry.fileCount,
																	size: formatBytes(entry.totalBytes)
																})
															]
														})]
													}),
													existing ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
														className: panel_module_css_default.badge + " " + panel_module_css_default.badgeReadonly,
														children: tt("repo.existing")
													}) : /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
														className: panel_module_css_default.badge + " " + panel_module_css_default.badgeSource,
														children: entry.origin
													})
												]
											}, entry.path);
										})
									}),
									visibleCount < filtered.length ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
										style: {
											textAlign: "center",
											marginTop: 8
										},
										children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
											type: "button",
											className: panel_module_css_default.button,
											onClick: () => setVisibleCount((n) => n + 50),
											children: tt("repo.loadMore", {
												step: 50,
												remaining: filtered.length - visibleCount
											})
										})
									}) : null,
									/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
										className: panel_module_css_default.buttons + " " + panel_module_css_default.actionsTop,
										children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
											type: "button",
											className: panel_module_css_default.button + " " + panel_module_css_default.primary,
											disabled: selected.length === 0 || repoImporting,
											onClick: () => {
												importRepo();
											},
											children: repoImporting ? tt("repo.importing") : `${tt("repo.import", { count: selected.length })} · ${formatBytes(selectedBytes)}`
										}), repoImporting ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
											type: "button",
											className: panel_module_css_default.button,
											onClick: () => {
												cancelImport();
											},
											children: tt("repo.cancel")
										}) : null]
									}),
									repoResult !== null && repoResult.status === "running" ? (() => {
										const pct = repoResult.totalBytes > 0 ? Math.min(100, Math.round(repoResult.downloadedBytes / repoResult.totalBytes * 100)) : repoResult.total > 0 ? Math.round(repoResult.done / repoResult.total * 100) : 0;
										const speed = formatSpeed(repoResult.bytesPerSecond);
										return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
											className: panel_module_css_default.formSuccess + " " + panel_module_css_default.actionsTop,
											children: [
												/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
													style: {
														display: "flex",
														alignItems: "center",
														gap: 8,
														marginBottom: 6
													},
													children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
														className: panel_module_css_default.scanProgressTrack,
														children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
															className: panel_module_css_default.scanProgressFill,
															style: { width: `${pct}%` }
														})
													}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
														style: {
															fontSize: 11,
															opacity: .75,
															minWidth: 32,
															textAlign: "right"
														},
														children: [pct, "%"]
													})]
												}),
												/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
													className: panel_module_css_default.hintLine,
													children: [
														formatBytes(repoResult.downloadedBytes),
														" / ",
														formatBytes(repoResult.totalBytes),
														speed !== "" ? ` · ${speed}` : "",
														" · ",
														tt("repo.skillProgress", {
															done: repoResult.done,
															total: repoResult.total
														})
													]
												}),
												/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
													className: panel_module_css_default.hintLine,
													style: { marginTop: 4 },
													children: [repoResult.current !== void 0 ? tt("repo.importingCurrent", {
														name: repoResult.current,
														done: repoResult.done + 1,
														total: repoResult.total
													}) : tt("repo.importing"), repoResult.currentFile !== void 0 ? ` · ${repoResult.currentFile}` : ""]
												}),
												repoResult.failed.length > 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
													className: panel_module_css_default.errorBanner,
													style: { marginTop: 6 },
													children: repoResult.failed.map((f) => `${f.name}: ${f.error}`).join("; ")
												}) : null
											]
										});
									})() : null
								] })
							] });
						})() : null,
						repoResult !== null && repoResult.status !== "running" ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							className: repoResult.status === "cancelled" ? panel_module_css_default.errorBanner + " " + panel_module_css_default.actionsTop : panel_module_css_default.formSuccess + " " + panel_module_css_default.actionsTop,
							children: [
								repoResult.status === "cancelled" ? tt("repo.cancelled", {
									imported: repoResult.imported.length,
									total: repoResult.total
								}) : `${tt("repo.imported", { count: repoResult.imported.length })} · ${tt("repo.skippedExisting", { count: repoResult.skipped.length })} · ${tt("repo.failed", { count: repoResult.failed.length })}`,
								repoResult.failed.length > 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
									style: { marginTop: 6 },
									children: repoResult.failed.map((f) => `${f.name}: ${f.error}`).join("; ")
								}) : null,
								repoResult.status === "error" && repoResult.error ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
									style: { marginTop: 6 },
									children: repoResult.error
								}) : null
							]
						}) : null
					]
				})]
			});
		}
		//#endregion
		//#region src/client/panel/MarketView.tsx
		/**
		* Market tab: one unified market list — built-in catalog entries (add
		* button while not yet added) and the user's market sources (full state
		* badges + actions once added, plus custom sources), with check-all and
		* update-all actions and the repo scan result with the importable checklist.
		* 行渲染在 MarketSourceRow，扫描卡片在 RepoScanCard，数字格式在 market-format。
		*/
		function MarketView(props) {
			const { hub } = props;
			const { marketState, sourceCheck, scanningRepo, newSourceName, setNewSourceName, tagBusy, addSource, addMarketSource, checkMarket, checkSources, updateAllDialog, setUpdateAllDialog, updateAll } = hub;
			/** 有可更新技能的来源（全部更新按钮与确认列表共用）。 */
			const updatableRepos = Object.entries(sourceCheck).filter(([, check]) => check.changed && check.updated.length > 0);
			(0, react.useEffect)(() => {
				hub.loadMarketStats();
			}, []);
			const rows = [];
			for (const entry of MARKET_CATALOG) {
				const record = marketState.repos.find((item) => item.repo === entry.repo);
				if (record !== void 0) rows.push({
					key: entry.repo,
					element: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(MarketSourceRow, {
						hub,
						record
					})
				});
				else {
					const busy = scanningRepo !== null || tagBusy;
					rows.push({
						key: entry.repo,
						element: /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							className: panel_module_css_default.row + " " + panel_module_css_default.rowStatic,
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
								className: panel_module_css_default.rowMain,
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
									className: panel_module_css_default.rowName,
									children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("a", {
										className: panel_module_css_default.sourceLink,
										href: "https://github.com/" + entry.repo,
										target: "_blank",
										rel: "noreferrer",
										children: entry.repo
									})
								}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
									className: panel_module_css_default.rowDesc,
									children: tt(entry.descriptionKey)
								})]
							}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
								type: "button",
								className: panel_module_css_default.opBtn,
								disabled: busy,
								onClick: () => {
									addSource(entry.repo);
								},
								children: tt("market.add")
							})]
						})
					});
				}
			}
			for (const record of marketState.repos) {
				if (MARKET_CATALOG.some((entry) => entry.repo === record.repo)) continue;
				rows.push({
					key: record.repo,
					element: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(MarketSourceRow, {
						hub,
						record
					})
				});
			}
			const unaddedCatalog = MARKET_CATALOG.filter((entry) => !marketState.repos.some((record) => record.repo === entry.repo));
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [
				/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("section", {
					className: panel_module_css_default.section,
					children: [
						/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							className: panel_module_css_default.sectionTitle + " " + panel_module_css_default.sectionHeadRow,
							children: [
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
									className: panel_module_css_default.sectionTitleFill,
									children: tt("market.title")
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
									type: "button",
									className: panel_module_css_default.opBtn,
									onClick: () => {
										checkSources();
										checkMarket();
									},
									children: tt("market.checkAll")
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
									type: "button",
									className: panel_module_css_default.opBtn + (updatableRepos.length > 0 ? " " + panel_module_css_default.opDanger : ""),
									disabled: updatableRepos.length === 0 || tagBusy,
									onClick: () => {
										setUpdateAllDialog(true);
									},
									children: tt("market.updateAll")
								})
							]
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							className: panel_module_css_default.buttons + " " + panel_module_css_default.actionsPadded,
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
								className: panel_module_css_default.input + " " + panel_module_css_default.grow,
								value: newSourceName,
								onChange: (event) => {
									setNewSourceName(event.target.value);
								},
								onKeyDown: (event) => {
									if (event.key === "Enter") {
										event.preventDefault();
										addMarketSource();
									}
								},
								placeholder: tt("market.addPlaceholder")
							}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
								type: "button",
								className: panel_module_css_default.button + " " + panel_module_css_default.primary,
								disabled: newSourceName.trim() === "",
								onClick: () => {
									addMarketSource();
								},
								children: tt("market.addSource")
							})]
						}),
						unaddedCatalog.length > 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
							className: panel_module_css_default.hintLine + " " + panel_module_css_default.hintPadded,
							children: tt("market.catalogHint")
						}) : null,
						marketState.status === "loading" ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
							className: panel_module_css_default.empty,
							children: tt("panel.loading")
						}) : null,
						marketState.status !== "loading" && rows.length === 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
							className: panel_module_css_default.empty,
							children: tt("market.noSources")
						}) : null,
						marketState.status !== "loading" ? rows.map((row) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)(react.Fragment, { children: row.element }, row.key)) : null
					]
				}),
				/* @__PURE__ */ (0, react_jsx_runtime.jsx)(RepoScanCard, { hub }),
				updateAllDialog ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)(ConfirmDialog, {
					title: tt("market.updateAllConfirmTitle"),
					text: tt("market.updateAllConfirmText"),
					items: updatableRepos.map(([repo, check]) => tt("market.updateAllItem", {
						repo,
						count: check.updated.length
					})),
					confirmLabel: tt("market.updateAll"),
					danger: true,
					onCancel: () => {
						setUpdateAllDialog(false);
					},
					onConfirm: () => {
						updateAll();
					}
				}) : null
			] });
		}
		//#endregion
		//#region src/domain/scope-policy.ts
		/**
		* 策展层 · 可见性策略的纯语义：把一个**白名单策略**（分组键 + 技能名）展开成
		* "该主体可见 / 隐藏哪些技能"。模式策略与工作区策略共用这一份判定，会话上的
		* 实际效果是**工作区覆盖模式**，见 {@link overridePolicyEntries}。
		*
		* 本模块**零 IO、零副作用**：输入是策略、分组索引与目录全集，输出是名字集合。
		* 一切副作用（读写 sidecar、扫描目录、注入 provider）都在调用方。这样
		* `enforcement` 与 `routes` 两侧共用同一份判定，且判定本身可以被穷举测试。
		*/
		/**
		* 把白名单展开成技能名集合。**不解释 `enabled`**——那属于调用方的策略语义，
		* 见 {@link resolveScopeVisibility}。
		*
		* 展开按 `groups` 在前、`skills` 在后依次累加，保证同一输入下结果稳定；
		* 所有结果都裁剪到 `index.known`，因此指向已删除技能的分组不会凭空"复活"它。
		* @param policy - 待展开的策略。
		* @param index - 分组成员与目录快照。
		* @returns 可见集合、逐键明细与悬空键。
		*/
		function expandScopePolicy(policy, index) {
			const visibleSet = /* @__PURE__ */ new Set();
			const resolved = {};
			const dangling = [];
			for (const key of policy.groups) {
				const parsed = parseScopeEntry(key);
				if (parsed === void 0) {
					resolved[key] = [];
					dangling.push(key);
					continue;
				}
				if (parsed.kind === "skill") {
					const hit = index.known.has(parsed.value) ? [parsed.value] : [];
					resolved[key] = [.../* @__PURE__ */ new Set([...resolved[key] ?? [], ...hit])];
					for (const name of hit) visibleSet.add(name);
					continue;
				}
				const members = index.members.get(key);
				if (members === void 0) {
					resolved[key] = [];
					dangling.push(key);
					continue;
				}
				const kept = [...new Set(members.filter((name) => index.known.has(name)))].sort((a, b) => a.localeCompare(b));
				resolved[key] = kept;
				for (const name of kept) visibleSet.add(name);
			}
			for (const name of policy.skills) {
				if (!index.known.has(name)) continue;
				const key = `skill:${name}`;
				resolved[key] = [.../* @__PURE__ */ new Set([...resolved[key] ?? [], name])];
				visibleSet.add(name);
			}
			return {
				visible: [...visibleSet].sort((a, b) => a.localeCompare(b)),
				visibleSet,
				resolved,
				dangling: [...new Set(dangling)]
			};
		}
		//#endregion
		//#region src/client/panel/hooks/shared.ts
		/**
		* 统一异步动作外壳：清错 → 执行 → 异常转错误条幅 → 收尾（忙碌开关）。
		* 只用于同形的 clearFail/try/catch/finally 站点；成功后清错、自定义收尾、
		* 需要返回值的站点保持内联。
		*/
		async function runFlow(shared, body, settle = () => {}) {
			shared.clearFail();
			try {
				return await body();
			} catch (error) {
				shared.fail(errorMessage(error));
				return;
			} finally {
				settle();
			}
		}
		/** Catalog poll interval while the panel is mounted (the provider watcher feeds this). */
		const POLL_MS = 5e3;
		/** Relaxed poll for slower-changing data (stats, groups, sources, config). */
		const SLOW_POLL_MS = 6e4;
		/** localStorage key of the last daily auto-check timestamp (survives sessions). */
		const AUTO_CHECK_KEY = "skill-hub.last-auto-check";
		/** Daily auto-check interval: at most one network round per day. */
		const AUTO_CHECK_INTERVAL_MS = 1440 * 6e4;
		/** Whether the daily auto-check should run now (first visit or ≥24h since the last). */
		function shouldAutoCheck() {
			try {
				const raw = localStorage.getItem(AUTO_CHECK_KEY);
				const last = raw === null ? NaN : Number(raw);
				if (!Number.isFinite(last)) return true;
				return Date.now() - last >= AUTO_CHECK_INTERVAL_MS;
			} catch {
				return true;
			}
		}
		/** Record that the daily auto-check ran. */
		function markAutoChecked() {
			try {
				localStorage.setItem(AUTO_CHECK_KEY, String(Date.now()));
			} catch {}
		}
		//#endregion
		//#region src/client/panel/hooks/usePolicyDraft.ts
		/**
		* usePolicyDraft — 「可见性策略编辑器」的共用草稿机。
		*
		* 模式（`useScopeFlow`）与工作区（`useWorkspaceFlow`）编辑的是同一种东西：
		* 一份 `{ enabled, groups, skills }` 白名单，勾选 → 本地预览 → 保存落盘。
		* 差异只有三处，全部由调用方以 `PolicyDraftAdapter` 注入：
		*   · 保存/重置打到哪个接口（presetId vs workspaceId）；
		*   · 保存成功后重新拉哪份名单；
		*   · 行上的文案与状态（列表态，不在这里）。
		* 于是草稿状态机、纯本地预览、空白名单确认这一整套只写一遍。
		*
		* 预览是**本地纯计算**（复用 `domain/scope-policy` 的展开函数），所以勾选时立即
		* 有反馈、不需要往返服务端；服务端返回的计数用于列表行，两侧共用同一份判定语义，
		* 不会出现"预览说 3 个、实际隐藏 2 个"。
		*/
		/**
		* 分组键 → 成员：场景、来源集合、来源根三类，与宿主侧同一份口径。
		* @param groupsState - 分组数据（场景 tag + 来源集合）。
		* @param catalog - 目录（来源根与已知技能名都从这里推）。
		*/
		function buildPolicyGroupIndex(groupsState, catalog) {
			const members = /* @__PURE__ */ new Map();
			for (const tag of groupsState?.tags ?? []) members.set(tagKey(tag.id), tag.skillNames);
			for (const collection of groupsState?.collections ?? []) members.set(collectionKey(collection.name), collection.skillNames);
			const bySource = /* @__PURE__ */ new Map();
			const known = /* @__PURE__ */ new Set();
			for (const skill of catalog?.skills ?? []) {
				known.add(skill.name);
				const list = bySource.get(skill.source);
				if (list === void 0) bySource.set(skill.source, [skill.name]);
				else list.push(skill.name);
			}
			for (const [source, names] of bySource) members.set(sourceKey(source), names);
			return {
				members,
				known
			};
		}
		/**
		* 把分组数据摊平成勾选列表（场景 → 集合 → 来源根，与侧栏顺序一致）。
		* @param groupsState - 分组数据。
		* @param catalog - 目录（来源根的成员数与名称都从这里推）。
		* @param preview - 当前草稿的展开结果（用来显示每个分组贡献了几个技能）。
		* @returns 勾选项列表。
		*/
		function scopeGroupOptions(groupsState, catalog, preview) {
			const options = [];
			for (const tag of groupsState?.tags ?? []) options.push({
				key: tagKey(tag.id),
				label: tag.name,
				kind: "tag",
				count: (preview?.resolved[tagKey(tag.id)] ?? tag.skillNames).length
			});
			for (const collection of groupsState?.collections ?? []) options.push({
				key: collectionKey(collection.name),
				label: collection.name,
				kind: "col",
				count: (preview?.resolved[collectionKey(collection.name)] ?? collection.skillNames).length
			});
			const bySource = /* @__PURE__ */ new Map();
			for (const skill of catalog?.skills ?? []) bySource.set(skill.source, (bySource.get(skill.source) ?? 0) + 1);
			for (const [source, count] of [...bySource.entries()].sort((a, b) => a[0].localeCompare(b[0]))) options.push({
				key: sourceKey(source),
				label: source,
				kind: "src",
				count
			});
			return options;
		}
		/**
		* 管理一份可见性草稿：加载由调用方负责，这里只管"编辑中的那一个主体"。
		* @param adapter - 主题相关的保存/重置/重载动作（对象每次渲染重建没关系，内部按 ref 取最新的）。
		* @param shared - 跨域通知原语。
		* @param groupsState - 分组数据。
		* @param catalog - 目录。
		*/
		function usePolicyDraft(adapter, shared, groupsState, catalog) {
			const adapterRef = (0, react.useRef)(adapter);
			adapterRef.current = adapter;
			const editingRef = (0, react.useRef)(null);
			const [editing, setEditing] = (0, react.useState)(null);
			const [busy, setBusy] = (0, react.useState)(false);
			const [enabled, setEnabledState] = (0, react.useState)(false);
			const [groups, setGroups] = (0, react.useState)(/* @__PURE__ */ new Set());
			const [skills, setSkills] = (0, react.useState)(/* @__PURE__ */ new Set());
			const [confirm, setConfirm] = (0, react.useState)(null);
			const [saved, setSaved] = (0, react.useState)(false);
			/** 打开编辑器，并把已保存的策略灌进草稿。 */
			const beginEdit = (0, react.useCallback)((row) => {
				editingRef.current = row;
				setEditing(row);
				setEnabledState(row.policy.enabled);
				setGroups(new Set(row.policy.groups));
				setSkills(new Set(row.policy.skills));
				setConfirm(null);
				setSaved(false);
				shared.clearFail();
			}, [shared]);
			/** 离开编辑器（不保存草稿）。 */
			const cancelEdit = (0, react.useCallback)(() => {
				editingRef.current = null;
				setEditing(null);
				setConfirm(null);
			}, []);
			const groupIndex = (0, react.useMemo)(() => buildPolicyGroupIndex(groupsState, catalog), [groupsState, catalog]);
			/** 草稿策略展开后的可见性（编辑器预览的唯一数据源）。 */
			const preview = (0, react.useMemo)(() => {
				if (editing === null) return null;
				return expandScopePolicy({
					enabled,
					groups: [...groups],
					skills: [...skills]
				}, groupIndex);
			}, [
				editing,
				enabled,
				groups,
				skills,
				groupIndex
			]);
			/** 目录中的全部技能名（升序），供单技能勾选列表使用。 */
			const allNames = (0, react.useMemo)(() => [...groupIndex.known].sort((a, b) => a.localeCompare(b)), [groupIndex]);
			const toggleGroup = (0, react.useCallback)((key, checked) => {
				setSaved(false);
				setGroups((previous) => {
					const next = new Set(previous);
					if (checked) next.add(key);
					else next.delete(key);
					return next;
				});
			}, []);
			const toggleSkill = (0, react.useCallback)((name, checked) => {
				setSaved(false);
				setSkills((previous) => {
					const next = new Set(previous);
					if (checked) next.add(name);
					else next.delete(name);
					return next;
				});
			}, []);
			const setSelection = (0, react.useCallback)((kind, keys, checked) => {
				setSaved(false);
				const apply = (previous) => {
					const next = new Set(previous);
					for (const key of keys) if (checked) next.add(key);
					else next.delete(key);
					return next;
				};
				if (kind === "groups") setGroups(apply);
				else setSkills(apply);
			}, []);
			/** 启用开关：草稿态，保存才落地。 */
			const setEnabled = (0, react.useCallback)((next) => {
				setSaved(false);
				setEnabledState(next);
			}, []);
			/** 落盘草稿：保存 → 重载列表 → 标记"已保存"（留在编辑器里）。 */
			const save = (0, react.useCallback)(async (confirmEmpty = false) => {
				const row = editingRef.current;
				if (row === null) return;
				setConfirm(null);
				setBusy(true);
				await runFlow(shared, async () => {
					await adapterRef.current.save(row.id, {
						enabled,
						groups: [...groups],
						skills: [...skills],
						confirmEmpty
					});
					await adapterRef.current.reload();
					setSaved(true);
				}, () => {
					setBusy(false);
				});
			}, [
				enabled,
				groups,
				skills,
				shared
			]);
			/** 重置：删除策略，回到不限制。 */
			const resetNow = (0, react.useCallback)(async () => {
				const row = editingRef.current;
				if (row === null) return;
				setConfirm(null);
				setBusy(true);
				await runFlow(shared, async () => {
					await adapterRef.current.reset(row.id);
					await adapterRef.current.reload();
					setEnabledState(false);
					setGroups(/* @__PURE__ */ new Set());
					setSkills(/* @__PURE__ */ new Set());
					setSaved(false);
				}, () => {
					setBusy(false);
				});
			}, [shared]);
			return {
				editing,
				busy,
				enabled,
				groups,
				skills,
				confirm,
				saved,
				preview,
				allNames,
				beginEdit,
				cancelEdit,
				toggleGroup,
				toggleSkill,
				setSelection,
				setEnabled,
				setConfirm,
				requestSave: (0, react.useCallback)((confirmEmpty = false) => {
					if (enabled && groups.size === 0 && skills.size === 0 && !confirmEmpty) {
						setConfirm("empty");
						return;
					}
					save(confirmEmpty);
				}, [
					enabled,
					groups,
					skills,
					save
				]),
				requestReset: (0, react.useCallback)(() => {
					setConfirm("reset");
				}, []),
				resetNow
			};
		}
		//#endregion
		//#region src/client/panel/PolicyEditorView.tsx
		/**
		* PolicyEditorView — 「可见性策略编辑器」的共用视图（模式与工作区两处共用）。
		*
		* 输入是一份由 `usePolicyDraft` 管理的草稿加三个主题相关的显示值：
		* 主体名（模式名 / 工作区标题）、主体类别称呼（填进 `policy.*` 的 `{subject}`）、
		* 生效时机那一行。除此之外的一切——分组勾选、单技能勾选、保存/重置/确认框——
		* 都与主体无关，所以只写一遍。
		*
		* 刻意**不做**「实时预览」窗口：预览整块列出来会把页面撑得很长，而每个主体的
		* 可见/隐藏计数在列表行里已经如实给出。保存与「重置为不限制」贴在顶部开关左边，
		* 编辑到哪儿都不用再滚回底部。
		*
		* 这是**整页替换**的子视图（与 `TagEditorView` / `SkillDetailView` 同类）：
		* 根是 `.panel`，由 `SkillHubPanel` 在编辑态时提前返回，因此它不会嵌在主面板里。
		*
		* 卡片内的行一律写 `css.row + ' ' + css.rowStatic`，名字/描述用 `css.rowName` +
		* `css.rowDesc`，状态用 `css.badge`，主操作用 `css.button + css.primary`。
		* 注意 `css.rowStatic` 只是修饰类（仅声明 cursor），**必须**与 `css.row` 同时使用
		* ——单独用会让行失去 flex / padding / gap，元素会挤成一团。
		*/
		function PolicyEditorView(props) {
			const { draft, groupsState, catalog, subjectName, subjectKind, effect, notices } = props;
			const [filter, setFilter] = (0, react.useState)("");
			const options = (0, react.useMemo)(() => scopeGroupOptions(groupsState, catalog, draft.preview), [
				groupsState,
				catalog,
				draft.preview
			]);
			const kindLabel = {
				tag: tt("policy.kindTag"),
				col: tt("policy.kindCol"),
				src: tt("policy.kindSrc")
			};
			const needle = filter.trim().toLowerCase();
			const skillNames = draft.allNames.filter((name) => needle === "" || name.toLowerCase().includes(needle));
			const groupKeys = options.map((option) => option.key);
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: panel_module_css_default.panel,
				children: [
					notices,
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: panel_module_css_default.detailHead,
						children: [
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("button", {
								type: "button",
								className: panel_module_css_default.back,
								onClick: draft.cancelEdit,
								children: ["‹ ", tt("policy.back", { subject: subjectKind })]
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
								className: panel_module_css_default.groupTitle,
								children: subjectName
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
								className: panel_module_css_default.groupOps,
								children: [
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
										type: "button",
										className: panel_module_css_default.button + " " + panel_module_css_default.primary,
										disabled: draft.busy,
										onClick: () => {
											draft.requestSave();
										},
										children: draft.busy ? tt("policy.saving") : tt("policy.save")
									}),
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
										type: "button",
										className: panel_module_css_default.button,
										disabled: draft.busy,
										onClick: draft.requestReset,
										children: tt("policy.reset")
									}),
									draft.saved ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
										className: panel_module_css_default.badge,
										children: tt("policy.saved")
									}) : null,
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
										type: "button",
										role: "switch",
										"aria-checked": draft.enabled,
										"aria-label": tt("policy.enable", { subject: subjectKind }),
										className: panel_module_css_default.switch + (draft.enabled ? " " + panel_module_css_default.switchOn : ""),
										onClick: () => {
											draft.setEnabled(!draft.enabled);
										},
										children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { className: panel_module_css_default.switchThumb })
									})
								]
							})
						]
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("p", {
						className: panel_module_css_default.hintLine,
						children: [
							draft.enabled ? tt("policy.enabled") : tt("policy.disabled"),
							" · ",
							tt("policy.enableHint", { subject: subjectKind })
						]
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
						className: panel_module_css_default.hintLine,
						children: effect
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: panel_module_css_default.section,
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							className: panel_module_css_default.groupHead,
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
								className: panel_module_css_default.groupTitle,
								children: tt("policy.groupsTitle")
							}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
								className: panel_module_css_default.groupOps,
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
									type: "button",
									className: panel_module_css_default.opBtn,
									onClick: () => {
										draft.setSelection("groups", groupKeys, true);
									},
									children: tt("policy.selectAll")
								}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
									type: "button",
									className: panel_module_css_default.opBtn,
									onClick: () => {
										draft.setSelection("groups", groupKeys, false);
									},
									children: tt("policy.clearAll")
								})]
							})]
						}), options.length === 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
							className: panel_module_css_default.hintLine + " " + panel_module_css_default.hintPadded,
							children: tt("policy.groupsEmpty")
						}) : options.map((option) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", {
							className: panel_module_css_default.row + " " + panel_module_css_default.rowStatic,
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
								type: "checkbox",
								checked: draft.groups.has(option.key),
								onChange: (event) => {
									draft.toggleGroup(option.key, event.target.checked);
								}
							}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
								className: panel_module_css_default.rowMain,
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
									className: panel_module_css_default.rowName,
									children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
										className: panel_module_css_default.rowNameText,
										children: option.label
									})
								}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
									className: panel_module_css_default.rowDesc,
									children: [
										kindLabel[option.kind],
										" · ",
										tt("policy.memberCount", { count: option.count })
									]
								})]
							})]
						}, option.key))]
					}),
					draft.preview !== null && draft.preview.dangling.length > 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
						className: panel_module_css_default.hintLine,
						children: tt("policy.dangling", {
							count: draft.preview.dangling.length,
							keys: draft.preview.dangling.join(", ")
						})
					}) : null,
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
						className: panel_module_css_default.search,
						type: "search",
						value: filter,
						placeholder: tt("policy.searchPlaceholder"),
						onChange: (event) => {
							setFilter(event.target.value);
						}
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: panel_module_css_default.section,
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							className: panel_module_css_default.groupHead,
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
								className: panel_module_css_default.groupTitle,
								children: tt("policy.skillsTitle")
							}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
								className: panel_module_css_default.groupOps,
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
									type: "button",
									className: panel_module_css_default.opBtn,
									onClick: () => {
										draft.setSelection("skills", skillNames, true);
									},
									children: tt("policy.selectAll")
								}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
									type: "button",
									className: panel_module_css_default.opBtn,
									onClick: () => {
										draft.setSelection("skills", skillNames, false);
									},
									children: tt("policy.clearAll")
								})]
							})]
						}), skillNames.length === 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
							className: panel_module_css_default.hintLine + " " + panel_module_css_default.hintPadded,
							children: tt("policy.noSkillMatch")
						}) : skillNames.map((name) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", {
							className: panel_module_css_default.row + " " + panel_module_css_default.rowStatic,
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
								type: "checkbox",
								checked: draft.skills.has(name),
								onChange: (event) => {
									draft.toggleSkill(name, event.target.checked);
								}
							}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
								className: panel_module_css_default.rowMain,
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
									className: panel_module_css_default.rowName,
									children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
										className: panel_module_css_default.rowNameText,
										children: name
									})
								}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
									className: panel_module_css_default.rowDesc,
									children: skillDescription(catalog, name)
								})]
							})]
						}, name))]
					}),
					draft.confirm !== null ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						className: panel_module_css_default.dialogOverlay,
						role: "dialog",
						"aria-modal": "true",
						children: /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							className: panel_module_css_default.dialog,
							children: [
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
									className: panel_module_css_default.dialogTitle,
									children: draft.confirm === "empty" ? tt("policy.confirmEmptyTitle") : tt("policy.confirmResetTitle")
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
									className: panel_module_css_default.dialogText,
									children: draft.confirm === "empty" ? tt("policy.confirmEmpty", { name: subjectName }) : tt("policy.confirmReset", { name: subjectName })
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
									className: panel_module_css_default.dialogActions,
									children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
										type: "button",
										className: panel_module_css_default.button,
										onClick: () => {
											draft.setConfirm(null);
										},
										children: tt("policy.cancel")
									}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
										type: "button",
										className: panel_module_css_default.button + " " + panel_module_css_default.primary,
										onClick: () => {
											if (draft.confirm === "empty") draft.requestSave(true);
											else draft.resetNow();
										},
										children: tt("policy.confirm")
									})]
								})
							]
						})
					}) : null
				]
			});
		}
		/** 目录里某个技能的描述（编辑器单技能行用；缺失时回退为占位）。 */
		function skillDescription(catalog, name) {
			const skill = catalog?.skills.find((entry) => entry.name === name);
			return skill?.shortDescription ?? skill?.description ?? "—";
		}
		//#endregion
		//#region src/client/panel/ScopesView.tsx
		function ScopesView(props) {
			const { hub, notices } = props;
			const flow = hub.scopeFlow;
			if (flow.editingPreset === null) {
				const state = flow.scopeState;
				if (state === null) return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
					className: panel_module_css_default.empty,
					children: tt("scope.loading")
				});
				if (!state.available) return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
					className: panel_module_css_default.empty,
					children: tt("scope.unavailable", { reason: state.unavailableReason ?? "unknown" })
				}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
					className: panel_module_css_default.hintLine,
					children: tt("scope.unavailableHint")
				})] });
				if (state.presets.length === 0) return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
					className: panel_module_css_default.empty,
					children: tt("scope.empty")
				}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
					className: panel_module_css_default.hintLine,
					children: tt("scope.emptyHint")
				})] });
				return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [
					state.pendingCount > 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
						className: panel_module_css_default.hintLine,
						children: tt("scope.pendingNotice", { count: state.pendingCount })
					}) : null,
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						className: panel_module_css_default.section,
						children: state.presets.map((row) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)(ScopePresetRow, {
							row,
							busy: flow.scopeBusy,
							onEdit: () => {
								flow.beginScopeEdit(row);
							}
						}, row.id))
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
						className: panel_module_css_default.hintLine,
						children: tt("scope.listHint")
					})
				] });
			}
			const row = flow.editingPreset;
			return /* @__PURE__ */ (0, react_jsx_runtime.jsx)(PolicyEditorView, {
				draft: flow.draft,
				groupsState: hub.groupsState,
				catalog: hub.catalog,
				subjectName: row.name ?? row.id,
				subjectKind: tt("policy.subjectMode"),
				effect: row.mounted ? tt("scope.effectNow") : tt("scope.effectLater"),
				notices
			});
		}
		/** 列表里的一行：模式身份 + 接线状态 + 策略摘要 + 配置入口。 */
		function ScopePresetRow(props) {
			const { row, busy, onEdit } = props;
			const enabled = row.policy.enabled;
			const status = enabled ? row.gateActive ? tt("scope.gateActive") : tt("scope.gatePending") : tt("scope.gateOff");
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: panel_module_css_default.row + " " + panel_module_css_default.rowStatic,
				title: enabled && !row.gateActive ? tt("scope.gatePendingHint") : row.mounted ? tt("scope.mountedHint") : tt("scope.notMountedHint"),
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: panel_module_css_default.rowMain,
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							className: panel_module_css_default.rowName,
							children: [
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
									className: panel_module_css_default.rowNameText,
									children: row.name ?? row.id
								}),
								row.isDefault ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
									className: panel_module_css_default.badge,
									children: tt("scope.default")
								}) : null,
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
									className: panel_module_css_default.badge + " " + panel_module_css_default.badgeReadonly,
									children: row.trust === "system" ? tt("scope.trustSystem") : tt("scope.trustUser")
								})
							]
						}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							className: panel_module_css_default.rowDesc,
							children: [
								row.id,
								" · ",
								status,
								" · ",
								row.mounted ? tt("scope.mounted") : tt("scope.notMounted")
							]
						})]
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						className: panel_module_css_default.badges,
						children: enabled ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
							className: panel_module_css_default.badge,
							children: tt("policy.visibleCount", { visible: row.visibleCount })
						}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
							className: panel_module_css_default.badge,
							children: tt("policy.hiddenCount", { hidden: row.hiddenCount })
						})] }) : /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
							className: panel_module_css_default.badge + " " + panel_module_css_default.badgeReadonly,
							children: tt("policy.unrestricted")
						})
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
						type: "button",
						className: panel_module_css_default.opBtn,
						disabled: busy,
						onClick: onEdit,
						children: tt("scope.configure")
					})
				]
			});
		}
		//#endregion
		//#region src/client/panel/WorkspacesView.tsx
		function WorkspacesView(props) {
			const { hub, notices } = props;
			const flow = hub.workspaceFlow;
			if (flow.editingWorkspace === null) {
				const state = flow.workspaceState;
				if (state === null) return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
					className: panel_module_css_default.empty,
					children: tt("workspace.loading")
				});
				if (!state.available) return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
					className: panel_module_css_default.empty,
					children: tt("workspace.unavailable", { reason: state.unavailableReason ?? "unknown" })
				}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
					className: panel_module_css_default.hintLine,
					children: tt("workspace.unavailableHint")
				})] });
				if (state.workspaces.length === 0) return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
					className: panel_module_css_default.empty,
					children: tt("workspace.empty")
				}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
					className: panel_module_css_default.hintLine,
					children: tt("workspace.emptyHint")
				})] });
				return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [
					state.pendingCount > 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
						className: panel_module_css_default.hintLine,
						children: tt("workspace.pendingNotice", { count: state.pendingCount })
					}) : null,
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						className: panel_module_css_default.section,
						children: state.workspaces.map((row) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)(WorkspaceRow, {
							row,
							busy: flow.workspaceBusy,
							onEdit: () => {
								flow.beginWorkspaceEdit(row);
							}
						}, row.id))
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
						className: panel_module_css_default.hintLine,
						children: tt("workspace.listHint")
					})
				] });
			}
			const row = flow.editingWorkspace;
			return /* @__PURE__ */ (0, react_jsx_runtime.jsx)(PolicyEditorView, {
				draft: flow.draft,
				groupsState: hub.groupsState,
				catalog: hub.catalog,
				subjectName: row.title ?? row.path ?? row.id,
				subjectKind: tt("policy.subjectWorkspace"),
				effect: tt("workspace.effectHint"),
				notices
			});
		}
		/** 列表里的一行：工作区身份 + 会话数（或"已不在 DSH 里"）+ 策略摘要 + 配置入口。 */
		function WorkspaceRow(props) {
			const { row, busy, onEdit } = props;
			const enabled = row.policy.enabled;
			const label = row.title ?? row.path ?? row.id;
			const status = row.present ? row.sessionCount > 0 ? tt("workspace.sessionCount", { count: row.sessionCount }) : tt("workspace.noSession") : tt("workspace.orphan");
			const hint = !row.present ? tt("workspace.orphanHint") : enabled ? tt("workspace.effectHint") : void 0;
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: panel_module_css_default.row + " " + panel_module_css_default.rowStatic,
				title: hint,
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: panel_module_css_default.rowMain,
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							className: panel_module_css_default.rowName,
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
								className: panel_module_css_default.rowNameText,
								children: label
							}), row.present ? null : /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
								className: panel_module_css_default.badge + " " + panel_module_css_default.badgeReadonly,
								children: tt("workspace.orphan")
							})]
						}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							className: panel_module_css_default.rowDesc,
							children: [
								row.present ? row.path ?? row.id : row.id,
								" · ",
								status
							]
						})]
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						className: panel_module_css_default.badges,
						children: enabled ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
							className: panel_module_css_default.badge,
							children: tt("policy.visibleCount", { visible: row.visibleCount })
						}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
							className: panel_module_css_default.badge,
							children: tt("policy.hiddenCount", { hidden: row.hiddenCount })
						})] }) : /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
							className: panel_module_css_default.badge + " " + panel_module_css_default.badgeReadonly,
							children: tt("policy.unrestricted")
						})
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
						type: "button",
						className: panel_module_css_default.opBtn,
						disabled: busy,
						onClick: onEdit,
						children: tt("scope.configure")
					})
				]
			});
		}
		//#endregion
		//#region src/client/panel/PanelDialogs.tsx
		function PanelDialogs(props) {
			const { conflictDialog, tags, collections, setConflictDialog, resolveConflict, confirmDialog, setConfirmDialog, runConfirmed, deleteDialog, pendingDeletes, setDeleteDialog, confirmDeletes, branchChoice, branchBusy, setBranchChoice, confirmBranchChoice, versionDialog, versionBusy, setVersionDialog, confirmVersionDialog, marketSyncDialog, syncBusy, setMarketSyncDialog, confirmMarketSync, showForm, formName, formDesc, formContent, formRoot, formBusy, formMessage, setShowForm, setFormName, setFormDesc, setFormContent, setFormRoot, setFormMessage, create } = props;
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [
				conflictDialog !== null ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)(ConflictDialog, {
					dialog: conflictDialog,
					tags,
					collections,
					onClose: () => {
						setConflictDialog(null);
					},
					onKeepOn: () => {
						resolveConflict(false);
					},
					onCloseAll: () => {
						resolveConflict(true);
					}
				}) : null,
				confirmDialog !== null ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)(ConfirmDialog, {
					title: tt("source.syncConfirmTitle"),
					text: tt("source.syncConfirmText"),
					items: confirmDialog.skills,
					confirmLabel: tt("source.sync"),
					onCancel: () => {
						setConfirmDialog(null);
					},
					onConfirm: () => {
						runConfirmed();
					}
				}) : null,
				deleteDialog && pendingDeletes.length > 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)(ConfirmDialog, {
					title: tt("edit.deleteTitle", { count: pendingDeletes.length }),
					text: tt("edit.deleteText"),
					items: pendingDeletes,
					confirmLabel: tt("edit.deleteConfirm"),
					danger: true,
					onCancel: () => {
						setDeleteDialog(false);
					},
					onConfirm: confirmDeletes
				}) : null,
				branchChoice !== null ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)(BranchChoiceDialog, {
					choice: branchChoice,
					busy: branchBusy,
					onSelect: (selected) => {
						setBranchChoice({
							...branchChoice,
							selected
						});
					},
					onCancel: () => {
						setBranchChoice(null);
					},
					onConfirm: () => {
						confirmBranchChoice();
					}
				}) : null,
				versionDialog !== null ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)(VersionChoiceDialog, {
					choice: versionDialog,
					busy: versionBusy,
					onSelect: (selected) => {
						setVersionDialog((previous) => previous === null ? previous : {
							...previous,
							selected,
							custom: ""
						});
					},
					onCustom: (custom) => {
						setVersionDialog((previous) => previous === null ? previous : {
							...previous,
							custom
						});
					},
					onCancel: () => {
						setVersionDialog(null);
					},
					onConfirm: () => {
						confirmVersionDialog();
					}
				}) : null,
				marketSyncDialog !== null ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)(MarketSyncDialog, {
					dialog: marketSyncDialog,
					busy: syncBusy,
					onToggle: (name, checked) => {
						const next = new Set(marketSyncDialog.selected);
						if (checked) next.add(name);
						else next.delete(name);
						setMarketSyncDialog({
							...marketSyncDialog,
							selected: next
						});
					},
					onCancel: () => {
						setMarketSyncDialog(null);
					},
					onConfirm: () => {
						confirmMarketSync();
					}
				}) : null,
				showForm ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)(CreateSkillDialog, {
					name: formName,
					desc: formDesc,
					content: formContent,
					root: formRoot,
					busy: formBusy,
					message: formMessage,
					onName: setFormName,
					onDesc: setFormDesc,
					onContent: setFormContent,
					onRoot: setFormRoot,
					onCancel: () => {
						setShowForm(false);
						setFormMessage(null);
					},
					onSubmit: () => {
						create();
					}
				}) : null
			] });
		}
		//#endregion
		//#region src/client/panel/hooks/useMetaFlow.ts
		/**
		* useMetaFlow — 调用统计 + 配置：只依赖 api，不碰其他域。
		* 补捞 effect 自包含（uses.size + loadUses）。
		*/
		function useMetaFlow(api) {
			const [uses, setUses] = (0, react.useState)(/* @__PURE__ */ new Map());
			const [hubConfig, setHubConfig] = (0, react.useState)(null);
			const loadUses = (0, react.useCallback)(async () => {
				try {
					const result = await api.stats();
					if (result.available) setUses(new Map(result.stats.map((stat) => [stat.name, {
						count: stat.count,
						...stat.lastUsed !== void 0 ? { lastUsed: stat.lastUsed } : {}
					}])));
				} catch {}
			}, [api]);
			const loadConfig = (0, react.useCallback)(async () => {
				try {
					setHubConfig((await api.config()).config);
				} catch {}
			}, [api]);
			const usesCatchUp = (0, react.useRef)(0);
			(0, react.useEffect)(() => {
				if (uses.size > 0 || usesCatchUp.current >= 72) return;
				const timer = window.setInterval(() => {
					usesCatchUp.current += 1;
					loadUses();
					if (usesCatchUp.current >= 72) window.clearInterval(timer);
				}, POLL_MS);
				return () => {
					window.clearInterval(timer);
				};
			}, [uses.size, loadUses]);
			return {
				uses,
				loadUses,
				hubConfig,
				loadConfig
			};
		}
		//#endregion
		//#region src/client/panel/hooks/useCatalogFlow.ts
		/**
		* useCatalogFlow — 目录域：catalog 加载、详情、开关（单个/批量）、新建、
		* 诊断修复、编辑态暂存的删除，以及列表过滤/排序派生。跨域刷新只通过 shared
		* 通知，不直接碰其他域的 state。
		*
		* 关闭的技能**留在**目录里（CatalogSkill.enabled === false），因此既能被
		* 搜索到，也能在任何视图里一键重新打开：主行与关闭行共用同一份筛选结果。
		*
		* 删除是破坏性的：编辑态点「删除」只把名字放进 pendingDeletes（行立即从列表
		* 消失），点「完成」并确认后才调一次 /skill/delete 落盘。
		*/
		function useCatalogFlow(api, uses, shared, collapsePersonal, clearSourceFilter) {
			const [catalog, setCatalog] = (0, react.useState)(null);
			const [loading, setLoading] = (0, react.useState)(true);
			const [detail, setDetail] = (0, react.useState)(null);
			const [detailLoading, setDetailLoading] = (0, react.useState)(false);
			const [busyNames, setBusyNames] = (0, react.useState)(/* @__PURE__ */ new Set());
			const [search, setSearch] = (0, react.useState)("");
			const [showForm, setShowForm] = (0, react.useState)(false);
			const [formName, setFormName] = (0, react.useState)("");
			const [formDesc, setFormDesc] = (0, react.useState)("");
			const [formContent, setFormContent] = (0, react.useState)("");
			const [formRoot, setFormRoot] = (0, react.useState)("user-dsh");
			const [formBusy, setFormBusy] = (0, react.useState)(false);
			const [formMessage, setFormMessage] = (0, react.useState)(null);
			const [fixingPaths, setFixingPaths] = (0, react.useState)(/* @__PURE__ */ new Set());
			const [invocationFilter, setInvocationFilter] = (0, react.useState)("all");
			const [sortKey, setSortKey] = (0, react.useState)("name");
			/** 编辑态暂存的待删除名：只影响显示，确认后才落盘。 */
			const [pendingDeletes, setPendingDeletes] = (0, react.useState)([]);
			/** 「完成」时的删除确认框（暂存非空才打开）。 */
			const [deleteDialog, setDeleteDialog] = (0, react.useState)(false);
			const autoCollapsedPersonal = (0, react.useRef)(false);
			/**
			* 目录请求序号：轮询与写操作刷新都会发起 `load()`，慢的旧响应回来时若直接
			* setCatalog，就会把新数据覆盖回旧的。只接受最后一次发起的请求的响应。
			*/
			const loadSeq = (0, react.useRef)(0);
			/** 详情请求序号，同 loadSeq：快速连点不同技能时只认最后一次。 */
			const detailSeq = (0, react.useRef)(0);
			const load = (0, react.useCallback)(async () => {
				const seq = ++loadSeq.current;
				try {
					const next = await api.catalog();
					if (seq !== loadSeq.current) return;
					setCatalog(next);
					if (!autoCollapsedPersonal.current && next.skills.length > 80) {
						autoCollapsedPersonal.current = true;
						collapsePersonal();
					}
					shared.clearFail();
				} catch (error) {
					if (seq !== loadSeq.current) return;
					shared.fail(errorMessage(error));
				} finally {
					if (seq === loadSeq.current) setLoading(false);
				}
			}, [
				api,
				shared,
				collapsePersonal
			]);
			const openDetail = (0, react.useCallback)(async (name) => {
				const seq = ++detailSeq.current;
				setDetailLoading(true);
				await runFlow(shared, async () => {
					const next = await api.skill(name);
					if (seq !== detailSeq.current) return;
					setDetail(next);
				}, () => {
					if (seq === detailSeq.current) setDetailLoading(false);
				});
			}, [api, shared]);
			const toggle = (0, react.useCallback)(async (skill, enabled) => {
				setBusyNames((previous) => new Set(previous).add(skill.name));
				await runFlow(shared, async () => {
					const next = await api.toggle(skill.name, enabled);
					setCatalog(next);
				}, () => {
					setBusyNames((previous) => {
						const next = new Set(previous);
						next.delete(skill.name);
						return next;
					});
				});
			}, [api, shared]);
			/** Toggle an explicit name set in one write (enables disabled members too). */
			const batchToggleNames = (0, react.useCallback)(async (names, enabled) => {
				if (names.length === 0) return;
				shared.setBatchBusy(true);
				await runFlow(shared, async () => {
					const next = await api.toggleBatch(names, enabled);
					setCatalog(next.catalog);
					if (next.failures.length > 0) shared.fail("toggle-batch: " + next.failures.map((failure) => failure.name + ": " + failure.error).join("; "));
				}, () => shared.setBatchBusy(false));
			}, [api, shared]);
			const fixDiagnostic = (0, react.useCallback)(async (path) => {
				setFixingPaths((previous) => new Set(previous).add(path));
				await runFlow(shared, async () => {
					if (!window.confirm(tt("diag.fixConfirm", { path }))) return;
					await api.fixDiagnostic(path);
					await load();
					shared.succeed(tt("diag.fixed"));
				}, () => {
					setFixingPaths((previous) => {
						const next = new Set(previous);
						next.delete(path);
						return next;
					});
				});
			}, [
				api,
				load,
				shared
			]);
			/** 编辑态点「删除」：只把名字暂存起来，行立刻从各视图消失。 */
			const stageDelete = (0, react.useCallback)((name) => {
				setPendingDeletes((previous) => previous.includes(name) ? previous : [...previous, name]);
			}, []);
			/** 撤销一条暂存（待删除栏里的「撤销」）。 */
			const unstageDelete = (0, react.useCallback)((name) => {
				setPendingDeletes((previous) => previous.filter((entry) => entry !== name));
			}, []);
			/**
			* 落盘删除：一次性提交全部暂存名。返回「是否全部落盘」——请求本身失败、
			* 或其中任意一个名字失败都算 false，此时失败的名字仍留在暂存栏里，调用方
			* 据此决定是否退出编辑态（退出就等于把待办藏起来）。
			*/
			const confirmDeletes = (0, react.useCallback)(async () => {
				const names = [...pendingDeletes];
				setDeleteDialog(false);
				if (names.length === 0) return true;
				let allLanded = false;
				shared.setBatchBusy(true);
				await runFlow(shared, async () => {
					const next = await api.deleteSkills(names);
					setCatalog(next.catalog);
					setPendingDeletes(next.failures.map((failure) => failure.name));
					allLanded = next.failures.length === 0;
					if (next.failures.length > 0) shared.fail("delete: " + next.failures.map((failure) => failure.name + ": " + failure.error).join("; "));
					else shared.succeed(tt("row.deleted", { count: next.deleted.length }));
				}, () => shared.setBatchBusy(false));
				return allLanded;
			}, [
				api,
				pendingDeletes,
				shared
			]);
			const create = (0, react.useCallback)(async () => {
				setFormBusy(true);
				setFormMessage(null);
				shared.succeed(null);
				try {
					const result = await api.create({
						name: formName,
						description: formDesc,
						content: formContent,
						root: formRoot
					});
					shared.succeed(tt("form.success") + result.path);
					setFormName("");
					setFormDesc("");
					setFormContent("");
					setShowForm(false);
					await load();
				} catch (error) {
					setFormMessage({
						kind: "error",
						text: tt("form.error") + errorMessage(error)
					});
				} finally {
					setFormBusy(false);
				}
			}, [
				api,
				formName,
				formDesc,
				formContent,
				formRoot,
				load,
				shared
			]);
			const normalized = search.trim().toLocaleLowerCase();
			/** 暂存待删除的名字：确认落盘之前，它们先从各视图里消失（目录数据不动）。 */
			const stagedNames = (0, react.useMemo)(() => new Set(pendingDeletes), [pendingDeletes]);
			/** 组开关能作用的技能名 = 目录里的全部技能（关闭只写侧车状态，与来源可写性无关）。 */
			const actionNames = (0, react.useMemo)(() => new Set((catalog?.skills ?? []).filter((skill) => !stagedNames.has(skill.name)).map((skill) => skill.name)), [catalog, stagedNames]);
			/** 当前启用的全部技能名（含只读，用于派生开关状态）。 */
			const viewNames = (0, react.useMemo)(() => new Set((catalog?.skills ?? []).filter((skill) => skill.enabled && !stagedNames.has(skill.name)).map((skill) => skill.name)), [catalog, stagedNames]);
			/** 已运行时关闭的行（暂存待删的同样先移出）。 */
			const offSkills = (0, react.useMemo)(() => disabledSkills(catalog).filter((record) => !stagedNames.has(record.name)), [catalog, stagedNames]);
			/** 搜索 + 调用方式筛选后的全部技能（含已关闭的，视图各取所需）。 */
			const filtered = (0, react.useMemo)(() => (catalog?.skills ?? []).filter((skill) => {
				if (stagedNames.has(skill.name)) return false;
				if (invocationFilter === "model" && !skill.invocation.modelInvocable) return false;
				if (invocationFilter === "user" && !skill.invocation.userInvocable) return false;
				if (normalized.length === 0) return true;
				return skill.name.toLocaleLowerCase().includes(normalized) || skill.description.toLocaleLowerCase().includes(normalized) || skill.displayName?.toLocaleLowerCase().includes(normalized) || skill.shortDescription?.toLocaleLowerCase().includes(normalized);
			}), [
				catalog,
				normalized,
				invocationFilter,
				stagedNames
			]);
			/** 主行：筛选后的启用技能（所有视图共用；调用次数未知按 0 处理）。 */
			const sorted = (0, react.useMemo)(() => sortSkills(filtered.filter((skill) => skill.enabled), sortKey, (name) => uses.get(name)?.count), [
				filtered,
				sortKey,
				uses
			]);
			return {
				catalog,
				loading,
				detail,
				detailLoading,
				busyNames,
				search,
				showForm,
				formName,
				formDesc,
				formContent,
				formRoot,
				formBusy,
				formMessage,
				fixingPaths,
				invocationFilter,
				sortKey,
				normalized,
				actionNames,
				viewNames,
				offSkills,
				filtered,
				sorted,
				shortenedCount: (0, react.useMemo)(() => sorted.filter((skill) => skill.shortDescription !== void 0).length, [sorted]),
				pendingDeletes,
				deleteDialog,
				setDetail,
				setSearch,
				setShowForm,
				setFormName,
				setFormDesc,
				setFormContent,
				setFormRoot,
				setFormMessage,
				setInvocationFilter,
				setSortKey,
				setDeleteDialog,
				load,
				openDetail,
				toggle,
				batchToggleNames,
				fixDiagnostic,
				create,
				clearListFilters: (0, react.useCallback)(() => {
					setSearch("");
					clearSourceFilter();
					setInvocationFilter("all");
				}, [clearSourceFilter]),
				stageDelete,
				unstageDelete,
				confirmDeletes
			};
		}
		//#endregion
		//#region src/client/panel/hooks/useGroupFlow.ts
		/**
		* useGroupFlow — 分组域：groups 加载、tag 新建/删除/成员、
		* 组开关与冲突解决。目录侧只消费 batchToggleNames +
		* actionNames（聚合根传入），不碰目录 state。
		*/
		function useGroupFlow(api, shared, batchToggleNames, actionNames, enabledNames) {
			const [groupsState, setGroupsState] = (0, react.useState)(null);
			const [conflictDialog, setConflictDialog] = (0, react.useState)(null);
			const [editingTag, setEditingTag] = (0, react.useState)(null);
			const [editName, setEditName] = (0, react.useState)("");
			const [membersDraft, setMembersDraft] = (0, react.useState)(/* @__PURE__ */ new Set());
			const [newTagName, setNewTagName] = (0, react.useState)("");
			const [editSearch, setEditSearch] = (0, react.useState)("");
			/** 加载用户 tag 分组 + 系统集合组 + origin 映射。 */
			const loadGroups = (0, react.useCallback)(async () => {
				try {
					setGroupsState(await api.groups());
				} catch (error) {
					shared.fail(errorMessage(error));
				}
			}, [api, shared]);
			/** 把最新的 tag 列表合并进 groups 状态（tags 以外的字段保持原样）。 */
			const applyTags = (0, react.useCallback)((tags) => {
				setGroupsState((previous) => previous === null ? {
					ok: true,
					tags,
					collections: [],
					origins: {}
				} : {
					...previous,
					tags
				});
			}, []);
			/** 所有分组：key → 成员名（tag 与来源集合）。 */
			const groupMap = (0, react.useCallback)(() => {
				const map = /* @__PURE__ */ new Map();
				for (const tag of groupsState?.tags ?? []) map.set("tag:" + tag.id, tag.skillNames);
				for (const collection of groupsState?.collections ?? []) map.set("col:" + collection.name, collection.skillNames);
				return map;
			}, [groupsState]);
			return {
				groupsState,
				conflictDialog,
				editingTag,
				editName,
				membersDraft,
				newTagName,
				editSearch,
				setConflictDialog,
				setEditingTag,
				setEditName,
				setMembersDraft,
				setNewTagName,
				setEditSearch,
				loadGroups,
				applyTags,
				groupMap,
				toggleGroup: (0, react.useCallback)((key, name, view) => {
					const known = (groupMap().get(key) ?? []).filter((member) => actionNames.has(member));
					if (known.length === 0) return;
					if (view === "off") {
						batchToggleNames(known, true);
						return;
					}
					const conflicts = conflictsOnClose(known, enabledNames, [...groupMap().entries()].filter(([otherKey]) => otherKey !== key).map(([, memberNames]) => ({ members: memberNames })));
					if (conflicts.length > 0) setConflictDialog({
						key,
						name,
						conflicts
					});
					else batchToggleNames(known, false);
				}, [
					groupMap,
					actionNames,
					enabledNames,
					batchToggleNames
				]),
				resolveConflict: (0, react.useCallback)(async (closeAll) => {
					const dialog = conflictDialog;
					if (dialog === null) return;
					setConflictDialog(null);
					const members = groupMap().get(dialog.key) ?? [];
					if (closeAll) await batchToggleNames(members.filter((member) => actionNames.has(member)), false);
					else await batchToggleNames(members.filter((member) => actionNames.has(member) && !dialog.conflicts.includes(member)), false);
				}, [
					conflictDialog,
					groupMap,
					actionNames,
					batchToggleNames
				]),
				createTag: (0, react.useCallback)(async (event) => {
					event.preventDefault();
					const name = newTagName.trim();
					if (name === "") return;
					shared.setTagBusy(true);
					await runFlow(shared, async () => {
						applyTags(await api.saveTag({ name }));
						setNewTagName("");
					}, () => shared.setTagBusy(false));
				}, [
					api,
					applyTags,
					newTagName,
					shared
				]),
				deleteTag: (0, react.useCallback)(async (id) => {
					shared.setTagBusy(true);
					await runFlow(shared, async () => {
						applyTags(await api.deleteTag(id));
						setEditingTag(null);
					}, () => shared.setTagBusy(false));
				}, [
					api,
					applyTags,
					shared
				]),
				saveTag: (0, react.useCallback)(async (id, name, memberNames) => {
					shared.setTagBusy(true);
					await runFlow(shared, async () => {
						const safeName = name.trim();
						let tags = null;
						if (safeName !== "") tags = await api.saveTag({
							id,
							name: safeName
						});
						if (memberNames !== null) tags = await api.setTagMembers(id, memberNames);
						if (tags === null) return;
						applyTags(tags);
						setEditingTag(null);
					}, () => shared.setTagBusy(false));
				}, [
					api,
					applyTags,
					shared
				])
			};
		}
		//#endregion
		//#region src/client/panel/hooks/useSourceFlow.ts
		/**
		* useSourceFlow — 来源域：来源列表、上游更新检查、同步确认。目录与分组的
		* 刷新经聚合根传入的 reload 回调，不直接碰其他域的 state。
		*
		* 本插件不替用户删除任何技能文件：上游删除只在「检查」结果里报告出来，
		* 本地清理由用户自己在文件系统里完成。
		*/
		function useSourceFlow(api, shared, reloadCatalog, reloadGroups) {
			const [sourcesState, setSourcesState] = (0, react.useState)(null);
			const [sourceCheck, setSourceCheck] = (0, react.useState)({});
			const [checkingSource, setCheckingSource] = (0, react.useState)(null);
			const [syncingSource, setSyncingSource] = (0, react.useState)(null);
			const [confirmDialog, setConfirmDialog] = (0, react.useState)(null);
			/** 加载来源记录 + 派生 origin 映射。 */
			const loadSources = (0, react.useCallback)(async () => {
				try {
					setSourcesState(await api.sources());
				} catch (error) {
					shared.fail(errorMessage(error));
				}
			}, [api, shared]);
			return {
				sourcesState,
				sourceCheck,
				checkingSource,
				syncingSource,
				confirmDialog,
				setConfirmDialog,
				loadSources,
				checkSources: (0, react.useCallback)(async (repo) => {
					setCheckingSource(repo ?? "all");
					await runFlow(shared, async () => {
						const result = await api.checkSources(repo);
						setSourceCheck((previous) => {
							const next = { ...previous };
							for (const item of result.results) next[item.repo] = item;
							return next;
						});
					}, () => setCheckingSource(null));
				}, [api, shared]),
				requestSync: (0, react.useCallback)((repo, skills) => {
					setConfirmDialog({
						repo,
						skills
					});
				}, []),
				runConfirmed: (0, react.useCallback)(async () => {
					const dialog = confirmDialog;
					if (dialog === null) return;
					setConfirmDialog(null);
					setSyncingSource(dialog.repo);
					await runFlow(shared, async () => {
						const result = await api.syncSource(dialog.repo, dialog.skills);
						await Promise.all([
							reloadCatalog(),
							reloadGroups(),
							loadSources()
						]);
						if (result.failed.length > 0) shared.fail("sync: " + result.failed.map((failure) => failure.name + ": " + failure.error).join("; "));
					}, () => setSyncingSource(null));
				}, [
					confirmDialog,
					api,
					reloadCatalog,
					reloadGroups,
					loadSources,
					shared
				])
			};
		}
		//#endregion
		//#region src/client/panel/hooks/useRepoImportFlow.ts
		/**
		* useRepoImportFlow — 市场子域：仓库扫描/分支选择/导入任务（轮询+取消）。
		* 从 useMarketFlow 原样搬出：状态、动作、卸载中断与依赖顺序不变；市场源
		* 列表刷新（loadMarket）与目录/分组/来源重载经参数注入，不直接碰其他域。
		*/
		function useRepoImportFlow(api, shared, loadMarket, reloadCatalog, reloadGroups, reloadSources) {
			const [repoDiscoverState, setRepoDiscoverState] = (0, react.useState)({ status: "idle" });
			/** Market repo currently being scanned (null when idle); per-row busy state. */
			const [scanningRepo, setScanningRepo] = (0, react.useState)(null);
			const [repoSelected, setRepoSelected] = (0, react.useState)(/* @__PURE__ */ new Set());
			const [repoImporting, setRepoImporting] = (0, react.useState)(false);
			const [repoResult, setRepoResult] = (0, react.useState)(null);
			const [importJobId, setImportJobId] = (0, react.useState)(null);
			const [branchChoice, setBranchChoice] = (0, react.useState)(null);
			const [branchBusy, setBranchBusy] = (0, react.useState)(false);
			const pollAbortRef = (0, react.useRef)(null);
			/** 扫描一个市场源（或手动输入）的仓库。 */
			const scanRepo = (0, react.useCallback)(async (input) => {
				const value = input.trim();
				if (value === "") return;
				setRepoResult(null);
				setRepoSelected(/* @__PURE__ */ new Set());
				setScanningRepo(value);
				setRepoDiscoverState({ status: "scanning" });
				shared.clearFail();
				try {
					const data = await api.repoDiscover(value);
					if (data.ref === null) {
						setBranchChoice({
							repo: data.repo,
							branches: data.branches ?? [],
							selected: (data.branches ?? [])[0] ?? "main"
						});
						setRepoDiscoverState({ status: "idle" });
						return;
					}
					setRepoDiscoverState({
						status: "ready",
						data
					});
					loadMarket();
				} catch (error) {
					setRepoDiscoverState({
						status: "error",
						message: errorMessage(error)
					});
				} finally {
					setScanningRepo(null);
				}
			}, [
				api,
				loadMarket,
				shared
			]);
			/** 确认分支选择：持久化 ref 后重新扫描。 */
			const confirmBranchChoice = (0, react.useCallback)(async () => {
				if (branchChoice === null) return;
				setBranchBusy(true);
				await runFlow(shared, async () => {
					await api.setMarketSourceRef(branchChoice.repo, branchChoice.selected);
					setBranchChoice(null);
					await scanRepo(branchChoice.repo);
				}, () => setBranchBusy(false));
			}, [
				api,
				branchChoice,
				scanRepo,
				shared
			]);
			/** Toggle one repo preview row. */
			const toggleRepoSelected = (0, react.useCallback)((path, checked) => {
				setRepoSelected((previous) => {
					const next = new Set(previous);
					if (checked) next.add(path);
					else next.delete(path);
					return next;
				});
			}, []);
			/** Import every checked, non-existing repo skill (B方案：job+轮询+进度). */
			const importRepo = (0, react.useCallback)(async () => {
				if (repoDiscoverState.status !== "ready") return;
				setRepoImporting(true);
				setRepoResult(null);
				setImportJobId(null);
				shared.clearFail();
				let finalProgress = null;
				/** 轮询连续失败到上限；标记在 finally 里收尾成显式报错。 */
				let pollTimedOut = false;
				try {
					const created = await api.repoImport(repoDiscoverState.data.repo, [...repoSelected], repoDiscoverState.data.ref ?? void 0);
					setImportJobId(created.jobId);
					setRepoResult({
						ok: true,
						jobId: created.jobId,
						status: "running",
						total: created.total,
						done: 0,
						totalBytes: created.totalBytes,
						downloadedBytes: 0,
						imported: [],
						skipped: [],
						failed: []
					});
					pollAbortRef.current?.abort();
					pollAbortRef.current = new AbortController();
					const signal = pollAbortRef.current.signal;
					let attempt = 0;
					for (;;) {
						if (signal.aborted) break;
						const delay = Math.min(2e3, 800 + attempt * 200);
						await new Promise((r) => setTimeout(r, delay));
						if (signal.aborted) break;
						try {
							const progress = await api.repoImportProgress(created.jobId);
							setRepoResult(progress);
							finalProgress = progress;
							if (progress.status !== "running") break;
							attempt = 0;
						} catch (pollError) {
							if (isMissingRoute(pollError)) break;
							attempt += 1;
							if (attempt > 8) {
								pollTimedOut = true;
								break;
							}
						}
					}
					await Promise.all([
						reloadCatalog(),
						loadMarket(),
						reloadGroups(),
						reloadSources()
					]);
				} catch (error) {
					shared.fail(errorMessage(error));
				} finally {
					if (finalProgress !== null && (finalProgress.imported.length > 0 || finalProgress.skipped.length > 0)) {
						const doneNames = /* @__PURE__ */ new Set([...finalProgress.imported.map((r) => r.name), ...finalProgress.skipped.map((r) => r.name)]);
						const donePaths = new Set(repoDiscoverState.data.entries.filter((e) => doneNames.has(e.name)).map((e) => e.path));
						setRepoSelected((prev) => {
							const next = new Set(prev);
							for (const p of donePaths) next.delete(p);
							return next;
						});
						setRepoDiscoverState((prev) => {
							if (prev.status !== "ready") return prev;
							return {
								...prev,
								data: {
									...prev.data,
									entries: prev.data.entries.map((e) => doneNames.has(e.name) ? {
										...e,
										existing: true
									} : e)
								}
							};
						});
					}
					if (pollTimedOut) {
						shared.fail("导入仍在后台进行，但进度轮询已超时；稍后可在市场页刷新查看结果。");
						setRepoResult((prev) => prev === null ? prev : {
							...prev,
							status: "error"
						});
					}
					setRepoImporting(false);
				}
			}, [
				api,
				repoDiscoverState,
				repoSelected,
				reloadCatalog,
				loadMarket,
				reloadGroups,
				reloadSources,
				shared
			]);
			(0, react.useEffect)(() => {
				return () => {
					pollAbortRef.current?.abort();
				};
			}, []);
			return {
				repoDiscoverState,
				scanningRepo,
				repoSelected,
				repoImporting,
				repoResult,
				importJobId,
				branchChoice,
				branchBusy,
				setBranchChoice,
				setRepoSelected,
				setRepoDiscoverState,
				setScanningRepo,
				setRepoResult,
				scanRepo,
				confirmBranchChoice,
				toggleRepoSelected,
				importRepo,
				cancelImport: (0, react.useCallback)(async () => {
					if (importJobId === null) return;
					pollAbortRef.current?.abort();
					try {
						const res = await api.repoImportCancel(importJobId);
						try {
							const progress = await api.repoImportProgress(importJobId);
							setRepoResult(progress);
						} catch {
							setRepoResult((prev) => prev !== null ? {
								...prev,
								status: res.status
							} : prev);
						}
					} catch (error) {
						shared.fail(errorMessage(error));
					} finally {
						setRepoImporting(false);
					}
				}, [
					api,
					importJobId,
					shared
				]),
				clearScan: (0, react.useCallback)(() => {
					setRepoDiscoverState({ status: "idle" });
					setScanningRepo(null);
					setRepoResult(null);
					setRepoSelected(/* @__PURE__ */ new Set());
					setImportJobId(null);
					pollAbortRef.current?.abort();
				}, [])
			};
		}
		//#endregion
		//#region src/client/panel/hooks/useMarketFlow.ts
		/**
		* useMarketFlow — 市场域：市场源增删、更新检查、星标统计、版本同步、全部
		* 更新；仓库扫描/分支选择/导入任务在 useRepoImportFlow（这里组装它并透传
		* 同样的返回字段）。目录/分组/来源的刷新与来源检查经聚合根传入，不直接
		* 碰其他域的 state。
		*/
		function useMarketFlow(api, shared, reloadCatalog, reloadGroups, reloadSources, checkSources, sourceCheck) {
			const [marketState, setMarketState] = (0, react.useState)({
				status: "loading",
				repos: []
			});
			const [marketCheck, setMarketCheck] = (0, react.useState)({});
			const [marketSyncDialog, setMarketSyncDialog] = (0, react.useState)(null);
			const [syncingMarket, setSyncingMarket] = (0, react.useState)(null);
			const [syncBusy, setSyncBusy] = (0, react.useState)(false);
			const [newSourceName, setNewSourceName] = (0, react.useState)("");
			/** 市场源星星/下载数（SWR 缓存）。 */
			const [marketStats, setMarketStats] = (0, react.useState)({});
			/** 版本对话框：打开时拉 releases + branches，确认后定版并重扫。 */
			const [versionDialog, setVersionDialog] = (0, react.useState)(null);
			const [versionBusy, setVersionBusy] = (0, react.useState)(false);
			const [updateAllDialog, setUpdateAllDialog] = (0, react.useState)(false);
			/** 加载市场源列表。 */
			const loadMarket = (0, react.useCallback)(async () => {
				try {
					const next = await api.market();
					setMarketState({
						status: "ready",
						repos: next.repos
					});
				} catch (error) {
					setMarketState({
						status: "error",
						repos: []
					});
					shared.fail(errorMessage(error));
				}
			}, [api, shared]);
			const { repoDiscoverState, scanningRepo, repoSelected, repoImporting, repoResult, importJobId, branchChoice, branchBusy, setBranchChoice, setRepoSelected, setRepoDiscoverState, setScanningRepo, setRepoResult, scanRepo, confirmBranchChoice, toggleRepoSelected, importRepo, cancelImport, clearScan } = useRepoImportFlow(api, shared, loadMarket, reloadCatalog, reloadGroups, reloadSources);
			/** 添加一个市场源（内置市场目录与手动输入共用），并立即扫描它。 */
			const addSource = (0, react.useCallback)(async (input) => {
				const value = input.trim();
				if (value === "") return;
				shared.clearFail();
				try {
					const result = await api.addMarketSource(value);
					setMarketState({
						status: "ready",
						repos: result.repos
					});
					setNewSourceName("");
					setRepoResult(null);
					setRepoSelected(/* @__PURE__ */ new Set());
					const slug = result.repos[result.repos.length - 1].repo;
					setScanningRepo(slug);
					setRepoDiscoverState({ status: "scanning" });
					try {
						const data = await api.repoDiscover(slug);
						setRepoDiscoverState({
							status: "ready",
							data
						});
					} catch (error) {
						setRepoDiscoverState({
							status: "error",
							message: errorMessage(error)
						});
					} finally {
						setScanningRepo(null);
					}
				} catch (error) {
					shared.fail(errorMessage(error));
				}
			}, [api, shared]);
			/** 手动输入框的添加动作。 */
			const addMarketSource = (0, react.useCallback)(async () => {
				await addSource(newSourceName);
			}, [addSource, newSourceName]);
			/** 删除一个市场源（不影响已装技能）。 */
			const removeMarketSource = (0, react.useCallback)(async (repo) => {
				shared.setTagBusy(true);
				await runFlow(shared, async () => {
					const result = await api.removeMarketSource(repo);
					setMarketState({
						status: "ready",
						repos: result.repos
					});
				}, () => shared.setTagBusy(false));
			}, [api, shared]);
			const openVersionDialog = (0, react.useCallback)(async (repo) => {
				const current = marketState.repos.find((item) => item.repo === repo)?.ref;
				setVersionDialog({
					repo,
					...current !== void 0 ? { current } : {},
					releases: [],
					branches: [],
					selected: current ?? "",
					custom: "",
					loading: true
				});
				shared.clearFail();
				try {
					const data = await api.marketSourceVersions(repo);
					setVersionDialog({
						repo,
						...data.current !== void 0 ? { current: data.current } : {},
						releases: data.releases,
						branches: data.branches,
						selected: data.current ?? data.releases[0] ?? data.branches[0] ?? "",
						custom: "",
						loading: false
					});
				} catch (error) {
					shared.fail(errorMessage(error));
					setVersionDialog(null);
				}
			}, [
				api,
				marketState,
				shared
			]);
			const confirmVersionDialog = (0, react.useCallback)(async () => {
				if (versionDialog === null) return;
				const ref = versionDialog.custom.trim() !== "" ? versionDialog.custom.trim() : versionDialog.selected;
				if (ref === "") return;
				setVersionBusy(true);
				await runFlow(shared, async () => {
					await api.setMarketSourceRef(versionDialog.repo, ref);
					setVersionDialog(null);
					await loadMarket();
					await scanRepo(versionDialog.repo);
				}, () => setVersionBusy(false));
			}, [
				api,
				versionDialog,
				loadMarket,
				scanRepo,
				shared
			]);
			/**
			* 检查所有市场源的上游更新（服务端节流）。
			*
			* @param silent - 内部跟进调用（如批量更新收尾）传 true：此时失败不该覆盖
			*   主流程自己的结果提示；用户点「检查」时保持默认，失败必须显式报错，
			*   否则按钮看起来像没反应。
			*/
			const checkMarket = (0, react.useCallback)(async (silent = false) => {
				try {
					const result = await api.marketCheck();
					const next = {};
					for (const item of result.results) next[item.repo] = item;
					setMarketCheck(next);
				} catch (error) {
					if (!silent) shared.fail(errorMessage(error));
				}
			}, [api, shared]);
			return {
				marketState,
				marketCheck,
				branchChoice,
				branchBusy,
				marketSyncDialog,
				syncingMarket,
				syncBusy,
				newSourceName,
				repoDiscoverState,
				scanningRepo,
				repoSelected,
				repoImporting,
				repoResult,
				importJobId,
				marketStats,
				versionDialog,
				versionBusy,
				updateAllDialog,
				setBranchChoice,
				setMarketSyncDialog,
				setNewSourceName,
				setRepoSelected,
				setUpdateAllDialog,
				setVersionDialog,
				loadMarket,
				addSource,
				addMarketSource,
				removeMarketSource,
				scanRepo,
				confirmBranchChoice,
				openVersionDialog,
				confirmVersionDialog,
				toggleRepoSelected,
				importRepo,
				cancelImport,
				clearScan,
				checkMarket,
				loadMarketStats: (0, react.useCallback)(async () => {
					const merge = (results) => {
						const partial = {};
						for (const item of results) if (item.error === void 0) partial[item.repo] = {
							stars: item.stars,
							downloads: item.downloads
						};
						if (Object.keys(partial).length > 0) setMarketStats((previous) => ({
							...previous,
							...partial
						}));
					};
					try {
						merge((await api.marketStats()).results);
					} catch {}
					try {
						merge((await api.marketStats(true)).results);
					} catch {}
				}, [api]),
				syncMarketSource: (0, react.useCallback)(async (repo) => {
					setSyncingMarket(repo);
					await runFlow(shared, async () => {
						const result = await api.marketSync(repo);
						setMarketSyncDialog({
							repo: result.repo,
							ref: result.ref,
							skills: result.skills,
							selected: new Set(result.skills)
						});
						await loadMarket();
					}, () => setSyncingMarket(null));
				}, [
					api,
					loadMarket,
					shared
				]),
				confirmMarketSync: (0, react.useCallback)(async () => {
					if (marketSyncDialog === null) return;
					const selected = [...marketSyncDialog.selected];
					setSyncBusy(true);
					await runFlow(shared, async () => {
						if (selected.length > 0) {
							const result = await api.syncSource(marketSyncDialog.repo, selected);
							if (result.failed.length > 0) shared.fail(result.failed.map((item) => item.name + ": " + item.error).join("\n"));
						}
						setMarketSyncDialog(null);
						await Promise.all([
							reloadCatalog(),
							reloadGroups(),
							reloadSources()
						]);
						checkMarket();
					}, () => setSyncBusy(false));
				}, [
					api,
					marketSyncDialog,
					reloadCatalog,
					reloadGroups,
					reloadSources,
					checkMarket,
					shared
				]),
				updateAll: (0, react.useCallback)(async () => {
					setUpdateAllDialog(false);
					shared.setBatchBusy(true);
					shared.clearFail();
					const failures = [];
					let done = 0;
					try {
						for (const [repo, check] of Object.entries(sourceCheck)) {
							if (!check.changed || check.updated.length === 0) continue;
							try {
								const result = await api.syncSource(repo, check.updated);
								done += 1;
								if (result.failed.length > 0) failures.push(tt("market.updateAllItem", {
									repo,
									count: result.failed.length
								}) + ": " + result.failed.map((item) => item.name + ": " + item.error).join("; "));
							} catch (error) {
								failures.push(repo + ": " + errorMessage(error));
							}
						}
						await Promise.all([
							reloadCatalog(),
							reloadGroups(),
							reloadSources()
						]);
						await checkSources();
						checkMarket(true);
						if (failures.length > 0) shared.fail(failures.join("\n"));
						else if (done > 0) shared.succeed(tt("market.updateAllDone", { count: done }));
					} finally {
						shared.setBatchBusy(false);
					}
				}, [
					api,
					sourceCheck,
					checkSources,
					checkMarket,
					reloadCatalog,
					reloadGroups,
					reloadSources,
					shared
				])
			};
		}
		//#endregion
		//#region src/client/panel/hooks/useScopeFlow.ts
		/**
		* useScopeFlow — 模式域：preset 名单加载 + 某个模式的可见性策略编辑。
		*
		* 草稿状态机（勾选/预览/保存/重置/确认框）由 `usePolicyDraft` 提供，这里只补
		* 模式域独有的两件事：拉 `PresetsResponse`、把保存/重置打到 `/scope` 接口。
		*/
		function useScopeFlow(api, shared, groupsState, catalog) {
			const [scopeState, setScopeState] = (0, react.useState)(null);
			/** 加载模式名单与每个模式的策略/计数。 */
			const loadScopes = (0, react.useCallback)(async () => {
				try {
					setScopeState(await api.presets());
				} catch (error) {
					shared.fail(errorMessage(error));
				}
			}, [api, shared]);
			const draft = usePolicyDraft({
				save: async (presetId, body) => {
					await api.saveScope({
						presetId,
						enabled: body.enabled,
						groups: body.groups,
						skills: body.skills,
						...body.confirmEmpty ? { confirmEmpty: true } : {}
					});
				},
				reset: async (presetId) => {
					await api.saveScope({
						presetId,
						reset: true
					});
				},
				reload: loadScopes
			}, shared, groupsState, catalog);
			return {
				scopeState,
				scopeBusy: draft.busy,
				editingPreset: draft.editing,
				loadScopes,
				beginScopeEdit: draft.beginEdit,
				cancelScopeEdit: draft.cancelEdit,
				draft
			};
		}
		//#endregion
		//#region src/client/panel/hooks/useWorkspaceFlow.ts
		/**
		* useWorkspaceFlow — 工作区域：DSH 工作区名单加载 + 某个工作区的可见性策略编辑。
		*
		* 与 `useScopeFlow` 完全对称：草稿状态机共用 `usePolicyDraft`，这里只补工作区域
		* 独有的部分——拉 `WorkspacesResponse`、把保存/重置打到 `/workspace` 接口。
		*
		* 与模式的一处语义差异：工作区隔离**没有接线等待**。闸门按 preset 作用域注入，
		* 隐藏集合在每次技能查找时按会话的 cwd 现算，所以只要策略启用、下一次查找即生效。
		*/
		function useWorkspaceFlow(api, shared, groupsState, catalog) {
			const [workspaceState, setWorkspaceState] = (0, react.useState)(null);
			/** 加载工作区名单与每个工作区的策略/计数。 */
			const loadWorkspaces = (0, react.useCallback)(async () => {
				try {
					setWorkspaceState(await api.workspaces());
				} catch (error) {
					shared.fail(errorMessage(error));
				}
			}, [api, shared]);
			const draft = usePolicyDraft({
				save: async (workspaceId, body) => {
					await api.saveWorkspace({
						workspaceId,
						enabled: body.enabled,
						groups: body.groups,
						skills: body.skills,
						...body.confirmEmpty ? { confirmEmpty: true } : {}
					});
				},
				reset: async (workspaceId) => {
					await api.saveWorkspace({
						workspaceId,
						reset: true
					});
				},
				reload: loadWorkspaces
			}, shared, groupsState, catalog);
			return {
				workspaceState,
				workspaceBusy: draft.busy,
				editingWorkspace: draft.editing,
				loadWorkspaces,
				beginWorkspaceEdit: draft.beginEdit,
				cancelWorkspaceEdit: draft.cancelEdit,
				draft
			};
		}
		//#endregion
		//#region src/client/panel/useSkillHub.ts
		/**
		* useSkillHub — 面板的状态聚合根：只持有跨域共享的通知状态与纯视图状态，
		* 各域状态与动作分散在 ./hooks/*，这里按依赖顺序组装（meta → 目录 →
		* 分组 → 来源 → 市场），轮询与派生组装在此。All hooks run unconditionally
		* at the top, so the panel may early-return for the detail and tag-editor
		* views without violating the rules of hooks.
		*/
		function useSkillHub(api) {
			const [loadError, setLoadError] = (0, react.useState)(null);
			/** Green success banner (create finished); shown outside the closing form. */
			const [successBanner, setSuccessBanner] = (0, react.useState)(null);
			/**
			* 忙碌标志用计数器而非布尔：`setTagBusy` 被分组、市场、来源三个域共用（批量
			* 开关同理），两个操作重叠时先结束的那个会把布尔置回 false，让仍在跑的
			* 操作瞬间失去禁用态。
			*/
			const [batchBusyCount, setBatchBusyCount] = (0, react.useState)(0);
			const [tagBusyCount, setTagBusyCount] = (0, react.useState)(0);
			const bumpTagBusy = (0, react.useCallback)((busy) => {
				setTagBusyCount((count) => Math.max(0, count + (busy ? 1 : -1)));
			}, []);
			const bumpBatchBusy = (0, react.useCallback)((busy) => {
				setBatchBusyCount((count) => Math.max(0, count + (busy ? 1 : -1)));
			}, []);
			const shared = (0, react.useMemo)(() => ({
				fail: (message) => setLoadError(message),
				clearFail: () => setLoadError(null),
				succeed: (message) => setSuccessBanner(message),
				setTagBusy: bumpTagBusy,
				setBatchBusy: bumpBatchBusy
			}), [bumpTagBusy, bumpBatchBusy]);
			const batchBusy = batchBusyCount > 0;
			const tagBusy = tagBusyCount > 0;
			const [tab, setTab] = (0, react.useState)("sources");
			const [skillView, setSkillView] = (0, react.useState)("groups");
			const [sourceFilter, setSourceFilter] = (0, react.useState)("all");
			/** 分组视图里收起的分组（key 为 tag:<id> 或 col:<name>）。技能总数 >80 时首次加载自动折叠 personal。 */
			const [collapsedGroups, setCollapsedGroups] = (0, react.useState)(/* @__PURE__ */ new Set());
			const [showLegend, setShowLegend] = (0, react.useState)(false);
			const [editMode, setEditMode] = (0, react.useState)(false);
			const toggleGroupCollapse = (0, react.useCallback)((key) => {
				setCollapsedGroups((previous) => {
					const next = new Set(previous);
					if (next.has(key)) next.delete(key);
					else next.add(key);
					return next;
				});
			}, []);
			/** 整组折叠/展开：传 null 全部展开，传键列表全部折叠（视图侧自己算键）。 */
			const setAllGroupsCollapsed = (0, react.useCallback)((keys) => {
				setCollapsedGroups(keys === null ? /* @__PURE__ */ new Set() : new Set(keys));
			}, []);
			const collapsePersonal = (0, react.useCallback)(() => {
				setCollapsedGroups((previous) => new Set(previous).add("uncategorized-source"));
			}, []);
			const clearSourceFilter = (0, react.useCallback)(() => {
				setSourceFilter("all");
			}, []);
			const meta = useMetaFlow(api);
			const catalogFlow = useCatalogFlow(api, meta.uses, shared, collapsePersonal, clearSourceFilter);
			const groupFlow = useGroupFlow(api, shared, catalogFlow.batchToggleNames, catalogFlow.actionNames, catalogFlow.viewNames);
			const sourceFlow = useSourceFlow(api, shared, catalogFlow.load, groupFlow.loadGroups);
			const marketFlow = useMarketFlow(api, shared, catalogFlow.load, groupFlow.loadGroups, sourceFlow.loadSources, sourceFlow.checkSources, sourceFlow.sourceCheck);
			const scopeFlow = useScopeFlow(api, shared, groupFlow.groupsState, catalogFlow.catalog);
			const workspaceFlow = useWorkspaceFlow(api, shared, groupFlow.groupsState, catalogFlow.catalog);
			/** skillName → origin repo（无来源记录的技能不在此映射中，筛选中视为 private）。 */
			const origins = groupFlow.groupsState?.origins ?? {};
			/** 来源筛选选项：来源记录中的仓库（排序）+ 末尾的「个人」；没有技能的仓库不列。 */
			const sourceOptions = (0, react.useMemo)(() => {
				const skills = catalogFlow.catalog?.skills ?? [];
				const repos = [...new Set(skills.map((skill) => origins[skill.name]).filter((repo) => repo !== void 0))].sort();
				const hasPrivate = skills.some((skill) => origins[skill.name] === void 0);
				return [...repos, ...hasPrivate ? [PRIVATE_SOURCE] : []];
			}, [catalogFlow.catalog, origins]);
			(0, react.useEffect)(() => {
				catalogFlow.load();
				meta.loadUses();
				groupFlow.loadGroups();
				sourceFlow.loadSources();
				meta.loadConfig();
				scopeFlow.loadScopes();
				workspaceFlow.loadWorkspaces();
				const fast = window.setInterval(() => {
					catalogFlow.load();
				}, POLL_MS);
				const slow = window.setInterval(() => {
					meta.loadUses();
					groupFlow.loadGroups();
					sourceFlow.loadSources();
					meta.loadConfig();
					scopeFlow.loadScopes();
					workspaceFlow.loadWorkspaces();
				}, SLOW_POLL_MS);
				return () => {
					window.clearInterval(fast);
					window.clearInterval(slow);
				};
			}, [
				catalogFlow.load,
				meta.loadUses,
				groupFlow.loadGroups,
				sourceFlow.loadSources,
				meta.loadConfig,
				scopeFlow.loadScopes,
				workspaceFlow.loadWorkspaces
			]);
			(0, react.useEffect)(() => {
				if (!shouldAutoCheck()) return;
				markAutoChecked();
				sourceFlow.checkSources();
				marketFlow.checkMarket();
			}, []);
			return {
				catalog: catalogFlow.catalog,
				loading: catalogFlow.loading,
				loadError,
				successBanner,
				repoDiscoverState: marketFlow.repoDiscoverState,
				scanningRepo: marketFlow.scanningRepo,
				repoSelected: marketFlow.repoSelected,
				repoImporting: marketFlow.repoImporting,
				repoResult: marketFlow.repoResult,
				search: catalogFlow.search,
				detail: catalogFlow.detail,
				detailLoading: catalogFlow.detailLoading,
				busyNames: catalogFlow.busyNames,
				batchBusy,
				showForm: catalogFlow.showForm,
				formName: catalogFlow.formName,
				formDesc: catalogFlow.formDesc,
				formContent: catalogFlow.formContent,
				formRoot: catalogFlow.formRoot,
				formBusy: catalogFlow.formBusy,
				formMessage: catalogFlow.formMessage,
				uses: meta.uses,
				hubConfig: meta.hubConfig,
				tab,
				skillView,
				sourceFilter,
				invocationFilter: catalogFlow.invocationFilter,
				sortKey: catalogFlow.sortKey,
				marketState: marketFlow.marketState,
				marketCheck: marketFlow.marketCheck,
				marketStats: marketFlow.marketStats,
				branchChoice: marketFlow.branchChoice,
				branchBusy: marketFlow.branchBusy,
				marketSyncDialog: marketFlow.marketSyncDialog,
				syncingMarket: marketFlow.syncingMarket,
				syncBusy: marketFlow.syncBusy,
				newSourceName: marketFlow.newSourceName,
				groupsState: groupFlow.groupsState,
				sourcesState: sourceFlow.sourcesState,
				sourceCheck: sourceFlow.sourceCheck,
				checkingSource: sourceFlow.checkingSource,
				syncingSource: sourceFlow.syncingSource,
				conflictDialog: groupFlow.conflictDialog,
				confirmDialog: sourceFlow.confirmDialog,
				updateAllDialog: marketFlow.updateAllDialog,
				editingTag: groupFlow.editingTag,
				editName: groupFlow.editName,
				membersDraft: groupFlow.membersDraft,
				newTagName: groupFlow.newTagName,
				tagBusy,
				editSearch: groupFlow.editSearch,
				collapsedGroups,
				showLegend,
				editMode,
				versionDialog: marketFlow.versionDialog,
				versionBusy: marketFlow.versionBusy,
				pendingDeletes: catalogFlow.pendingDeletes,
				deleteDialog: catalogFlow.deleteDialog,
				actionNames: catalogFlow.actionNames,
				viewNames: catalogFlow.viewNames,
				offSkills: catalogFlow.offSkills,
				normalized: catalogFlow.normalized,
				origins,
				sourceOptions,
				filtered: catalogFlow.filtered,
				sorted: catalogFlow.sorted,
				shortenedCount: catalogFlow.shortenedCount,
				setLoadError,
				setSuccessBanner,
				setSearch: catalogFlow.setSearch,
				setDetail: catalogFlow.setDetail,
				setShowForm: catalogFlow.setShowForm,
				setFormName: catalogFlow.setFormName,
				setFormDesc: catalogFlow.setFormDesc,
				setFormContent: catalogFlow.setFormContent,
				setFormRoot: catalogFlow.setFormRoot,
				setFormMessage: catalogFlow.setFormMessage,
				setRepoSelected: marketFlow.setRepoSelected,
				setTab,
				setSkillView,
				setSourceFilter,
				setInvocationFilter: catalogFlow.setInvocationFilter,
				setSortKey: catalogFlow.setSortKey,
				setBranchChoice: marketFlow.setBranchChoice,
				setMarketSyncDialog: marketFlow.setMarketSyncDialog,
				setNewSourceName: marketFlow.setNewSourceName,
				setConflictDialog: groupFlow.setConflictDialog,
				setConfirmDialog: sourceFlow.setConfirmDialog,
				setDeleteDialog: catalogFlow.setDeleteDialog,
				setUpdateAllDialog: marketFlow.setUpdateAllDialog,
				setEditingTag: groupFlow.setEditingTag,
				setEditName: groupFlow.setEditName,
				setMembersDraft: groupFlow.setMembersDraft,
				setNewTagName: groupFlow.setNewTagName,
				setEditSearch: groupFlow.setEditSearch,
				setShowLegend,
				setEditMode,
				setVersionDialog: marketFlow.setVersionDialog,
				scopeFlow,
				workspaceFlow,
				toggleGroupCollapse,
				setAllGroupsCollapsed,
				loadMarket: marketFlow.loadMarket,
				openDetail: catalogFlow.openDetail,
				toggle: catalogFlow.toggle,
				toggleGroup: groupFlow.toggleGroup,
				resolveConflict: groupFlow.resolveConflict,
				runConfirmed: sourceFlow.runConfirmed,
				checkSources: sourceFlow.checkSources,
				requestSync: sourceFlow.requestSync,
				fixingPaths: catalogFlow.fixingPaths,
				fixDiagnostic: catalogFlow.fixDiagnostic,
				clearListFilters: catalogFlow.clearListFilters,
				openVersionDialog: marketFlow.openVersionDialog,
				confirmVersionDialog: marketFlow.confirmVersionDialog,
				createTag: groupFlow.createTag,
				deleteTag: groupFlow.deleteTag,
				saveTag: groupFlow.saveTag,
				addSource: marketFlow.addSource,
				addMarketSource: marketFlow.addMarketSource,
				removeMarketSource: marketFlow.removeMarketSource,
				scanRepo: marketFlow.scanRepo,
				confirmBranchChoice: marketFlow.confirmBranchChoice,
				toggleRepoSelected: marketFlow.toggleRepoSelected,
				importRepo: marketFlow.importRepo,
				cancelImport: marketFlow.cancelImport,
				clearScan: marketFlow.clearScan,
				checkMarket: marketFlow.checkMarket,
				loadMarketStats: marketFlow.loadMarketStats,
				syncMarketSource: marketFlow.syncMarketSource,
				confirmMarketSync: marketFlow.confirmMarketSync,
				updateAll: marketFlow.updateAll,
				create: catalogFlow.create,
				stageDelete: catalogFlow.stageDelete,
				unstageDelete: catalogFlow.unstageDelete,
				confirmDeletes: catalogFlow.confirmDeletes
			};
		}
		//#endregion
		//#region src/client/panel/SkillHubPanel.tsx
		/**
		* The skill hub panel: catalog grouped by tags + source collections, search
		* and filter in one row, per-group tri-state switches with conflict dialogs,
		* upstream source tracking (check / sync; upstream deletions are only
		* reported), market sources, switched-off skills with a one-click re-enable,
		* detail inspection, and the new-skill scaffold dialog — opened from the
		* header row, in the same action cluster as the edit toggle.
		*
		* Thin shell: state and flows live in useSkillHub, the tab contents live in
		* SourcesView / ScenesView / MarketView, the dialog family lives in
		* dialogs.tsx, and their wiring lives in PanelDialogs.tsx. This component
		* owns only the shared chrome (header, banners, filter bar, shared sections)
		* and the view routing. It keeps a single piece of local state (the
		* filter-panel toggle); every flow hook runs unconditionally at the top of
		* useSkillHub, so the detail / tag-editor / scope-editor / workspace-editor
		* early returns below stay inside the rules of hooks.
		*/
		function SkillHubPanel(props) {
			const hub = useSkillHub(props.api);
			/** 「筛选」面板开合（来源 + 调用方式收进这里；搜索/排序/视图切换始终可见）。 */
			const [filtersOpen, setFiltersOpen] = (0, react.useState)(false);
			const { catalog, loading, loadError, successBanner, detail, detailLoading, showForm, formName, formDesc, formContent, formRoot, formBusy, formMessage, hubConfig, tab, skillView, sourceFilter, sortKey, search, tagBusy, batchBusy, sourceOptions, filtered, conflictDialog, confirmDialog, branchChoice, branchBusy, marketSyncDialog, syncBusy, editingTag, editName, membersDraft, editSearch, uses, groupsState, sourceCheck, checkingSource, syncingSource, showLegend, editMode, pendingDeletes, deleteDialog, setLoadError, setSuccessBanner, setDetail, setShowForm, setFormName, setFormDesc, setFormContent, setFormRoot, setFormMessage, setTab, setSkillView, setSourceFilter, setSortKey, setSearch, setConflictDialog, setConfirmDialog, setBranchChoice, setMarketSyncDialog, setEditingTag, setEditName, setMembersDraft, setEditSearch, setShowLegend, setEditMode, setDeleteDialog, loadMarket, checkSources, requestSync, runConfirmed, resolveConflict, confirmBranchChoice, confirmMarketSync, create, saveTag, deleteTag, unstageDelete } = hub;
			const { shortenedCount, fixingPaths, clearListFilters } = hub;
			const notices = /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [loadError !== null ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: panel_module_css_default.errorBanner,
				role: "alert",
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: loadError }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
					type: "button",
					className: panel_module_css_default.button,
					"aria-label": tt("err.dismiss"),
					onClick: () => {
						setLoadError(null);
					},
					children: tt("err.dismiss")
				})]
			}) : null, successBanner !== null ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: panel_module_css_default.successBanner,
				role: "status",
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: successBanner }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
					type: "button",
					className: panel_module_css_default.button,
					"aria-label": tt("err.dismiss"),
					onClick: () => {
						setSuccessBanner(null);
					},
					children: tt("err.dismiss")
				})]
			}) : null] });
			if (detail !== null) {
				const disabledSkill = catalog?.skills.find((skill) => skill.name === detail.name && !skill.enabled);
				return /* @__PURE__ */ (0, react_jsx_runtime.jsx)(SkillDetailView, {
					detail,
					notices,
					hubConfig,
					uses,
					groupsState,
					sourcesState: hub.sourcesState,
					sourceCheck,
					checkingSource,
					syncingSource,
					onEnable: disabledSkill !== void 0 ? () => {
						hub.toggle(disabledSkill, true).then(() => {
							setDetail(null);
						});
					} : void 0,
					onBack: () => {
						setDetail(null);
					},
					onCheck: (repo) => {
						checkSources(repo);
					},
					onSync: requestSync
				});
			}
			if (editingTag !== null) return /* @__PURE__ */ (0, react_jsx_runtime.jsx)(TagEditorView, {
				tag: editingTag,
				notices,
				editName,
				membersDraft,
				editSearch,
				catalog,
				tagBusy,
				onBack: () => {
					setEditingTag(null);
				},
				onEditName: setEditName,
				onEditSearch: setEditSearch,
				onToggleMember: (name, checked) => {
					setMembersDraft((previous) => {
						const next = new Set(previous);
						if (checked) next.add(name);
						else next.delete(name);
						return next;
					});
				},
				onRename: () => {
					saveTag(editingTag.id, editName, null);
				},
				onDelete: () => {
					deleteTag(editingTag.id);
				},
				onSaveMembers: () => {
					saveTag(editingTag.id, editName, [...membersDraft]);
				}
			});
			if (hub.scopeFlow.editingPreset !== null) return /* @__PURE__ */ (0, react_jsx_runtime.jsx)(ScopesView, {
				hub,
				notices
			});
			if (hub.workspaceFlow.editingWorkspace !== null) return /* @__PURE__ */ (0, react_jsx_runtime.jsx)(WorkspacesView, {
				hub,
				notices
			});
			/** 生效中的筛选条件数（来源 + 调用方式），显示在「筛选」按钮上。 */
			const activeFilterCount = (sourceFilter !== "all" ? 1 : 0) + (hub.invocationFilter !== "all" ? 1 : 0);
			/** 目录里被运行时关闭的技能数（关闭行仍在列表里，计数只作提示）。 */
			const disabledCount = catalog?.skills.filter((skill) => !skill.enabled).length ?? 0;
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: panel_module_css_default.panel,
				"aria-busy": batchBusy || tagBusy,
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: panel_module_css_default.header,
						children: [
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("h2", {
								className: panel_module_css_default.title,
								children: [
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)(IconSkillOutline16, {
										size: 16,
										className: panel_module_css_default.titleIcon
									}),
									" ",
									tt("panel.title")
								]
							}),
							catalog !== null ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
								className: panel_module_css_default.headerCount,
								children: [tt("panel.count", { count: catalog.skills.length }), disabledCount > 0 ? " · " + tt("panel.disabledCount", { count: disabledCount }) : null]
							}) : null,
							catalog !== null && !catalog.complete ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
								className: panel_module_css_default.hint,
								children: tt("panel.incomplete")
							}) : null,
							catalog !== null && (catalog.duplicateNames?.length ?? 0) > 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("button", {
								type: "button",
								className: panel_module_css_default.opBtn,
								title: tt("row.duplicateHint"),
								onClick: () => {
									clearListFilters();
								},
								children: [
									"⚠ ",
									tt("row.duplicate"),
									"×",
									(catalog.duplicateNames ?? []).length
								]
							}) : null
						]
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: panel_module_css_default.subbar,
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
							className: panel_module_css_default.segmented,
							children: [
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
									type: "button",
									className: panel_module_css_default.segBtn + (tab === "sources" ? " " + panel_module_css_default.segBtnActive : ""),
									onClick: () => {
										setTab("sources");
									},
									children: tt("view.sources")
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
									type: "button",
									className: panel_module_css_default.segBtn + (tab === "scenes" ? " " + panel_module_css_default.segBtnActive : ""),
									onClick: () => {
										setTab("scenes");
									},
									children: tt("view.scenes")
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
									type: "button",
									className: panel_module_css_default.segBtn + (tab === "market" ? " " + panel_module_css_default.segBtnActive : ""),
									onClick: () => {
										setTab("market");
										loadMarket();
									},
									children: tt("view.market")
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
									type: "button",
									className: panel_module_css_default.segBtn + (tab === "scopes" ? " " + panel_module_css_default.segBtnActive : ""),
									onClick: () => {
										setTab("scopes");
										hub.scopeFlow.loadScopes();
									},
									children: tt("scope.tab")
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
									type: "button",
									className: panel_module_css_default.segBtn + (tab === "workspaces" ? " " + panel_module_css_default.segBtnActive : ""),
									onClick: () => {
										setTab("workspaces");
										hub.workspaceFlow.loadWorkspaces();
									},
									children: tt("workspace.tab")
								})
							]
						}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
							type: "button",
							className: panel_module_css_default.legendToggle + (showLegend ? " " + panel_module_css_default.legendToggleActive : ""),
							onClick: () => {
								setShowLegend((value) => !value);
							},
							title: tt("legend.hint"),
							children: "?"
						})]
					}),
					notices,
					editMode && pendingDeletes.length > 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: panel_module_css_default.pendingBar,
						role: "status",
						children: [
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
								className: panel_module_css_default.pendingLabel,
								children: tt("edit.pending", { count: pendingDeletes.length })
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
								className: panel_module_css_default.pendingNames,
								children: pendingDeletes.map((name) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
									className: panel_module_css_default.pendingItem,
									children: [name, /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
										type: "button",
										className: panel_module_css_default.opBtn,
										onClick: () => {
											unstageDelete(name);
										},
										children: tt("edit.undo")
									})]
								}, name))
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
								className: panel_module_css_default.pendingHint,
								children: tt("edit.pendingHint")
							})
						]
					}) : null,
					showLegend ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: panel_module_css_default.legend,
						children: [
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
								className: panel_module_css_default.legendItem,
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
									className: panel_module_css_default.dot + " " + panel_module_css_default.dotModel,
									style: dotStyle(hubConfig?.dotModelColor)
								}), tt("legend.model")]
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
								className: panel_module_css_default.legendItem,
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
									className: panel_module_css_default.dot + " " + panel_module_css_default.dotUser,
									style: dotStyle(hubConfig?.dotUserColor)
								}), tt("legend.user")]
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
								className: panel_module_css_default.legendHint,
								children: tt("legend.hint")
							})
						]
					}) : null,
					loading ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: panel_module_css_default.skeleton,
						role: "status",
						"aria-label": tt("panel.loading"),
						children: [
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", { className: panel_module_css_default.skeletonRow }),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", { className: panel_module_css_default.skeletonRow }),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", { className: panel_module_css_default.skeletonRow })
						]
					}) : null,
					detailLoading ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						className: panel_module_css_default.empty,
						children: tt("detail.loading")
					}) : null,
					tab === "market" ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)(MarketView, { hub }) : tab === "scopes" ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)(ScopesView, { hub }) : tab === "workspaces" ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)(WorkspacesView, { hub }) : catalog !== null ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [
						/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							className: panel_module_css_default.filterBar,
							children: [
								tab === "sources" ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
									className: panel_module_css_default.segmented,
									children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
										type: "button",
										className: panel_module_css_default.segBtn + (skillView === "flat" ? " " + panel_module_css_default.segBtnActive : ""),
										onClick: () => {
											setSkillView("flat");
										},
										children: tt("view.flat")
									}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
										type: "button",
										className: panel_module_css_default.segBtn + (skillView === "groups" ? " " + panel_module_css_default.segBtnActive : ""),
										onClick: () => {
											setSkillView("groups");
										},
										children: tt("view.grouped")
									})]
								}) : null,
								/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("select", {
									className: panel_module_css_default.select,
									value: sortKey,
									onChange: (event) => {
										setSortKey(event.target.value);
									},
									children: [
										/* @__PURE__ */ (0, react_jsx_runtime.jsx)("option", {
											value: "name",
											children: tt("sort.name")
										}),
										/* @__PURE__ */ (0, react_jsx_runtime.jsx)("option", {
											value: "added",
											children: tt("sort.added")
										}),
										/* @__PURE__ */ (0, react_jsx_runtime.jsx)("option", {
											value: "uses",
											children: tt("sort.uses")
										})
									]
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
									className: panel_module_css_default.search,
									value: search,
									onChange: (event) => {
										setSearch(event.target.value);
									},
									placeholder: tt("panel.search")
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("button", {
									type: "button",
									className: panel_module_css_default.button + (filtersOpen || activeFilterCount > 0 ? " " + panel_module_css_default.primary : ""),
									"aria-expanded": filtersOpen,
									"aria-controls": "skill-hub-filter-panel",
									onClick: () => {
										setFiltersOpen((value) => !value);
									},
									children: [tt("filter.title"), activeFilterCount > 0 ? " (" + activeFilterCount + ")" : ""]
								})
							]
						}),
						filtersOpen ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							className: panel_module_css_default.filterPanel,
							id: "skill-hub-filter-panel",
							children: [
								tab === "sources" ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", {
									className: panel_module_css_default.filterField,
									children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
										className: panel_module_css_default.formLabel,
										children: tt("filter.source")
									}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("select", {
										className: panel_module_css_default.select,
										value: sourceFilter,
										onChange: (event) => {
											setSourceFilter(event.target.value);
										},
										children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("option", {
											value: "all",
											children: tt("filter.allSources")
										}), sourceOptions.map((source) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)("option", {
											value: source,
											children: source === "private" ? tt("filter.private") : source
										}, source))]
									})]
								}) : null,
								/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", {
									className: panel_module_css_default.filterField,
									children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
										className: panel_module_css_default.formLabel,
										children: tt("filter.invocation")
									}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("select", {
										className: panel_module_css_default.select,
										value: hub.invocationFilter,
										onChange: (event) => {
											hub.setInvocationFilter(event.target.value);
										},
										children: [
											/* @__PURE__ */ (0, react_jsx_runtime.jsx)("option", {
												value: "all",
												children: tt("filter.invocationAll")
											}),
											/* @__PURE__ */ (0, react_jsx_runtime.jsx)("option", {
												value: "model",
												children: tt("filter.modelOnly")
											}),
											/* @__PURE__ */ (0, react_jsx_runtime.jsx)("option", {
												value: "user",
												children: tt("filter.userOnly")
											})
										]
									})]
								}),
								activeFilterCount > 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
									type: "button",
									className: panel_module_css_default.opBtn,
									onClick: () => {
										setSourceFilter("all");
										hub.setInvocationFilter("all");
									},
									children: tt("filter.clear")
								}) : null
							]
						}) : null,
						catalog !== null && (filtered.length !== catalog.skills.length || hub.invocationFilter !== "all" || sourceFilter !== "all") ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							className: panel_module_css_default.hintLine,
							style: {
								margin: "2px 2px 0",
								display: "flex",
								gap: 8,
								flexWrap: "wrap"
							},
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: tt("filter.showing", {
								shown: filtered.length,
								total: catalog.skills.length,
								filtered: hub.invocationFilter !== "all" || sourceFilter !== "all" ? tt("filter.filteredSuffix") : ""
							}) }), shortenedCount > 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
								title: tt("filter.shortened", { count: shortenedCount }),
								children: tt("filter.shortened", { count: shortenedCount })
							}) : null]
						}) : null,
						filtered.length === 0 && search.trim() !== "" ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
							className: panel_module_css_default.empty,
							children: tt("panel.empty")
						}) : null,
						filtered.length === 0 && search.trim() === "" && catalog.skills.length === 0 && catalog.diagnostics.length === 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
							className: panel_module_css_default.empty,
							children: tt("panel.emptyAll")
						}) : null,
						tab === "sources" ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)(SourcesView, { hub }) : /* @__PURE__ */ (0, react_jsx_runtime.jsx)(ScenesView, { hub }),
						catalog.diagnostics.length > 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("section", {
							className: panel_module_css_default.section,
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
								className: panel_module_css_default.sectionTitle,
								children: tt("panel.diagnostics")
							}), catalog.diagnostics.map((entry) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
								className: panel_module_css_default.diagRow,
								style: {
									display: "flex",
									alignItems: "flex-start",
									gap: 10
								},
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
									style: {
										flex: 1,
										minWidth: 0
									},
									children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
										className: panel_module_css_default.diagPath,
										children: entry.path
									}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
										className: panel_module_css_default.diagReason,
										children: entry.reason
									})]
								}), entry.fixable === true ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
									type: "button",
									className: panel_module_css_default.opBtn,
									disabled: fixingPaths.has(entry.path),
									onClick: () => {
										hub.fixDiagnostic(entry.path);
									},
									style: {
										flex: "none",
										alignSelf: "center"
									},
									children: fixingPaths.has(entry.path) ? tt("diag.fixing") : tt("diag.fix")
								}) : null]
							}, entry.path))]
						}) : null
					] }) : null,
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)(PanelDialogs, {
						conflictDialog,
						tags: groupsState?.tags ?? [],
						collections: groupsState?.collections ?? [],
						setConflictDialog,
						resolveConflict,
						confirmDialog,
						setConfirmDialog,
						runConfirmed,
						deleteDialog,
						pendingDeletes,
						setDeleteDialog,
						confirmDeletes: () => hub.confirmDeletes().then((allLanded) => {
							if (allLanded) setEditMode(false);
						}),
						branchChoice,
						branchBusy,
						setBranchChoice,
						confirmBranchChoice,
						versionDialog: hub.versionDialog,
						versionBusy: hub.versionBusy,
						setVersionDialog: hub.setVersionDialog,
						confirmVersionDialog: hub.confirmVersionDialog,
						marketSyncDialog,
						syncBusy,
						setMarketSyncDialog,
						confirmMarketSync,
						showForm,
						formName,
						formDesc,
						formContent,
						formRoot,
						formBusy,
						formMessage,
						setShowForm,
						setFormName,
						setFormDesc,
						setFormContent,
						setFormRoot,
						setFormMessage,
						create
					})
				]
			});
		}
		//#endregion
		//#region src/client/index.tsx
		/** Locale namespace this plugin owns. */
		const NS = "skill-hub";
		/**
		* Required services (fiber inject waiting — the runtime must be up first).
		* `connection`/`remote` are the settings transport's own prerequisites
		* (`ctx.configForms.get` resolves them on the caller's fiber), and
		* `configForms` is the shared settings-form service itself; mirror the
		* official settings-plugins inject list.
		*/
		const inject = [
			"slots",
			"locale",
			"connection",
			"remote",
			"configForms",
			"inputTriggers"
		];
		/**
		* Mount the settings card and the skill hub section.
		* @param ctx - client root context (slots, locale).
		*/
		function apply(ctx) {
			ctx.effect(() => ctx.locale.register(NS, {
				zh,
				en
			}), "skill-hub: dictionaries");
			const t = ctx.locale.bind(NS);
			const api = new SkillHubApi();
			const scope = ctx.configForms.get(HUB_ENTRY_ID);
			const settingsCard = new SkillHubSettingsCardController(scope);
			ctx.effect(() => setupSkillSlashDots(ctx, api, scope), "skill-hub: slash dots");
			ctx.effect(() => ctx.slots.inject("plugins.bundle.config", () => ctx.slots.register({
				name: "plugins.bundle.config",
				key: "dsh-skill-group",
				locale: NS,
				inject: () => settingsCard.inject()
			}, SkillHubSettingsCard)), "skill-hub: plugin config");
			ctx.effect(() => ctx.slots.inject("settings.section", () => ctx.slots.register({
				name: "settings.section",
				id: "skill-hub",
				order: 12,
				label: () => t("entry.label"),
				locale: NS,
				inject: () => ({})
			}, () => /* @__PURE__ */ (0, react_jsx_runtime.jsx)(SkillHubPanel, { api }))), "skill-hub: settings section");
			ctx.effect(() => applySettingsNavIcon(), "skill-hub: settings nav icon");
		}
		//#endregion
		exports.apply = apply;
		exports.inject = inject;
		return module.exports;
	}
});
