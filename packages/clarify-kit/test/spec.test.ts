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
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { DOC_READ_ERROR_CODES, USAGE, contentHashOf, doc, registerRenderer, renderProject, section, text, factBlock } from '../src/index.ts'
import type { RenderContext } from '../src/index.ts'

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
    expect(modelFacts.length).toBe(32)
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

describe('pin, render, read and impact against the facts', () => {
  const run = (p: Project, ...args: string[]) => spawnSync(process.execPath, [CLI, ...args], { cwd: p.dir, encoding: 'utf8' })

  it('leave no fact with a pending label, so a reader without labels sees every fact', () => {
    expect(index.facts.length).toBeGreaterThan(0)
    expect(facts.size).toBe(index.facts.length)
    for (const fact of index.facts) expect(fact.variants?.every((v) => v.pending === undefined), fact.id).toBe(true)
  })

  it('runs the five commands of the commands fact, and pin and render take the flags their facts list', () => {
    const p = new Project('spec-pin-render').config().entry()
    for (const name of value('cli.commands').commands as string[]) {
      expect(USAGE, name).toContain(`  ${name}`)
      expect(run(p, name, '--bogus').stderr, name).not.toContain('unknown command')
    }
    for (const name of ['pin', 'render']) for (const flag of Object.keys(value(`cli.${name}`).flags)) expect(USAGE, `${name} ${flag}`).toContain(flag)
    expect(value('cli.pin').flags['--version']).toMatch(/必填/)
    expect(run(p, 'pin').status).toBe(value('cli.pin').exitCodes[2] ? 2 : -1)
    expect(run(p, 'pin', '--version', '1.2.3').status).toBe(0)
  })

  it('renders to a new directory under the system temp directory, and refuses --out inside a git work tree with exit 1', () => {
    const location = value('cli.render-location')
    expect(location.outInsideWorkTree).toMatch(/（1）/)
    expect(value('cli.render').exitCodes[1]).toMatch(/git 工作樹/)
    const p = new Project('spec-render').config().entry().doc('docs/main/a.doc.ts', 'doc, section, text', `doc({ id: 'a', title: 'A', status: 'draft', sections: [section('s', 'S', [text('t')])] })`)
    expect(run(p, 'render', '--out', p.path('out')).status).toBe(1)
    const r = run(p, 'render')
    expect(r.status).toBe(0)
    const dir = /to (.+)\n$/.exec(r.stdout)?.[1] as string
    expect(dir.replace(/^\/private/, '')).toContain(tmpdir().replace(/^\/private/, ''))
    rmSync(dir, { recursive: true, force: true })
  })

  it('exports the read function the select fact names, with the options its signature lists', () => {
    const select = value('read.select')
    expect(typeof (api as Record<string, unknown>)[select.function]).toBe('function')
    for (const option of ['version', 'include', 'root']) expect(select.signature).toContain(option)
  })

  it('reads an installed package with loadInstalledJson, and reports the codes the installed fact lists', () => {
    const installed = value('read.installed')
    expect(installed.loader).toMatch(/^loadInstalledJson/)
    expect(Object.keys(installed.checkErrors)).toEqual([...DOC_READ_ERROR_CODES])
    const source = readFileSync(new URL('../src/read.ts', import.meta.url), 'utf8')
    const code = source.replace(/^\s*\/\/.*$/gm, '')
    expect(code).toMatch(/loadInstalledJson\(/)
    for (const name of installed.doesNotUse as string[]) expect(code, name).not.toMatch(new RegExp(`\\b${name}\\b`))
  })

  it('registers the extractor the impact fact names', () => {
    expect(value('read.impact-extractor').register).toContain('registerDocImpactExtractor')
    expect(typeof (api as Record<string, unknown>).registerDocImpactExtractor).toBe('function')
  })

  it('calls a registered renderer with the fields of the render context fact, and no others', async () => {
    const fact = value('modules.render-context')
    const seen: RenderContext[] = []
    registerRenderer('spec-context', (f, context) => {
      seen.push(context)
      return f.id
    })
    const p = new Project('spec-context').install('facts-2x').config({ factSources: ['acme-facts-2x/acme'] }).entry().doc(
      'docs/main/a.doc.ts',
      'doc, section, factBlock',
      `doc({ id: 'a', title: 'A', status: 'draft', sections: [section('s', 'S', [factBlock({ facts: 'acme.buttons.radius', renderer: 'spec-context' })])] })`,
    )
    const out = mkdtempSync(join(tmpdir(), 'clarify-kit-spec-'))
    try {
      await renderProject(readConfig(undefined, p.dir), { out })
    } finally {
      rmSync(out, { recursive: true, force: true })
    }
    expect(seen).toHaveLength(1)
    expect(Object.keys(seen[0] as object)).toEqual(Object.keys(fact.fields))
    expect(fact.type).toBe('RenderContext')
    void [doc, section, text, factBlock]
  })

  it('leaves since and pending out of the content hash, as the content hash fact lists', () => {
    expect(value('doc-types.content-hash').excludes).toEqual(expect.arrayContaining(['since', 'pending']))
    const make = (marks: Record<string, string>) =>
      doc({ id: 'a', title: 'A', status: 'draft', sections: [section('s', 'S', [text('t', marks)], marks)] })
    expect(contentHashOf(make({ since: 'next', pending: 'later' }))).toBe(contentHashOf(make({})))
    expect(contentHashOf(make({ since: '1.0.0' }))).toBe(contentHashOf(make({})))
  })
})
