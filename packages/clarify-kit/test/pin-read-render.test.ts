// Tests of pin, read, impact, render and merge-since on documents.
import { execFileSync, spawnSync } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync, symlinkSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { impactOf, mergeSince } from 'fact-kit'
import { afterAll, describe, expect, it } from 'vitest'
import {
  DOC_TYPES,
  DocReadError,
  checkProject,
  docImpactExtractor,
  pinDocs,
  pinnableFields,
  readConfig,
  readDocs,
  registerDocImpactExtractor,
  registerRenderer,
  renderProject,
  run,
} from '../src/index.ts'
import type { RenderContext } from '../src/index.ts'
import { CLI, PACKAGE_DIR, Project, SRC, cleanup } from './helpers.ts'

afterAll(cleanup)

const REPO = join(PACKAGE_DIR, '..', '..')
const cli = (p: Project, ...args: string[]) => {
  const r = spawnSync(process.execPath, [CLI, ...args], { cwd: p.dir, encoding: 'utf8' })
  return { status: r.status, out: r.stdout, err: r.stderr }
}
const gitStatus = (): string => execFileSync('git', ['-C', REPO, 'status', '--short'], { encoding: 'utf8' })
const FIXTURES = join(PACKAGE_DIR, 'test', 'fixtures')

/** A document with a `since` on the document, a section and some blocks, written the way an author writes it. */
const PIN_SOURCE = `doc({
  id: 'guide',
  title: 'Guide',
  status: 'draft',
  since: 'next',
  sections: [
    section('intro', 'Intro', [
      text('new in the next release', { since: 'next' }),
      text('old', { since: '0.1.0' }),
      text('still planned', { since: 'next', pending: 'later' }),
      text('no mark'),
      list(['a', 'b'], { ordered: true, since: ['0.1.0', 'next'] }),
    ], { since: 'next' }),
    section('more', 'More', [text('kept', { since: '0.1.0' })], { since: '0.1.0' }),
  ],
})`

