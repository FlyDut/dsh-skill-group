/**
 * 「工作区」视图（工作区级技能隔离）的中英词条。与 `scopes.ts` 完全对称：
 * 列表态词条在这里，编辑器词条共用 `policy.ts`。键的完备性由
 * `en: Record<HubKey, string>` 在类型层兜底。
 */
export const zhWorkspaces = {
  'workspace.tab': '工作区',
  'workspace.loading': '正在读取工作区…',
  'workspace.unavailable': '本部署不支持工作区隔离：{reason}',
  'workspace.unavailableHint': '需要宿主提供 workspaceRegistry（DSH 的工作区列表）与 dsh-scope 运行时包；缺少它们时其余功能不受影响。',
  'workspace.empty': 'DSH 里还没有工作区记录。',
  'workspace.emptyHint': '工作区就是 DSH 侧边栏里的那些条目；会话按自己的工作目录精确匹配到某一个。',
  'workspace.listHint': '「配置」进入该工作区的可见性编辑器。工作区启用隔离后会覆盖模式：该目录下的会话只看这里的白名单；没启用则仍按模式策略',
  'workspace.sessionCount': '{count} 个会话',
  'workspace.noSession': '还没有会话',
  'workspace.pendingNotice': '有 {count} 个工作区已启用隔离但还没接上闸门：它们要等该工作区出现一次技能查找（约 5 秒内自动完成）。在此之前它们不隔离。',
  'workspace.orphan': '已不在 DSH 里',
  'workspace.orphanHint': '该工作区已从 DSH 的工作区列表移除，但它的策略还留着。进「配置」→「重置为不限制」可以清掉；这里不会自动清理。',
  'workspace.effectHint': '保存后，该工作区目录下的会话在下一次技能查找即按新策略生效；启用隔离时会覆盖模式策略（工作区优先），关掉则回落模式。',
  'workspace.badgeTitle': '{count} 个工作区以本组为白名单：{names}',
} as const

export const enWorkspaces: Record<keyof typeof zhWorkspaces, string> = {
  'workspace.tab': 'Workspaces',
  'workspace.loading': 'Reading workspaces…',
  'workspace.unavailable': 'Workspace isolation is unavailable in this deployment: {reason}',
  'workspace.unavailableHint': 'It needs the host to expose workspaceRegistry (the DSH workspace list) plus the dsh-scope runtime package; everything else keeps working without them.',
  'workspace.empty': 'DSH has no workspace yet.',
  'workspace.emptyHint': 'Workspaces are the entries in the DSH sidebar; a session matches one of them by its exact working directory.',
  'workspace.listHint': '"Configure" opens that workspace\'s visibility editor. Once a workspace enables isolation it overrides the mode: sessions in that directory see only this whitelist; otherwise the mode policy applies.',
  'workspace.sessionCount': '{count} session(s)',
  'workspace.noSession': 'no session yet',
  'workspace.pendingNotice': '{count} workspace(s) have isolation enabled but no gate yet: they wait for a skill lookup in that workspace (wired automatically within about five seconds). Until then they do not isolate.',
  'workspace.orphan': 'gone from DSH',
  'workspace.orphanHint': 'This workspace was removed from the DSH workspace list but its policy is still stored. Open "Configure" and reset it to unrestricted to clear it; nothing is cleaned up automatically.',
  'workspace.effectHint': 'Takes effect on the next skill lookup of a session in that workspace directory. While isolation is on it overrides the mode policy; turning it off falls back to the mode.',
  'workspace.badgeTitle': '{count} workspace(s) whitelist this group: {names}',
}
