/**
 * routes 共享层 · 目录装配：完整目录响应（时间戳/interface 元数据/重名诊断）
 * 与详情映射。目录只覆盖用户级根；技能是否处于「运行时关闭」由 sidecar 的
 * 关闭名单标记成 `enabled: false`，文件与发现层完全不动。
 */
import type { SkillDefinition } from '@deepseek-ai/dsh-skill';
import { type CatalogResponse, type SkillDetail } from '../protocol.ts';
import { type SkillInterface } from '../skillfs.ts';
import { type SkillHubRouteDeps } from './deps.ts';
/** 目录中存在的技能名集合（tag 成员校验用）：目录名 ∪ 关闭名单，避免成员因关闭而丢失。 */
export declare function knownSkillNames(deps: SkillHubRouteDeps): Promise<Set<string>>;
/**
 * Build the full catalog response (shared by catalog/toggle/create handlers).
 *
 * 管理视图只覆盖用户级根（~/.dsh/skills、~/.agents/skills）。关闭的技能仍在
 * 目录里，只是带上 `enabled: false`：文件没改名，发现层照常看到它，面板需要
 * 那一行来把开关打开。
 */
export declare function buildCatalog(deps: SkillHubRouteDeps): Promise<CatalogResponse>;
/** agents/openai.yaml 的 interface 元数据 → 目录行/详情行（catalog 与详情共用）。 */
export declare function applyInterface<T extends SkillInterface>(row: T, iface: SkillInterface): void;
/** Map a loaded definition onto the wire shape. `enabled` mirrors the sidecar switch. */
export declare function toDetail(skill: SkillDefinition, enabled?: boolean): SkillDetail;