describe('pin', () => {
  it('turns the next of the document, the sections and the blocks into the version and leaves every other since as it is', async () => {
    const p = new Project('pin').config().entry().doc('docs/main/guide.doc.ts', 'doc, section, text, list', PIN_SOURCE)
    const before = p.read('docs/main/guide.doc.ts')
    const result = await pinDocs(readConfig(undefined, p.dir), '0.2.0')
    expect(result.changed).toEqual([{ file: 'docs/main/guide.doc.ts', pinned: 4 }])
    expect(result.skipped).toEqual([])
    const after = p.read('docs/main/guide.doc.ts')
    // the whole difference is the four literals: the document, the section, the first block and the last item of the array
    expect(after).toBe(
      before
        .replace("since: 'next',\n  sections", "since: '0.2.0',\n  sections")
        .replace("text('new in the next release', { since: 'next' })", "text('new in the next release', { since: '0.2.0' })")
        .replace("since: ['0.1.0', 'next']", "since: ['0.1.0', '0.2.0']")
        .replace("], { since: 'next' }),", "], { since: '0.2.0' }),"),
    )
    expect(after).toContain("text('still planned', { since: 'next', pending: 'later' })")
    expect(after).toContain("text('old', { since: '0.1.0' })")
    // a second run finds nothing
    expect((await pinDocs(readConfig(undefined, p.dir), '0.2.0')).changed).toEqual([])
  })

  it('is the command pin: prints what it changed, and exits 2 without --version or with a version that is not semver', async () => {
    const p = new Project('pin-cli').config().entry().doc('docs/main/guide.doc.ts', 'doc, section, text, list', PIN_SOURCE)
    const out: string[] = []
    const status = await run(['pin', '--version', '0.2.0'], { cwd: p.dir, out: (t) => out.push(t), err: () => {} })
    expect(status).toBe(0)
    expect(out).toEqual(['pinned docs/main/guide.doc.ts: 4', 'clarify-kit pin: 4 "next" pinned to 0.2.0 in 1 file(s)'])
    expect(cli(p, 'pin')).toMatchObject({ status: 2, err: expect.stringContaining('--version') })
    expect(cli(p, 'pin', '--version', 'soon')).toMatchObject({ status: 2, err: expect.stringContaining('semver') })
    expect(cli(p, 'pin', '--version', '1.0.0', '--out', 'x').status).toBe(2)
  })

  it('reads every object, so a block option under a name fact-kit skips by default is pinned too', async () => {
    const p = new Project('pin-keys').config().entry().doc(
      'docs/main/keys.doc.ts',
      'doc, section, text',
      `doc({ id: 'keys', title: 'K', status: 'draft', sections: [section('s', 'S', [text('t')])] })\nexport const content = { value: { since: 'next' } }`,
    )
    expect((await pinDocs(readConfig(undefined, p.dir), '1.0.0')).changed[0]?.pinned).toBe(1)
  })

  it('leaves a row alone when a spread may hide a pending label, and says so', async () => {
    const p = new Project('pin-spread').config().entry().doc(
      'docs/main/s.doc.ts',
      'doc, section, text',
      `doc({ id: 's', title: 'S', status: 'draft', sections: [section('s', 'S', [text('t', { since: 'next', ...{} })])] })`,
    )
    const result = await pinDocs(readConfig(undefined, p.dir), '1.0.0')
    expect(result.changed).toEqual([])
    expect(result.skipped).toHaveLength(1)
  })

  describe('the version fields of the document types', () => {
    const DECISION = `decision({
  id: 'd',
  title: 'D',
  status: 'proposed',
  appliesFrom: 'next',
  sections: [section('s', 'S', [text('t', { since: 'next' })])],
})`
    const REQUIREMENT = `requirement({ id: 'r', title: 'R', status: 'planned', release: 'next', sections: [section('s', 'S', [text('t')])] })`
    const project = (label: string, files: Record<string, [string, string]>): Project => {
      const p = new Project(label).config().entry()
      for (const [rel, [imports, body]] of Object.entries(files)) p.doc(rel, imports, body)
      return p
    }

    it('pins appliesFrom of a decision, release of a requirement and a block since, and changes nothing else', async () => {
      const p = project('pin-fields', {
        'docs/main/d.doc.ts': ['decision, section, text', DECISION],
        'docs/main/r.doc.ts': ['requirement, section, text', REQUIREMENT],
      })
      const before = { d: p.read('docs/main/d.doc.ts'), r: p.read('docs/main/r.doc.ts') }
      const result = await pinDocs(readConfig(undefined, p.dir), '0.3.1')
      expect(result.changed).toEqual([
        { file: 'docs/main/d.doc.ts', pinned: 2 },
        { file: 'docs/main/r.doc.ts', pinned: 1 },
      ])
      expect(result.skipped).toEqual([])
      // the whole difference is three literals
      expect(p.read('docs/main/d.doc.ts')).toBe(
        before.d.replace("appliesFrom: 'next'", "appliesFrom: '0.3.1'").replace("{ since: 'next' }", "{ since: '0.3.1' }"),
      )
      expect(p.read('docs/main/r.doc.ts')).toBe(before.r.replace("release: 'next'", "release: '0.3.1'"))
      const total = result.changed.reduce((n, c) => n + c.pinned, 0)
      expect(total).toBe(3)
    })

    it('leaves a pending document and a version that is already set alone, and finds nothing the second time', async () => {
      const p = project('pin-fields-keep', {
        'docs/main/pd.doc.ts': ['decision, section', `decision({ id: 'pd', title: 'P', status: 'proposed', appliesFrom: 'next', pending: 'later', sections: [section('s', 'S', [])] })`],
        'docs/main/pr.doc.ts': ['requirement, section', `requirement({ id: 'pr', title: 'P', status: 'planned', release: 'next', pending: 'later', sections: [section('s', 'S', [])] })`],
        'docs/main/set.doc.ts': ['decision, section', `decision({ id: 'set', title: 'S', status: 'proposed', appliesFrom: '0.2.0', sections: [section('s', 'S', [])] })`],
        'docs/main/d.doc.ts': ['decision, section, text', DECISION],
      })
      const untouched = ['pd', 'pr', 'set'].map((n) => [n, p.read(`docs/main/${n}.doc.ts`)] as const)
      expect((await pinDocs(readConfig(undefined, p.dir), '0.3.1')).changed).toEqual([{ file: 'docs/main/d.doc.ts', pinned: 2 }])
      for (const [n, text] of untouched) expect(p.read(`docs/main/${n}.doc.ts`)).toBe(text)
      expect((await pinDocs(readConfig(undefined, p.dir), '0.3.1')).changed).toEqual([])
    })

    it('leaves a document alone when a spread may hide a pending label, and says so', async () => {
      const p = project('pin-fields-spread', {
        'docs/main/d.doc.ts': ['decision, section', `decision({ id: 'd', title: 'D', status: 'proposed', appliesFrom: 'next', ...{}, sections: [section('s', 'S', [])] })`],
      })
      const result = await pinDocs(readConfig(undefined, p.dir), '0.3.1')
      expect(result.changed).toEqual([])
      expect(result.skipped).toHaveLength(1)
      expect(p.read('docs/main/d.doc.ts')).toContain("appliesFrom: 'next'")
    })

    it('writes nothing when a document cannot be parsed', async () => {
      const p = project('pin-fields-broken', {
        'docs/main/d.doc.ts': ['decision, section, text', DECISION],
        'docs/main/z.doc.ts': ['section', 'decision({ ('],
      })
      const before = p.read('docs/main/d.doc.ts')
      await expect(pinDocs(readConfig(undefined, p.dir), '0.3.1')).rejects.toThrow(/cannot parse/)
      expect(p.read('docs/main/d.doc.ts')).toBe(before)
    })

    it('takes the fields from the table of types: a renamed field is the one that is pinned', async () => {
      const p = project('pin-fields-table', {
        'docs/main/d.doc.ts': ['decision, section', `decision({ id: 'd', title: 'D', status: 'proposed', appliesFrom: 'next', since: 'next', takesEffect: 'next', sections: [section('s', 'S', [])] })`],
      })
      const renamed = { ...DOC_TYPES, decision: { ...DOC_TYPES.decision, versionField: 'takesEffect' } }
      const result = await pinDocs(readConfig(undefined, p.dir), '0.3.1', renamed)
      // `since` goes to fact-kit and `takesEffect` to the table, but `appliesFrom` is no longer a version field
      expect(result.changed).toEqual([{ file: 'docs/main/d.doc.ts', pinned: 2 }])
      const after = p.read('docs/main/d.doc.ts')
      expect(after).toContain("appliesFrom: 'next'")
      expect(after).toContain("takesEffect: '0.3.1'")
      expect(pinnableFields()).toEqual(['release', 'appliesFrom'])
      expect(pinnableFields(renamed)).toEqual(['release', 'takesEffect'])
    })
  })
})

