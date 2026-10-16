/** 来源跟踪：上游检查、同步确认与状态文案。从 locales.ts 按前缀拆出。 */
export declare const zhSources: {
    readonly 'source.private': "个人技能（未绑定上游，不检查更新）";
    readonly 'source.commit': "已同步版本";
    readonly 'source.unverified': "尚未核对上游";
    readonly 'source.check': "检查更新";
    readonly 'source.checkHint': "点击检查上游更新";
    readonly 'source.checking': "检查中…";
    readonly 'source.upToDate': "已是最新";
    readonly 'source.updated': "有更新 {count} 个";
    readonly 'source.deleted': "上游已删除 {count} 个";
    readonly 'source.error': "检查失败";
    readonly 'source.throttled': "刚刚检查过";
    readonly 'source.sync': "同步";
    readonly 'source.syncing': "同步中…";
    readonly 'source.syncConfirmTitle': "同步技能？";
    readonly 'source.syncConfirmText': "将用上游最新版本覆盖本地对以下技能的所有修改：";
};
export declare const enSources: Record<keyof typeof zhSources, string>;
