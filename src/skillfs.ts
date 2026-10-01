/**
 * Skill filesystem operations for the writable roots: scaffolding a new skill
 * bundle and repairing discovery diagnostics in place.
 *
 * The hub never renames, moves or deletes skill files. Switching a skill off is
 * a runtime decision persisted in the sidecar and enforced by the per-preset
 * gate, so nothing here touches discovery state.
 *
 * Frontmatter parsing mirrors @deepseek-ai/dsh-skill-filesystem semantics:
 * required name (kebab-case) + description, optional whenToUse, invocation
 * booleans with the same defaults (modelInvocable defaults true,
 * userInvocable defaults true), legacy keys rejected, and the returned
 * content is the body after the frontmatter block, trimmed.
 */

import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { dump } from 'js-yaml'
import { isSkillName } from '@deepseek-ai/dsh-skill'
import { parseFrontmatter, repairFrontmatterFileText } from './skillfs/frontmatter.ts'
import { rootOfPath, skillDir } from './skillfs/paths.ts'
import { dshHome } from './env.ts'
import type { WritableRoot } from './protocol.ts'

// Barrel: the frontmatter parser, the writable-root path helpers and the
// discovery scanner live under ./skillfs/ and are re-exported here unchanged.
export * from './skillfs/frontmatter.ts'
export * from './skillfs/paths.ts'
export * from './skillfs/scan.ts'

/**
 * Scaffold a directory-bundle skill: <root>/<name>/SKILL.md with a frontmatter
 * template. Refuses non-kebab-case names.
 * @param content Markdown body written after the frontmatter; when blank the
 * scaffold placeholder paragraph is used instead.
 * @returns the created SKILL.md path.
 */
export async function createSkill(root: WritableRoot, name: string, description: string, home = dshHome(), content = ''): Promise<string> {
  if (!isSkillName(name)) {
    throw new TypeError('skill name must be kebab-case (lowercase letters, digits, dashes): "' + name + '"')
  }
  const dir = skillDir(root, name, home)
  const file = join(dir, 'SKILL.md')
  await mkdir(dir, { recursive: true })
  const safeDescription = description.trim() === '' ? 'New dsh skill created from the Skill Groups panel.' : description.trim()
  // 正文由调用方提供时原样写入（只 trim 首尾空白）；留空才落到脚手架占位段。
  const safeContent = content.trim()
  const body = [
    '---',
    // dump() emits a quoted string when plain text would parse as a number,
    // mapping, or other non-string YAML (the official parser requires strings).
    'name: ' + dump(name).trim(),
    'description: ' + dump(safeDescription).trim(),
    '---',
    '',
    ...(safeContent === ''
      ? ['# ' + name, '', 'Describe what this skill does, when the agent should use it, and what output is expected.', '']
      : [safeContent, '']),
  ].join('\n')
  await writeFile(file, body, 'utf8')
  return file
}

/** Repair one file on disk when its frontmatter is auto-fixable. Returns the new text. */
export async function fixDiagnosticFile(path: string, home = dshHome()): Promise<string> {
  const root = rootOfPath(path, home)
  if (root === undefined) throw new TypeError('not a hub writable skill path: ' + path)
  const text = await readFile(path, 'utf8')
  const repairedText = repairFrontmatterFileText(text)
  if (repairedText === null) throw new TypeError('diagnostic is not auto-fixable: ' + path)
  // Validate the repaired text parses as a legal skill (prevents writing a still-broken file).
  const parsed = parseFrontmatter(repairedText)
  if ('error' in parsed) throw new TypeError('repaired frontmatter still invalid: ' + parsed.error)
  await writeFile(path, repairedText, 'utf8')
  return path
}