describe('a decision source with pending labels', () => {
  const source = (mark: string, sectionMark = '') =>
    `decision({
  id: 'use-x',
  title: 'Use X',
  status: 'accepted',
  appliesFrom: 'next',
  sections: [section('context', 'Context', [text('The reason.'${mark})]${sectionMark})],
})`
  const FILE = 'docs/main/use-x.doc.ts'
  it('stays valid when the pending labels are taken off and the next pin sets the version', async () => {
    const p = new Project('pin-pending').config().entry().doc(FILE, 'decision, section, text', source(", { since: 'next', pending: 'later' }", ", { pending: 'later' }"))
    expect(await checkProject(readConfig(undefined, p.dir))).toEqual([])
    // the feature lands: the author takes the labels off, and the next pin sets the version
    p.write(FILE, p.read(FILE).replace(", pending: 'later'", '').replace(", { pending: 'later' }", ''))
    expect(p.read(FILE)).not.toContain('pending')
    expect(await checkProject(readConfig(undefined, p.dir))).toEqual([])
    await pinDocs(readConfig(undefined, p.dir), '0.2.0')
    expect(p.read(FILE)).toContain("{ since: '0.2.0' }")
    expect(await checkProject(readConfig(undefined, p.dir))).toEqual([])
  })
})

/** Builds the documents of `p` and installs the index as the package `acme-docs`, entry `main`. */
async function installDocs(p: Project, root: Project): Promise<void> {
  const { buildProject } = await import('../src/index.ts')
  expect((await buildProject(readConfig(undefined, p.dir))).ok).toBe(true)
  root.write('node_modules/acme-docs/package.json', JSON.stringify({ name: 'acme-docs', version: '3.4.5', exports: { './main/index.json': './main/index.json' } }))
  root.write('node_modules/acme-docs/main/index.json', p.read('dist/main/index.json'))
}

