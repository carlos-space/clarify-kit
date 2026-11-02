// Compares the facts of clarify-kit-facts with what the package exports. The facts are built from
// facts/clarify-kit by `pnpm test` before this runs, and read the way a reader on head reads them.
import { readFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { selectFacts } from 'fact-kit'
import type { FactIndex } from 'fact-kit'
import { afterAll, describe, expect, it } from 'vitest'
import * as api from '../src/index.ts'
import {
  BLOCK_FIELDS,
  BLOCK_KINDS,
  DOC_TYPES,
  DOC_TYPE_NAMES,
  STANDARD_TEMPLATES,
  TOPIC_PATTERN,
  CONFIG_KEYS,
  FORMAT_VERSION,
  PROBLEM_CODES,
  buildProject,
  getTemplate,
  listTemplates,
  readConfig,
} from '../src/index.ts'
import { CLI, Project, cleanup } from './helpers.ts'

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

afterAll(cleanup)

// The samples are built once: the sample of a custom template registers it, and a name can be registered once per process.
let sampleIndex: Promise<any> | undefined
const builtSamples = (): Promise<any> =>
  (sampleIndex ??= (async () => {
    const p = new Project('spec-samples').config().entry('main', { acme: '1.0.0' }).samples()
    await buildProject(readConfig(undefined, p.dir))
    return p.json('dist/main/index.json')
  })())

describe('build, check, CLI and index format against the facts', () => {
  it('carry no pending label on the facts of the commands that exist, the index format and the check codes', () => {
    const ids = [
      ...['commands', 'build', 'check', 'adopt', 'config', 'entry-rule'].map((n) => `clarify-kit.cli.${n}`),
      ...index.facts.filter((f) => /^clarify-kit\.(index|check)\./.test(f.id)).map((f) => f.id),
    ]
    expect(ids.length).toBe(6 + 4 + 2)
    for (const id of ids) {
      expect(facts.has(id), id).toBe(true)
      expect(index.facts.find((f) => f.id === id)?.variants?.every((v) => v.pending === undefined), id).toBe(true)
    }
  })

  it('reports the codes the check codes fact lists, in that order', () => {
    expect(Object.keys(value('check.codes').codes)).toEqual([...PROBLEM_CODES])
  })

  it('reads the settings the config fact lists', () => {
    expect(Object.keys(value('cli.config').settings)).toEqual([...CONFIG_KEYS])
    expect(value('cli.config').file).toBe('clarify-kit.config.json')
    const config = readConfig(undefined, '/nowhere')
    expect(config).toMatchObject({ docsDir: '/nowhere/docs', modules: [], factSources: [] })
  })

  it('writes the six top-level fields and the format version the index facts give', async () => {
    const built = await builtSamples()
    expect(Object.keys(built)).toEqual(value('index.fields').topLevel)
    expect(built.formatVersion).toBe(FORMAT_VERSION)
    expect(FORMAT_VERSION).toBe(value('index.format-version').initial)
    expect('dataFormatVersion' in built).toBe(false)
  })

  it('writes the fields of a document the doc fields fact lists, id, factRefs and template among them', async () => {
    const fact = value('index.doc-fields')
    const docs = (await builtSamples()).docs as Record<string, unknown>[]
    expect(docs.length).toBeGreaterThanOrEqual(17)
    const seen = new Set<string>()
    for (const doc of docs) {
      const type = doc.type as string
      const own = fact.byType[type]
      const required = [...fact.required, ...own.required]
      const allowed = [...required, ...fact.optional, ...own.optional]
      for (const key of required) expect(key in doc, `${doc.id}: ${key}`).toBe(true)
      for (const key of Object.keys(doc)) expect(allowed.includes(key), `${doc.id}: ${key}`).toBe(true)
      for (const key of Object.keys(doc)) seen.add(key)
    }
    for (const key of ['id', 'factRefs', 'template', 'since', 'contentHash', 'supersedes']) expect(seen.has(key), key).toBe(true)
    expect(fact.required).toContain('id')
    expect(fact.required).toContain('factRefs')
    expect(fact.optional).toContain('template')
  })

  it('lists the commands the CLI runs, and the exit codes of the commands facts', () => {
    const commands = value('cli.commands').commands as string[]
    const p = new Project('spec-cli').config().entry()
    for (const name of ['build', 'check', 'adopt']) {
      expect(commands).toContain(name)
      expect(value(`cli.${name}`).exitCodes).toMatchObject({ 0: expect.any(String), 2: expect.any(String) })
    }
    const status = (...args: string[]) => spawnSync(process.execPath, [CLI, ...args], { cwd: p.dir }).status
    expect(status('build')).toBe(0)
    expect(status('check')).toBe(0)
    expect(status('adopt', 'none.doc.ts')).toBe(2)
    expect(status('no-such-command')).toBe(2)
    expect(value('check.codes').exit).toMatch(/1/)
  })

  it('states the docs package convention in the README', () => {
    const readme = readFileSync(new URL('../README.md', import.meta.url), 'utf8')
    const section = /^## .*文件套件慣例[\s\S]*?(?=^## |$(?![\s\S]))/m.exec(readme)?.[0] ?? ''
    expect(section).not.toBe('')
    const convention = value('index.docs-package-convention')
    expect(section).toContain(convention.name.replaceAll('`', ''))
    expect(section).toContain('"private"')
    expect(section).toContain(Object.keys(convention.exports)[0])
    expect(section).toContain('"files"')
    expect(section).toContain(JSON.stringify(convention.exports[Object.keys(convention.exports)[0] as string]))
  })
})
