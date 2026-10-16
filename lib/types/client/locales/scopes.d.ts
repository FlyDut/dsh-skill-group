/**
 * 「模式」视图（模式级技能隔离）的中英词条：只放**列表态**与模式专属的生效时机，
 * 编辑器词条与工作区共用 `policy.ts`。键的完备性由
 * `en: Record<HubKey, string>` 在类型层兜底。
 */
export declare const zhScopes: {
    readonly 'scope.tab': "模式";
    readonly 'scope.loading': "正在读取模式…";
    readonly 'scope.unavailable': "本部署不支持模式隔离：{reason}";
    readonly 'scope.unavailableHint': "需要 agent-presets 与 dsh-scope 两个运行时包；缺少它们时其余功能不受影响。";
    readonly 'scope.empty': "本部署没有可用的 agent preset。";
    readonly 'scope.emptyHint': "preset 来自 ~/.dsh/.agent-presets/<id>/ 与部署自带的预设集。";
    readonly 'scope.configure': "配置";
    readonly 'scope.pendingNotice': "有 {count} 个模式已启用隔离但还没接上闸门：它们要等一个使用该模式的会话出现（约 5 秒内自动完成）。在此之前它们不隔离。";
    readonly 'scope.default': "默认";
    readonly 'scope.trustSystem': "部署自带";
    readonly 'scope.trustUser': "自定义";
    readonly 'scope.mounted': "已挂载";
    readonly 'scope.notMounted': "未挂载";
    readonly 'scope.gateActive': "隔离生效中";
    readonly 'scope.gatePending': "等待会话激活";
    readonly 'scope.gateOff': "未启用";
    readonly 'scope.mountedHint': "该模式已有会话使用过，隔离可以立即接线。";
    readonly 'scope.notMountedHint': "该模式还没有会话使用过，接线要等它被挂载后自动完成；在此之前它不隔离。";
    readonly 'scope.gatePendingHint': "策略已启用，闸门将在下一次接线轮询（约 5 秒）内接上。";
    readonly 'scope.listHint': "「配置」进入该模式的可见性编辑器；每个模式各自独立，未配置的模式不限制。工作区启用隔离时会覆盖模式（工作区优先）。";
    readonly 'scope.effectNow': "保存后，该模式会话的下一个回合即生效，无需重启。";
    readonly 'scope.effectLater': "该模式还没有会话使用过，首次使用它的会话会自动接上。";
};
export declare const enScopes: Record<keyof typeof zhScopes, string>;