describe('readDocs', () => {
  const SOURCE = `doc({
  id: 'guide',
  title: 'Guide',
  status: 'active',
  sections: [
    section('base', 'Base', [
      text('from the start'),
      text('since 0.1.0', { since: '0.1.0' }),
      text('since 0.2.0', { since: '0.2.0' }),
      text('next only', { since: 'next' }),
      text('one per line', { since: ['0.1.0', '0.2.0'] }),
      text('planned', { pending: 'later', since: 'next' }),
    ]),
    section('newer', 'Newer', [text('whole section')], { since: '0.2.0' }),
    section('hidden', 'Hidden', [text('whole section pending')], { pending: 'later' }),
  ],
})
export const unused = 1`
  const make = async (label: string) => {
    const authored = new Project(`${label}-src`)
      .config()
      .entry()
      .doc('docs/main/guide.doc.ts', 'doc, section, text', SOURCE.replace('\nexport const unused = 1', ''))
      .doc('docs/main/later.doc.ts', 'doc, section, text', `doc({ id: 'later', title: 'Later', status: 'draft', since: '0.2.0', sections: [section('s', 'S', [text('t')])] })`)
      .doc('docs/main/wip.doc.ts', 'doc, section, text', `doc({ id: 'wip', title: 'Wip', status: 'draft', pending: 'later', sections: [section('s', 'S', [text('t')])] })`)
    const reader = new Project(`${label}-reader`)
    await installDocs(authored, reader)
    return reader
  }
  const texts = (docs: readonly { id: string; sections: { id: string; blocks: unknown[] }[] }[], id = 'guide'): string[] =>
    (docs.find((d) => d.id === id)?.sections.flatMap((s) => s.blocks) ?? []).map((b) => (b as { text: string }).text)

  it('reads the package that is installed, with its version, entry and describes', async () => {
    const r = await make('read-info')
    const reader = readDocs('acme-docs/main', { root: r.dir })
    expect(reader).toMatchObject({ package: 'acme-docs', version: '3.4.5', entry: 'main', describes: { acme: '1.0.0' } })
    expect(reader.has('guide')).toBe(true)
    expect(reader.get('guide').title).toBe('Guide')
    expect(() => reader.get('nope')).toThrow(/no document "nope"/)
  })

  it('shows a reader on head the next and not the pending, and without version it is on head', async () => {
    const r = await make('read-head')
    const head = readDocs('acme-docs/main', { root: r.dir })
    expect(texts(head.docs)).toEqual(['from the start', 'since 0.1.0', 'since 0.2.0', 'next only', 'one per line', 'whole section'])
    expect(head.docs.map((d) => d.id)).toEqual(['guide', 'later'])
    expect(readDocs('acme-docs/main', { root: r.dir, version: 'head' }).docs).toEqual(head.docs)
  })

  it('shows version 0.1.0 nothing that starts at 0.2.0 or at next', async () => {
    const r = await make('read-old')
    const old = readDocs('acme-docs/main', { root: r.dir, version: '0.1.0' })
    expect(texts(old.docs)).toEqual(['from the start', 'since 0.1.0', 'one per line'])
    expect(old.docs.map((d) => d.id)).toEqual(['guide'])
    expect(old.docs[0]?.sections.map((s) => s.id)).toEqual(['base'])
    const newer = readDocs('acme-docs/main', { root: r.dir, version: '0.2.0' })
    expect(texts(newer.docs)).toEqual(['from the start', 'since 0.1.0', 'since 0.2.0', 'one per line', 'whole section'])
    expect(newer.docs.map((d) => d.id)).toEqual(['guide', 'later'])
    // a patch of the 0.1 line takes the 0.1.0 content only, and a later line takes everything that has a version
    expect(texts(readDocs('acme-docs/main', { root: r.dir, version: '0.1.9' }).docs)).toEqual(['from the start', 'since 0.1.0', 'one per line'])
    expect(texts(readDocs('acme-docs/main', { root: r.dir, version: '1.0.0' }).docs)).toEqual(texts(newer.docs))
  })

  it('shows pending content only to a reader on head that includes the label', async () => {
    const r = await make('read-include')
    const some = readDocs('acme-docs/main', { root: r.dir, include: ['later'] })
    expect(texts(some.docs)).toEqual(['from the start', 'since 0.1.0', 'since 0.2.0', 'next only', 'one per line', 'planned', 'whole section', 'whole section pending'])
    expect(some.docs.map((d) => d.id)).toEqual(['guide', 'later', 'wip'])
    expect(readDocs('acme-docs/main', { root: r.dir, include: ['other'] }).docs.map((d) => d.id)).toEqual(['guide', 'later'])
    // a reader of a version is not on head, so the label does nothing
    const pinned = readDocs('acme-docs/main', { root: r.dir, version: '0.2.0', include: ['later'] })
    expect(texts(pinned.docs)).not.toContain('planned')
    expect(pinned.docs.map((d) => d.id)).toEqual(['guide', 'later'])
  })

  it('throws on a version that is not semver', async () => {
    const r = await make('read-bad-version')
    expect(() => readDocs('acme-docs/main', { root: r.dir, version: 'soon' })).toThrow(/version/)
  })

  const installJson = (r: Project, json: unknown) => {
    r.write('node_modules/bad-docs/package.json', JSON.stringify({ name: 'bad-docs', version: '1.0.0', exports: { './main/index.json': './main/index.json' } }))
    r.write('node_modules/bad-docs/main/index.json', JSON.stringify(json))
  }
  const docs = [{ id: 'a', type: 'doc', title: 'A', sections: [{ id: 's', title: 'S', blocks: [{ kind: 'text', text: 't' }] }] }]

  it('throws unsupported-format-version when the major of formatVersion is not 1, or it is missing', () => {
    for (const formatVersion of ['2.0', '0.9', 1, undefined]) {
      const r = new Project('read-format')
      installJson(r, { formatVersion, package: 'bad-docs', docs })
      expect(() => readDocs('bad-docs/main', { root: r.dir }), String(formatVersion)).toThrow(DocReadError)
      try {
        readDocs('bad-docs/main', { root: r.dir })
      } catch (error) {
        expect((error as DocReadError).code).toBe('unsupported-format-version')
      }
    }
    const ok = new Project('read-format-ok')
    installJson(ok, { formatVersion: '1.7', package: 'bad-docs', describes: {}, publish: {}, docs })
    expect(readDocs('bad-docs/main', { root: ok.dir }).docs).toHaveLength(1)
  })

  it('throws not-a-docs-index when docs is missing or a document, section or block has the wrong shape, and does not take a fact index', () => {
    const codeOf = (json: unknown): string | undefined => {
      const r = new Project('read-shape')
      installJson(r, json)
      try {
        readDocs('bad-docs/main', { root: r.dir })
      } catch (error) {
        return (error as DocReadError).code
      }
      return undefined
    }
    expect(codeOf({ formatVersion: '1.0', package: 'bad-docs' })).toBe('not-a-docs-index')
    expect(codeOf({ formatVersion: '1.0', docs: {} })).toBe('not-a-docs-index')
    expect(codeOf({ formatVersion: '1.0', docs: [{ id: 'a', type: 'memo', sections: [] }] })).toBe('not-a-docs-index')
    expect(codeOf({ formatVersion: '1.0', docs: [{ id: 'a', type: 'doc' }] })).toBe('not-a-docs-index')
    expect(codeOf({ formatVersion: '1.0', docs: [{ id: 'a', type: 'doc', sections: [{ id: 's' }] }] })).toBe('not-a-docs-index')
    expect(codeOf({ formatVersion: '1.0', docs: [{ id: 'a', type: 'doc', sections: [{ id: 's', blocks: [{ kind: 'video' }] }] }] })).toBe('not-a-docs-index')
    expect(codeOf(['not', 'an', 'object'])).toBe('not-a-docs-index')
    // a fact index has no formatVersion 1.x (the one of 1.x has none, the one of 2.0 has another), so it is stopped there
    for (const fixture of ['facts-1x', 'facts-2x']) {
      expect(codeOf(JSON.parse(readFileSync(join(FIXTURES, fixture, 'acme', 'index.json'), 'utf8'))), fixture).toBe('unsupported-format-version')
    }
  })

  it('lets the errors of fact-kit through when the package is not installed', () => {
    expect(() => readDocs('missing-docs/main', { root: new Project('read-missing').dir })).toThrow(/cannot resolve/)
  })
})

