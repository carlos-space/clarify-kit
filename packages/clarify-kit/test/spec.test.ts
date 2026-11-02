// Compares the facts of clarify-kit-facts with what the package exports. The facts are built from
// facts/clarify-kit by `pnpm test` before this runs, and read the way a reader on head reads them.
import { readFileSync } from 'node:fs'
import { selectFacts } from 'fact-kit'
import type { FactIndex } from 'fact-kit'
import { describe, expect, it } from 'vitest'
import * as api from '../src/index.ts'
import {
  BLOCK_FIELDS,
  BLOCK_KINDS,
  DOC_TYPES,
  DOC_TYPE_NAMES,
  STANDARD_TEMPLATES,
  TOPIC_PATTERN,
  getTemplate,
  listTemplates,
} from '../src/index.ts'

const index = JSON.parse(
  readFileSync(new URL('../../../facts/clarify-kit/dist/clarify-kit/index.json', import.meta.url), 'utf8'),
) as FactIndex
const facts = new Map(selectFacts(index, { version: 'head' }).map((f) => [f.id, f]))
const value = (id: string): any => {
  const fact = facts.get(`clarify-kit.${id}`)
  if (!fact) throw new Error(`no fact clarify-kit.${id} that a reader on head sees`)
  return (fact.content as { value: unknown }).value
}

describe('the facts of the document model', () => {
  it('carry no pending label, so a reader without labels sees them', () => {
    const modelFacts = index.facts.filter((f) => /^clarify-kit\.(doc-types|blocks|topics|templates|modules)\./.test(f.id))
    expect(modelFacts.length).toBe(31)
    for (const fact of modelFacts) {
      expect(facts.has(fact.id), fact.id).toBe(true)
      expect(fact.variants?.every((v) => v.pending === undefined), fact.id).toBe(true)
    }
  })
})

describe('the entry of the package against the facts', () => {
  it('has the four types with their states and version fields', () => {
    expect(DOC_TYPE_NAMES).toEqual(['doc', 'requirement', 'decision', 'record'])
    for (const name of DOC_TYPE_NAMES) {
      const fact = value(`doc-types.${name}`)
      expect(fact.kind).toBe(name)
      expect(fact.lifecycle).toBe(DOC_TYPES[name].lifecycle)
      expect(Object.keys(fact.states)).toEqual([...DOC_TYPES[name].states])
      expect(fact.versionField).toBe(DOC_TYPES[name].versionField)
    }
  })

  it('exports one constructor for each type', () => {
    for (const name of DOC_TYPE_NAMES) expect(typeof (api as Record<string, unknown>)[name]).toBe('function')
  })

  it('has the seven blocks with the fields the facts list', () => {
    expect(BLOCK_KINDS).toEqual(value('blocks.kinds').kinds)
    for (const kind of BLOCK_KINDS) {
      const fact = value(`blocks.${kind}`)
      expect(fact.kind).toBe(kind)
      expect(Object.keys(fact.fields)).toEqual([...BLOCK_FIELDS[kind], 'since', 'pending'])
    }
  })

  it('exports a builder for each block', () => {
    const builders: Record<string, string> = {
      text: 'text',
      list: 'list',
      table: 'table',
      fact: 'factBlock',
      scenario: 'scenario',
      code: 'code',
      asset: 'asset',
    }
    for (const kind of BLOCK_KINDS) expect(typeof (api as Record<string, unknown>)[builders[kind] as string]).toBe('function')
  })

  it('has the topic format of the facts', () => {
    expect(TOPIC_PATTERN).toBe(value('topics.format').pattern)
    expect(api.isTopic('design:token')).toBe(true)
    expect(api.isTopic('design')).toBe(false)
  })

  it('has the ten standard templates with the required sections of the facts', () => {
    const set = value('templates.standard-set')
    expect(Object.keys(STANDARD_TEMPLATES)).toEqual([...set.doc, ...set.record])
    for (const name of Object.keys(STANDARD_TEMPLATES)) {
      const fact = value(`templates.${name}`)
      const template = getTemplate(name)
      expect(template?.type, name).toBe(fact.type)
      expect(template?.sections.filter((s) => s.required).map((s) => s.id), name).toEqual(fact.requiredSections)
      expect(typeof (api as Record<string, unknown>)[name], name).toBe('function')
    }
    expect(listTemplates().length).toBeGreaterThanOrEqual(10)
  })

  it('exports the module functions the facts name', () => {
    expect(typeof (api as Record<string, unknown>)[value('modules.register-template').function]).toBe('function')
    expect(typeof (api as Record<string, unknown>)[value('modules.register-renderer').function]).toBe('function')
  })
})
