import { describe, expect, it } from 'vitest'
import { usage, version } from '../src/index.ts'

describe('clarify-kit skeleton', () => {
  it('reads its version from package.json', () => {
    expect(version()).toMatch(/^\d+\.\d+\.\d+/)
  })

  it('has a usage line', () => {
    expect(usage).toContain('clarify-kit')
  })
})