describe('impactOf finds the documents that cite a fact', () => {
  const FACT_SRC = `export const radius = { id: 'acme.buttons.radius', title: 'R', content: { value: 4 } }\n`
  const DOC = `import { doc, section, text, factBlock, scenario } from '${SRC}'
import { radius } from './facts-src.ts'

const part = 'acme.buttons'
export default doc({
  id: 'guide',
  title: 'Guide',
  status: 'draft',
  sections: [
    section('s', 'S', [
      factBlock({ facts: 'acme.buttons.radius' }),
      scenario({ scenario: 'S', expected: 'E', judgement: 'J', facts: ['acme.buttons.shadow', 'acme.buttons.radius'] }),
      text('Mentions fact:acme.buttons.radius inline.'),
      factBlock({ facts: [radius] }),
      factBlock({ facts: part + '.radius' }),
      text('Other fact:acme.buttons.shadow only.'),
    ]),
  ],
})
`
  const make = (label: string) => {
    const p = new Project(label)
    p.write('fact-kit.config.json', JSON.stringify({ docsDirs: ['docs'] }))
    p.write('dist/acme/index.json', readFileSync(join(FIXTURES, 'facts-2x', 'acme', 'index.json'), 'utf8'))
    p.write('docs/main/facts-src.ts', FACT_SRC)
    p.write('docs/main/guide.doc.ts', DOC)
    p.write('docs/main/notes.ts', `// not a document\nexport const s = 'acme.buttons.radius'\n`)
    return p
  }
  const lines = (impact: { docs: { file: string; line: number; id: string }[] }, file = 'docs/main/guide.doc.ts') =>
    impact.docs.filter((d) => d.file === file).map((d) => d.line)

  it('reports nothing for the document when no extractor is registered', async () => {
    const p = make('impact-none')
    const impact = await impactOf('acme.buttons.radius', { cwd: p.dir })
    // the extractors of fact-kit itself see the import of the fact object, but no call to get, value or has
    expect(lines(impact)).toEqual([2])
  })

  it('reports the document and the line of each id, fact object and fact: reference once registered', async () => {
    const p = make('impact-registered')
    const unregister = registerDocImpactExtractor(p.dir)
    try {
      const impact = await impactOf('acme.buttons.radius', { cwd: p.dir })
      // line 11 factBlock, 12 scenario, 13 text, 14 the fact object; 2 is the import found by fact-kit itself
      expect(lines(impact)).toEqual([2, 11, 12, 13, 14])
      expect(impact.docs.every((d) => d.id === 'acme.buttons.radius')).toBe(true)
      // the computed id on line 15 and the file that is not a document are not reported
      expect(lines(impact, 'docs/main/notes.ts')).toEqual([])
      const shadow = await impactOf('acme.buttons.shadow', { cwd: p.dir })
      expect(lines(shadow)).toEqual([12, 16])
    } finally {
      unregister()
    }
    expect(lines(await impactOf('acme.buttons.radius', { cwd: p.dir }))).toEqual([2])
  })

  it('takes the extractor as a value for one call, and skips every file that is not a .doc.ts', async () => {
    const p = make('impact-value')
    const impact = await impactOf('acme.buttons.radius', { cwd: p.dir, extractors: [docImpactExtractor(p.dir)] })
    expect(lines(impact)).toEqual([2, 11, 12, 13, 14])
    expect(lines(impact, 'docs/main/notes.ts')).toEqual([])
    const direct = docImpactExtractor(p.dir)
    expect(direct.extract({ file: 'docs/main/notes.ts', text: DOC, lookup: (r) => r })).toEqual([])
  })
})

