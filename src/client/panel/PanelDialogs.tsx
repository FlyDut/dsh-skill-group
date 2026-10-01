/**
 * PanelDialogs — SkillHubPanel 底部的对话框接线层（冲突、同步确认、
 * 分支选择、版本选择、市场同步、新建技能）。状态与动作仍由 useSkillHub
 * 的 hub 持有；这里只收窄成显式 props，渲染顺序与拆分前完全一致。
 */

import type { JSX } from 'react'
import type { CollectionGroup, SkillTag } from '../../protocol.ts'
import { tt } from '../helpers.ts'
import { BranchChoiceDialog, ConfirmDialog, ConflictDialog, CreateSkillDialog, MarketSyncDialog, VersionChoiceDialog } from './dialogs.tsx'
import type { SkillHubState } from './useSkillHub.ts'

interface PanelDialogsProps {
  /** 分组开关冲突（groupsState 未加载时传空数组）。 */
  conflictDialog: SkillHubState['conflictDialog']
  tags: readonly SkillTag[]
  collections: readonly CollectionGroup[]
  setConflictDialog: SkillHubState['setConflictDialog']
  resolveConflict: SkillHubState['resolveConflict']
  /** 来源同步确认。 */
  confirmDialog: SkillHubState['confirmDialog']
  setConfirmDialog: SkillHubState['setConfirmDialog']
  runConfirmed: SkillHubState['runConfirmed']
  /** 编辑态暂存删除的落盘确认（点「完成」且有暂存时弹）。 */
  deleteDialog: SkillHubState['deleteDialog']
  pendingDeletes: SkillHubState['pendingDeletes']
  setDeleteDialog: SkillHubState['setDeleteDialog']
  confirmDeletes: () => void
  /** 无 release 的市场源分支选择。 */
  branchChoice: SkillHubState['branchChoice']
  branchBusy: SkillHubState['branchBusy']
  setBranchChoice: SkillHubState['setBranchChoice']
  confirmBranchChoice: SkillHubState['confirmBranchChoice']
  /** 市场源版本选择。 */
  versionDialog: SkillHubState['versionDialog']
  versionBusy: SkillHubState['versionBusy']
  setVersionDialog: SkillHubState['setVersionDialog']
  confirmVersionDialog: SkillHubState['confirmVersionDialog']
  /** 市场源同步后的技能勾选。 */
  marketSyncDialog: SkillHubState['marketSyncDialog']
  syncBusy: SkillHubState['syncBusy']
  setMarketSyncDialog: SkillHubState['setMarketSyncDialog']
  confirmMarketSync: SkillHubState['confirmMarketSync']
  /** 新建技能弹窗（字段草稿 + 提交动作）。 */
  showForm: SkillHubState['showForm']
  formName: SkillHubState['formName']
  formDesc: SkillHubState['formDesc']
  formContent: SkillHubState['formContent']
  formRoot: SkillHubState['formRoot']
  formBusy: SkillHubState['formBusy']
  formMessage: SkillHubState['formMessage']
  setShowForm: SkillHubState['setShowForm']
  setFormName: SkillHubState['setFormName']
  setFormDesc: SkillHubState['setFormDesc']
  setFormContent: SkillHubState['setFormContent']
  setFormRoot: SkillHubState['setFormRoot']
  setFormMessage: SkillHubState['setFormMessage']
  create: SkillHubState['create']
}

export function PanelDialogs(props: PanelDialogsProps): JSX.Element {
  const {
    conflictDialog, tags, collections, setConflictDialog, resolveConflict,
    confirmDialog, setConfirmDialog, runConfirmed,
    deleteDialog, pendingDeletes, setDeleteDialog, confirmDeletes,
    branchChoice, branchBusy, setBranchChoice, confirmBranchChoice,
    versionDialog, versionBusy, setVersionDialog, confirmVersionDialog,
    marketSyncDialog, syncBusy, setMarketSyncDialog, confirmMarketSync,
    showForm, formName, formDesc, formContent, formRoot, formBusy, formMessage,
    setShowForm, setFormName, setFormDesc, setFormContent, setFormRoot, setFormMessage, create,
  } = props
  return (
    <>
      {conflictDialog !== null ? (
        <ConflictDialog
          dialog={conflictDialog}
          tags={tags}
          collections={collections}
          onClose={() => { setConflictDialog(null) }}
          onKeepOn={() => { void resolveConflict(false) }}
          onCloseAll={() => { void resolveConflict(true) }}
        />
      ) : null}

      {confirmDialog !== null ? (
        <ConfirmDialog
          title={tt('source.syncConfirmTitle')}
          text={tt('source.syncConfirmText')}
          items={confirmDialog.skills}
          confirmLabel={tt('source.sync')}
          onCancel={() => { setConfirmDialog(null) }}
          onConfirm={() => { void runConfirmed() }}
        />
      ) : null}

      {deleteDialog && pendingDeletes.length > 0 ? (
        <ConfirmDialog
          title={tt('edit.deleteTitle', { count: pendingDeletes.length })}
          text={tt('edit.deleteText')}
          items={pendingDeletes}
          confirmLabel={tt('edit.deleteConfirm')}
          danger
          onCancel={() => { setDeleteDialog(false) }}
          onConfirm={confirmDeletes}
        />
      ) : null}

      {branchChoice !== null ? (
        <BranchChoiceDialog
          choice={branchChoice}
          busy={branchBusy}
          onSelect={(selected) => { setBranchChoice({ ...branchChoice, selected }) }}
          onCancel={() => { setBranchChoice(null) }}
          onConfirm={() => { void confirmBranchChoice() }}
        />
      ) : null}

      {versionDialog !== null ? (
        <VersionChoiceDialog
          choice={versionDialog}
          busy={versionBusy}
          // Keep the selected ref and custom override in one functional
          // update, so a ref selection cannot be lost to a stale snapshot.
          onSelect={(selected) => {
            setVersionDialog((previous) => previous === null ? previous : { ...previous, selected, custom: '' })
          }}
          onCustom={(custom) => {
            setVersionDialog((previous) => previous === null ? previous : { ...previous, custom })
          }}
          onCancel={() => { setVersionDialog(null) }}
          onConfirm={() => { void confirmVersionDialog() }}
        />
      ) : null}

      {marketSyncDialog !== null ? (
        <MarketSyncDialog
          dialog={marketSyncDialog}
          busy={syncBusy}
          onToggle={(name, checked) => {
            const next = new Set(marketSyncDialog.selected)
            if (checked) next.add(name)
            else next.delete(name)
            setMarketSyncDialog({ ...marketSyncDialog, selected: next })
          }}
          onCancel={() => { setMarketSyncDialog(null) }}
          onConfirm={() => { void confirmMarketSync() }}
        />
      ) : null}

      {showForm ? (
        <CreateSkillDialog
          name={formName}
          desc={formDesc}
          content={formContent}
          root={formRoot}
          busy={formBusy}
          message={formMessage}
          onName={setFormName}
          onDesc={setFormDesc}
          onContent={setFormContent}
          onRoot={setFormRoot}
          // 关掉弹窗的同时清掉上一次的报错，重开时不会残留旧消息。
          onCancel={() => { setShowForm(false); setFormMessage(null) }}
          onSubmit={() => { void create() }}
        />
      ) : null}
    </>
  )
}
