/**
 * routes 共享层 · 集合装配：origin 映射 + 集合顺序 → 来源集合组，再补上插件
 * provider 提供的技能集合，以及 groups 路由的数据源。来源映射的排序语义从
 * helpers.ts 原样搬出，行为不变。
 */
import type { CollectionGroup, GroupsResponse } from '../protocol.ts';
import { type SkillHubRouteDeps } from './deps.ts';
/** 目录里与分组相关的字段（SkillSummary 的最小投影）。 */
export interface GroupableSkill {
    name: string;
    provider: string;
    source: string;
}
/** 装配结果：集合组 + skillName → 组名 的并集映射。 */
export interface BuiltCollections {
    collections: CollectionGroup[];
    /** 市场 origin 优先；没有来源记录、又来自插件 provider 的技能归入 provider 组。 */
    memberships: Record<string, string>;
}
/**
 * 全部集合组：来源集合组在前（沿用 sidecar 的历史顺序），插件组按名字排在
 * 后面；同名的插件组让位给来源组，避免两个组共用同一个 'col:xxx' 键。
 */
export declare function buildCollections(origins: Readonly<Record<string, string>>, collectionOrder: readonly string[], skills?: readonly GroupableSkill[]): BuiltCollections;
/** 系统集合组 + 用户 tag + 成员映射（groups 路由的数据源）。 */
export declare function buildGroups(deps: SkillHubRouteDeps): Promise<GroupsResponse>;