describe('render', () => {
  const DOC = `doc({
  id: 'guide',
  title: 'Guide',
  status: 'draft',
  sections: [
    section('s', 'The section', [
      text('Plain text.'),
      list(['one', 'two']),
      table(['a', 'b'], [['1', '2|3']]),
      factBlock({ facts: ['acme.buttons.radius', 'acme.buttons.shadow'], renderer: 'render-test' }),
      factBlock({ facts: 'acme.buttons.radius' }),
      scenario({ scenario: 'S', expected: 'E', judgement: 'J' }),
      code('ts', 'const a = 1'),
      asset('a.png', { alt: 'A' }),
    ]),
  ],
})`
  const MODULE = `import { registerRenderer } from '${SRC}'
registerRenderer('render-test', (fact, context) => 'RENDERED ' + fact.id + ' ' + JSON.stringify(context))
`
  const make = (label: string, extra: Record<string, unknown> = {}) =>
    new Project(label)
      .install('facts-2x')
      .config({ factSources: ['acme-facts-2x/acme'], modules: ['./render-module.ts'], ...extra })
      .write('render-module.ts', MODULE)
      .entry()
      .doc('docs/main/guide.doc.ts', 'doc, section, text, list, table, factBlock, scenario, code, asset', DOC)
  const outside = (): string => mkdtempSync(join(tmpdir(), 'clarify-kit-test-out-'))

  it('writes Markdown under the system temp directory, adds no file to the work tree, and calls the registered renderer', () => {
    const p = make('render-default')
    const before = gitStatus()
    const r = cli(p, 'render')
    expect(r.status).toBe(0)
    const dir = /^rendered 1 document to (.+)\n$/.exec(r.out)?.[1] as string
    try {
      expect(realpathSync(dir).startsWith(realpathSync(tmpdir()))).toBe(true)
      expect(gitStatus()).toBe(before)
      expect(existsSync(join(p.dir, 'guide.md'))).toBe(false)
      const md = readFileSync(join(dir, 'main', 'guide.md'), 'utf8')
      expect(md).toContain('# Guide\n\n## The section\n')
      expect(md).toContain('Plain text.\n\n- one\n- two\n\n| a | b |\n| --- | --- |\n| 1 | 2\\|3 |')
      expect(md).toContain('RENDERED acme.buttons.radius {"version":"head","include":[],"document":{"id":"guide","type":"doc"},"section":"s"}')
      // the shadow fact is pending, so a reader without its label does not see it
      expect(md).not.toContain('RENDERED acme.buttons.shadow')
      expect(md).toContain('**Button radius** (`acme.buttons.radius`)')
      expect(md).toContain('```ts\nconst a = 1\n```')
      expect(md).toContain('![A](a.png)')
      expect(md).toContain('**Scenario:** S')
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('passes version and include to the renderer and shows the pending fact to a reader that includes its label', () => {
    const p = make('render-include')
    const out = outside()
    try {
      expect(cli(p, 'render', '--out', out, '--include', 'shadows', '--include', 'extra').status).toBe(0)
      const md = readFileSync(join(out, 'main', 'guide.md'), 'utf8')
      expect(md).toContain('RENDERED acme.buttons.shadow {"version":"head","include":["shadows","extra"]')
      expect(cli(p, 'render', '--out', out, '--version', '2.0.0').status).toBe(0)
      const old = readFileSync(join(out, 'main', 'guide.md'), 'utf8')
      expect(old).toContain('"version":"2.0.0","include":[]')
      expect(old).not.toContain('acme.buttons.shadow')
    } finally {
      rmSync(out, { recursive: true, force: true })
    }
  })

  it('refuses --out inside a git work tree, writes nothing there and exits 1', () => {
    const p = make('render-inside')
    const before = gitStatus()
    const r = cli(p, 'render', '--out', p.path('rendered'))
    expect(r.status).toBe(1)
    expect(r.err).toMatch(/inside a git work tree/)
    expect(existsSync(p.path('rendered'))).toBe(false)
    expect(cli(p, 'render', '--out', REPO).status).toBe(1)
    expect(cli(p, 'render', '--out', join(REPO, 'new-dir', 'deeper')).status).toBe(1)
    expect(existsSync(join(REPO, 'new-dir'))).toBe(false)
    expect(gitStatus()).toBe(before)
  })

  it('refuses --out under the git directory, creates nothing there and exits 1', () => {
    const p = make('render-gitdir')
    const gitDir = join(REPO, '.git')
    const before = readdirSync(gitDir).sort()
    const r = cli(p, 'render', '--out', join(gitDir, 'clarify-render-guard', 'deeper'))
    expect(r.status).toBe(1)
    expect(r.err).toMatch(/git directory/)
    expect(cli(p, 'render', '--out', gitDir).status).toBe(1)
    expect(readdirSync(gitDir).sort()).toEqual(before)
  })

  it('exits 2 with a clear message for a --out that is a dangling symbolic link', () => {
    const p = make('render-dangling')
    const holder = outside()
    try {
      const link = join(holder, 'link')
      symlinkSync(join(holder, 'missing'), link)
      const r = cli(p, 'render', '--out', link)
      expect(r.status).toBe(2)
      expect(r.err).toContain('cannot resolve the output location')
      expect(r.err).not.toContain('unexpected error')
      const deeper = cli(p, 'render', '--out', join(link, 'sub'))
      expect(deeper.status).toBe(2)
      expect(deeper.err).not.toContain('unexpected error')
    } finally {
      rmSync(holder, { recursive: true, force: true })
    }
  })

  it('refuses --out when git can not be found, and still renders to the default location', () => {
    const p = make('render-no-git')
    const noGit = outside()
    const out = outside()
    const env = { ...process.env, PATH: noGit }
    const run2 = (...args: string[]) => {
      const r = spawnSync(process.execPath, [CLI, ...args], { cwd: p.dir, encoding: 'utf8', env })
      return { status: r.status, out: r.stdout, err: r.stderr }
    }
    try {
      const refused = run2('render', '--out', join(out, 'x'))
      expect(refused.status).toBe(1)
      expect(refused.err).toMatch(/git is not available/)
      expect(existsSync(join(out, 'x'))).toBe(false)
      const ok = run2('render')
      expect(ok.status).toBe(0)
      const dir = /^rendered 1 document to (.+)\n$/.exec(ok.out)?.[1] as string
      rmSync(dir, { recursive: true, force: true })
    } finally {
      rmSync(noGit, { recursive: true, force: true })
      rmSync(out, { recursive: true, force: true })
    }
  })

  it('accepts --out outside every work tree, a directory that does not exist yet included', () => {
    const p = make('render-outside')
    const out = outside()
    try {
      expect(cli(p, 'render', '--out', join(out, 'a', 'b')).status).toBe(0)
      expect(readdirSync(join(out, 'a', 'b', 'main'))).toEqual(['guide.md'])
    } finally {
      rmSync(out, { recursive: true, force: true })
    }
  })

  it('exits 2 for a renderer no module registered and for a fact no package has', () => {
    const out = outside()
    try {
      const noModule = make('render-no-module', { modules: [] })
      const a = cli(noModule, 'render', '--out', out)
      expect(a.status).toBe(2)
      expect(a.err).toContain('"render-test"')
      const noFact = make('render-no-fact', { factSources: [] })
      const b = cli(noFact, 'render', '--out', out)
      expect(b.status).toBe(2)
      expect(b.err).toContain('acme.buttons.radius')
    } finally {
      rmSync(out, { recursive: true, force: true })
    }
  })

  it('calls a renderer registered in this process, once per fact of a fact block, with the context', async () => {
    const calls: [string, RenderContext][] = []
    registerRenderer('render-spy', (fact, context) => {
      calls.push([fact.id, context])
      return `spy ${fact.id}`
    })
    const p = new Project('render-spy')
      .install('facts-2x')
      .config({ factSources: ['acme-facts-2x/acme'] })
      .entry()
      .doc('docs/main/guide.doc.ts', 'doc, section, factBlock', `doc({ id: 'guide', title: 'G', status: 'draft', sections: [section('first', 'F', [factBlock({ facts: ['acme.buttons.radius', 'acme.buttons.shadow'], renderer: 'render-spy' })])] })`)
    const out = outside()
    try {
      const result = await renderProject(readConfig(undefined, p.dir), { out, include: ['shadows'] })
      expect(result.written).toEqual([join(out, 'main', 'guide.md')])
      expect(calls.map(([id]) => id)).toEqual(['acme.buttons.radius', 'acme.buttons.shadow'])
      expect(calls[0]?.[1]).toEqual({ version: 'head', include: ['shadows'], document: { id: 'guide', type: 'doc' }, section: 'first' })
      expect(readFileSync(result.written[0] as string, 'utf8')).toContain('spy acme.buttons.radius\n\nspy acme.buttons.shadow')
    } finally {
      rmSync(out, { recursive: true, force: true })
    }
  })

  it('leaves out of the files a section or block the reader does not see', async () => {
    const p = new Project('render-select')
      .config()
      .entry()
      .doc('docs/main/guide.doc.ts', 'doc, section, text', `doc({ id: 'guide', title: 'G', status: 'draft', sections: [section('s', 'S', [text('old', { since: '0.1.0' }), text('new', { since: '0.2.0' })])] })`)
    const out = outside()
    try {
      const result = await renderProject(readConfig(undefined, p.dir), { out, version: '0.1.0' })
      const md = readFileSync(result.written[0] as string, 'utf8')
      expect(md).toContain('old')
      expect(md).not.toContain('new')
    } finally {
      rmSync(out, { recursive: true, force: true })
    }
  })
})

describe('merge-since on documents', () => {
  const git = (cwd: string, ...args: string[]): string =>
    execFileSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@example.com', '-c', 'commit.gpgsign=false', '-c', 'init.defaultBranch=main', ...args], {
      cwd,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    })
  const FACT = (since: string, extra = '') => `export default [
  {
    id: 'acme.x',
    title: 'X',
    since: ${since},
  },${extra}
]
`
  const DOC = (since: string, extra = '') => `export default doc({
  id: 'x',
  title: 'X',
  status: 'draft',
  sections: [section('s', 'S', [
    text('t', {
      since: ${since},
    }),${extra}
  ])],
})
`
  const sinceOf = (source: string): string[] =>
    [...source.matchAll(/since: (\[[^\]]*\]|'[^']*')/g)].map((m) => (m[1] as string).replaceAll('"', "'"))

  it('settles two branches that each pinned the same since to another version, in a .doc.ts as in a .facts.ts', async () => {
    const p = new Project('merge-since')
    p.write('facts/x.facts.ts', FACT("'next'"))
    p.write('docs/main/x.doc.ts', DOC("'next'"))
    git(p.dir, 'init', '-q')
    git(p.dir, 'add', '.')
    git(p.dir, 'commit', '-q', '-m', 'base')
    git(p.dir, 'checkout', '-q', '-b', 'side')
    p.write('facts/x.facts.ts', FACT("'0.2.0'"))
    p.write('docs/main/x.doc.ts', DOC("'0.2.0'"))
    git(p.dir, 'commit', '-q', '-am', 'side')
    git(p.dir, 'checkout', '-q', 'main')
    p.write('facts/x.facts.ts', FACT("'0.3.0'"))
    p.write('docs/main/x.doc.ts', DOC("'0.3.0'"))
    git(p.dir, 'commit', '-q', '-am', 'main')
    expect(() => git(p.dir, 'merge', '--no-commit', 'side')).toThrow()
    expect(p.read('docs/main/x.doc.ts')).toContain('<<<<<<<')
    const result = await mergeSince({ cwd: p.dir })
    expect(result.unresolved).toEqual([])
    expect(result.resolved.map((r) => [r.file, r.blocks]).sort()).toEqual([['docs/main/x.doc.ts', 1], ['facts/x.facts.ts', 1]])
    expect(p.read('docs/main/x.doc.ts')).not.toContain('<<<<<<<')
    expect(sinceOf(p.read('docs/main/x.doc.ts'))).toEqual(["['0.2.0', '0.3.0']"])
    expect(sinceOf(p.read('docs/main/x.doc.ts'))).toEqual(sinceOf(p.read('facts/x.facts.ts')))
  })

  it('takes the smaller version when both branches pin a version of the same release line', async () => {
    const p = new Project('merge-same-line')
    p.write('facts/x.facts.ts', FACT("'next'"))
    p.write('docs/main/x.doc.ts', DOC("'next'"))
    git(p.dir, 'init', '-q')
    git(p.dir, 'add', '.')
    git(p.dir, 'commit', '-q', '-m', 'base')
    git(p.dir, 'checkout', '-q', '-b', 'side')
    p.write('facts/x.facts.ts', FACT("'0.2.1'"))
    p.write('docs/main/x.doc.ts', DOC("'0.2.1'"))
    git(p.dir, 'commit', '-q', '-am', 'side')
    git(p.dir, 'checkout', '-q', 'main')
    p.write('facts/x.facts.ts', FACT("'0.2.0'"))
    p.write('docs/main/x.doc.ts', DOC("'0.2.0'"))
    git(p.dir, 'commit', '-q', '-am', 'main')
    expect(() => git(p.dir, 'merge', '--no-commit', 'side')).toThrow()
    const result = await mergeSince({ cwd: p.dir })
    expect(result.unresolved).toEqual([])
    expect(sinceOf(p.read('docs/main/x.doc.ts'))).toEqual(["'0.2.0'"])
    expect(sinceOf(p.read('docs/main/x.doc.ts'))).toEqual(sinceOf(p.read('facts/x.facts.ts')))
  })

  it('rewrites a patch version only the merged-in side has to [version, next], in a .doc.ts as in a .facts.ts', async () => {
    const p = new Project('merge-normalize')
    p.write('facts/x.facts.ts', FACT("'0.1.0'"))
    p.write('docs/main/x.doc.ts', DOC("'0.1.0'"))
    git(p.dir, 'init', '-q')
    git(p.dir, 'add', '.')
    git(p.dir, 'commit', '-q', '-m', 'base')
    git(p.dir, 'checkout', '-q', '-b', 'side')
    p.write('facts/x.facts.ts', FACT("'0.1.0'", "\n  { id: 'acme.y', title: 'Y', since: '0.1.1' },"))
    p.write('docs/main/x.doc.ts', DOC("'0.1.0'", "\n    text('u', { since: '0.1.1' }),"))
    git(p.dir, 'commit', '-q', '-am', 'side')
    git(p.dir, 'checkout', '-q', 'main')
    p.write('README.md', 'main moved on\n')
    git(p.dir, 'add', '.')
    git(p.dir, 'commit', '-q', '-m', 'main')
    git(p.dir, 'merge', '--no-commit', '--no-ff', 'side')
    const result = await mergeSince({ cwd: p.dir })
    expect(result.unresolved).toEqual([])
    expect(result.normalized.map((n) => [n.file, n.from, n.to]).sort()).toEqual([
      ['docs/main/x.doc.ts', "'0.1.1'", "['0.1.1', 'next']"],
      ['facts/x.facts.ts', "'0.1.1'", "['0.1.1', 'next']"],
    ])
    expect(sinceOf(p.read('docs/main/x.doc.ts'))).toEqual(["'0.1.0'", "['0.1.1', 'next']"])
    expect(sinceOf(p.read('facts/x.facts.ts'))).toEqual(["'0.1.0'", "['0.1.1', 'next']"])
  })
})
