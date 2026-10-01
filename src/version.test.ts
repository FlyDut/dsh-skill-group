import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { CURRENT_VERSION } from './version.ts'

describe('CURRENT_VERSION', () => {
  it('matches the package manifest version', () => {
    const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')) as { version: string }
    expect(CURRENT_VERSION).toBe(pkg.version)
  })
})
