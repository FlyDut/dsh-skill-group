/**
 * useCatalogFlow — 目录域：catalog 加载、详情、开关（单个/批量）、新建、
 * 诊断修复，以及列表过滤/排序派生。跨域刷新只通过 shared 通知，不直接碰
 * 其他域的 state。
 *
 * 关闭的技能**留在**目录里（CatalogSkill.enabled === false），因此既能被
 * 搜索到，也能在任何视图里一键重新打开：主行与关闭行共用同一份筛选结果。
 */

import { useCallback, useMemo, useRef, useState } from 'react'
import type {
  CatalogResponse,
  CatalogSkill,
  SkillDetail,
  WritableRoot,
} from '../../../protocol.ts'
import type { SkillHubApi } from '../../api.ts'
import { errorMessage, tt } from '../../helpers.ts'
import { sortSkills, type SortKey } from '../../grouping.ts'
import { runFlow, type FlowNotices, type UsesMap } from './shared.ts'

export function useCatalogFlow(
  api: SkillHubApi,
  uses: UsesMap,
  shared: FlowNotices,
  /** 技能总数 >80 时折叠 personal 分组（聚合根实现，状态归它）。 */
  collapsePersonal: () => void,
  /** 清掉来源筛选（状态归聚合根，这里只在清空筛选项时调用）。 */
  clearSourceFilter: () => void,
) {
  const [catalog, setCatalog] = useState<CatalogResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [detail, setDetail] = useState<SkillDetail | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [busyNames, setBusyNames] = useState<ReadonlySet<string>>(new Set())
  const [search, setSearch] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [formName, setFormName] = useState('')
  const [formDesc, setFormDesc] = useState('')
  const [formContent, setFormContent] = useState('')
  const [formRoot, setFormRoot] = useState<WritableRoot>('user-dsh')
  const [formBusy, setFormBusy] = useState(false)
  const [formMessage, setFormMessage] = useState<{ kind: 'error' | 'success'; text: string } | null>(null)
  const [fixingPaths, setFixingPaths] = useState<ReadonlySet<string>>(new Set())
  const [invocationFilter, setInvocationFilter] = useState<'all' | 'model' | 'user'>('all')
  const [sortKey, setSortKey] = useState<SortKey>('name')

  const autoCollapsedPersonal = useRef(false)
  /**
   * 目录请求序号：轮询与写操作刷新都会发起 `load()`，慢的旧响应回来时若直接
   * setCatalog，就会把新数据覆盖回旧的。只接受最后一次发起的请求的响应。
   */
  const loadSeq = useRef(0)
  /** 详情请求序号，同 loadSeq：快速连点不同技能时只认最后一次。 */
  const detailSeq = useRef(0)

  const load = useCallback(async (): Promise<void> => {
    const seq = ++loadSeq.current
    try {
      const next = await api.catalog()
      if (seq !== loadSeq.current) return
      setCatalog(next)
      if (!autoCollapsedPersonal.current && next.skills.length > 80) {
        autoCollapsedPersonal.current = true
        collapsePersonal()
      }
      shared.clearFail()
    } catch (error) {
      if (seq !== loadSeq.current) return
      shared.fail(errorMessage(error))
    } finally {
      if (seq === loadSeq.current) setLoading(false)
    }
  }, [api, shared, collapsePersonal])

  const openDetail = useCallback(async (name: string): Promise<void> => {
    const seq = ++detailSeq.current
    setDetailLoading(true)
    await runFlow(shared, async () => {
      const next = await api.skill(name)
      if (seq !== detailSeq.current) return
      setDetail(next)
    }, () => {
      if (seq === detailSeq.current) setDetailLoading(false)
    })
  }, [api, shared])

  const toggle = useCallback(async (skill: CatalogSkill, enabled: boolean): Promise<void> => {
    setBusyNames((previous) => new Set(previous).add(skill.name))
    await runFlow(shared, async () => {
      const next = await api.toggle(skill.name, enabled)
      setCatalog(next)
    }, () => {
      setBusyNames((previous) => {
        const next = new Set(previous)
        next.delete(skill.name)
        return next
      })
    })
  }, [api, shared])

  /** Toggle an explicit name set in one write (enables disabled members too). */
  const batchToggleNames = useCallback(async (names: string[], enabled: boolean): Promise<void> => {
    if (names.length === 0) return
    shared.setBatchBusy(true)
    await runFlow(shared, async () => {
      const next = await api.toggleBatch(names, enabled)
      setCatalog(next.catalog)
      if (next.failures.length > 0) {
        shared.fail('toggle-batch: ' + next.failures.map((failure) => failure.name + ': ' + failure.error).join('; '))
      }
    }, () => shared.setBatchBusy(false))
  }, [api, shared])

  const fixDiagnostic = useCallback(async (path: string): Promise<void> => {
    setFixingPaths((previous) => new Set(previous).add(path))
    await runFlow(shared, async () => {
      const confirmed = window.confirm(tt('diag.fixConfirm', { path }))
      if (!confirmed) return
      await api.fixDiagnostic(path)
      await load()
      shared.succeed(tt('diag.fixed'))
    }, () => {
      setFixingPaths((previous) => {
        const next = new Set(previous)
        next.delete(path)
        return next
      })
    })
  }, [api, load, shared])

  const create = useCallback(async (): Promise<void> => {
    setFormBusy(true)
    setFormMessage(null)
    shared.succeed(null)
    try {
      const result = await api.create({ name: formName, description: formDesc, content: formContent, root: formRoot })
      // The dialog closes on success, so the confirmation lives in the green
      // banner outside it (a success message inside the closing dialog is
      // never visible).
      shared.succeed(tt('form.success') + result.path)
      setFormName('')
      setFormDesc('')
      setFormContent('')
      setShowForm(false)
      await load()
    } catch (error) {
      setFormMessage({ kind: 'error', text: tt('form.error') + errorMessage(error) })
    } finally {
      setFormBusy(false)
    }
  }, [api, formName, formDesc, formContent, formRoot, load, shared])

  // ------------------------------------------------------------- derived

  const normalized = search.trim().toLocaleLowerCase()

  /** 组开关能作用的技能名 = 目录里的全部技能（关闭只写侧车状态，与来源可写性无关）。 */
  const actionNames = useMemo(() => new Set((catalog?.skills ?? []).map((skill) => skill.name)), [catalog])

  /** 当前启用的全部技能名（含只读，用于派生开关状态）。 */
  const viewNames = useMemo(() => new Set((catalog?.skills ?? []).filter((skill) => skill.enabled).map((skill) => skill.name)), [catalog])

  /** 搜索 + 调用方式筛选后的全部技能（含已关闭的，视图各取所需）。 */
  const filtered = useMemo(() => (catalog?.skills ?? []).filter((skill) => {
    if (invocationFilter === 'model' && !skill.invocation.modelInvocable) return false
    if (invocationFilter === 'user' && !skill.invocation.userInvocable) return false
    if (normalized.length === 0) return true
    return skill.name.toLocaleLowerCase().includes(normalized)
      || skill.description.toLocaleLowerCase().includes(normalized)
      || skill.displayName?.toLocaleLowerCase().includes(normalized)
      || skill.shortDescription?.toLocaleLowerCase().includes(normalized)
  }), [catalog, normalized, invocationFilter])

  /** 主行：筛选后的启用技能（所有视图共用；调用次数未知按 0 处理）。 */
  const sorted = useMemo(() => sortSkills(filtered.filter((skill) => skill.enabled), sortKey, (name) => uses.get(name)?.count), [filtered, sortKey, uses])
  /** Rows actually rendered with a shortened description (shortDescription in use). */
  const shortenedCount = useMemo(() => sorted.filter((skill) => skill.shortDescription !== undefined).length, [sorted])

  /** Clear the list filters (search + source + invocation) back to the full view. */
  const clearListFilters = useCallback((): void => {
    setSearch('')
    clearSourceFilter()
    setInvocationFilter('all')
  }, [clearSourceFilter])

  return {
    catalog, loading, detail, detailLoading, busyNames, search,
    showForm, formName, formDesc, formContent, formRoot, formBusy, formMessage, fixingPaths,
    invocationFilter, sortKey, normalized, actionNames, viewNames,
    filtered, sorted, shortenedCount,
    setDetail, setSearch, setShowForm, setFormName, setFormDesc,
    setFormContent, setFormRoot, setFormMessage, setInvocationFilter, setSortKey,
    load, openDetail, toggle, batchToggleNames, fixDiagnostic, create, clearListFilters,
  }
}
