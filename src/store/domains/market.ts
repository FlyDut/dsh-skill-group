/**
 * Market-source (市场仓库) mutations over the sidecar's market list.
 *
 * I/O-free by design: the store owns loading and persistence. The list is kept
 * in addition order, so these helpers mutate it in place.
 */
import type { MarketSourceRecord } from '../../protocol.ts'

/** One market source by repo (undefined when absent). */
export function findMarketSource(entries: readonly MarketSourceRecord[], repo: string): MarketSourceRecord | undefined {
  return entries.find((entry) => entry.repo === repo)
}

/** Add a repo (deduplicated), optionally pinning a ref. */
export function addMarketSource(entries: MarketSourceRecord[], repo: string, ref?: string): void {
  const existing = findMarketSource(entries, repo)
  if (existing === undefined) {
    entries.push(ref !== undefined && ref !== '' ? { repo, ref } : { repo })
  } else if (ref !== undefined && ref !== '' && existing.ref !== ref) {
    existing.ref = ref
  }
}

/** Remove a repo. Returns whether a record was removed. */
export function removeMarketSource(entries: MarketSourceRecord[], repo: string): boolean {
  const index = entries.findIndex((entry) => entry.repo === repo)
  if (index === -1) return false
  entries.splice(index, 1)
  return true
}

/** Pin a market source to an explicit ref (branch/tag), clearing the recorded commit. */
export function setMarketSourceRef(entries: MarketSourceRecord[], repo: string, ref: string): { entry: MarketSourceRecord | undefined; changed: boolean } {
  const entry = findMarketSource(entries, repo)
  if (entry === undefined || ref.trim() === '') return { entry, changed: false }
  entry.ref = ref.trim()
  delete entry.commitSha
  return { entry, changed: true }
}

/** Record the commit a market source's pinned ref resolved to (update baseline). */
export function setMarketSourceCommit(entries: MarketSourceRecord[], repo: string, commitSha: string): boolean {
  const entry = findMarketSource(entries, repo)
  if (entry === undefined || commitSha === '') return false
  entry.commitSha = commitSha
  return true
}
