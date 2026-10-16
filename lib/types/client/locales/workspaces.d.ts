/**
 * 「工作区」视图（工作区级技能隔离）的中英词条。与 `scopes.ts` 完全对称：
 * 列表态词条在这里，编辑器词条共用 `policy.ts`。键的完备性由
 * `en: Record<HubKey, string>` 在类型层兜底。
 */
export declare const zhWorkspaces: {
    readonly 'workspace.tab': "工作区";
    readonly 'workspace.loading': "正在读取工作区…";
    readonly 'workspace.unavailable': "本部署不支持工作区隔离：{reason}";
    readonly 'workspace.unavailableHint': "需要宿主提供 workspaceRegistry（DSH 的工作区列表）与 dsh-scope 运行时包；缺少它们时其余功能不受影响。";
    readonly 'workspace.empty': "DSH 里还没有工作区记录。";
    readonly 'workspace.emptyHint': "工作区就是 DSH 侧边栏里的那些条目；会话按自己的工作目录精确匹配到某一个。";
    readonly 'workspace.listHint': "「配置」进入该工作区的可见性编辑器。工作区启用隔离后会覆盖模式：该目录下的会话只看这里的白名单；没启用则仍按模式策略";
    readonly 'workspace.sessionCount': "{count} 个会话";
    readonly 'workspace.noSession': "还没有会话";
    readonly 'workspace.pendingNotice': "有 {count} 个工作区已启用隔离但还没接上闸门：它们要等该工作区出现一次技能查找（约 5 秒内自动完成）。在此之前它们不隔离。";
    readonly 'workspace.orphan': "已不在 DSH 里";
    readonly 'workspace.orphanHint': "该工作区已从 DSH 的工作区列表移除，但它的策略还留着。进「配置」→「重置为不限制」可以清掉；这里不会自动清理。";
    readonly 'workspace.effectHint': "保存后，该工作区目录下的会话在下一次技能查找即按新策略生效；启用隔离时会覆盖模式策略（工作区优先），关掉则回落模式。";
};
export declare const enWorkspaces: Record<keyof typeof zhWorkspaces, string>;
