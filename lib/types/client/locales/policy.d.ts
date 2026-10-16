/**
 * 「可见性策略编辑器」的共用词条（模式与工作区两处共用同一个编辑器）。
 *
 * 这里只放与主体无关的文案；凡是提到主体种类的地方一律用 `{subject}` 占位，
 * 由调用方传入「模式」/「工作区」的称呼（见 `policy.subject`）。与具体主体绑定的
 * 文案（列表状态、生效时机等）留在各自的域里 —— `scope.*` 与 `workspace.*`。
 *
 * 编辑器不做「实时预览」窗口，所以这里没有 preview.* 词条。
 */
export declare const zhPolicy: {
    readonly 'policy.subjectMode': "模式";
    readonly 'policy.subjectWorkspace': "工作区";
    readonly 'policy.kindTag': "场景";
    readonly 'policy.kindCol': "来源集合";
    readonly 'policy.kindSrc': "来源根";
    readonly 'policy.memberCount': "{count} 个技能";
    readonly 'policy.noSkillMatch': "没有匹配的技能。";
    readonly 'policy.groupsTitle': "按分组勾选";
    readonly 'policy.skillsTitle': "单个技能";
    readonly 'policy.searchPlaceholder': "搜索技能…";
    readonly 'policy.selectAll': "全选";
    readonly 'policy.clearAll': "清空";
    readonly 'policy.groupsEmpty': "还没有任何分组。先在「场景」或「来源」里建一个分组，就能整体勾选。";
    readonly 'policy.dangling': "有 {count} 个分组已不存在：{keys}";
    readonly 'policy.back': "返回{subject}列表";
    readonly 'policy.enable': "在此{subject}启用技能隔离";
    readonly 'policy.enableHint': "开启后，只有下面勾选的技能对该{subject}的会话可见；模型目录与显式调用同时失效。";
    readonly 'policy.enabled': "隔离已启用";
    readonly 'policy.disabled': "隔离已关闭";
    readonly 'policy.visibleCount': "可见 {visible}";
    readonly 'policy.hiddenCount': "隐藏 {hidden}";
    readonly 'policy.unrestricted': "不限制";
    readonly 'policy.save': "保存";
    readonly 'policy.saving': "保存中…";
    readonly 'policy.saved': "已保存";
    readonly 'policy.reset': "重置为不限制";
    readonly 'policy.confirmEmptyTitle': "确认要隐藏全部技能？";
    readonly 'policy.confirmEmpty': "当前白名单为空，保存后「{name}」将看不到任何技能。确定继续吗？";
    readonly 'policy.confirmResetTitle': "确认重置？";
    readonly 'policy.confirmReset': "将删除「{name}」的可见性策略，它恢复为不限制（所有技能可见）。";
    readonly 'policy.confirm': "确定";
    readonly 'policy.cancel': "取消";
};
export declare const enPolicy: Record<keyof typeof zhPolicy, string>;
