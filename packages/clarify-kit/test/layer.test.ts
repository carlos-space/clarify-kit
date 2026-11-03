// The layer of an entry and of the sources it cites, the `doc:` reference, and the 1.0 and 1.1 docs index.
// Every sample is one test, so a reporter that lists tests shows one line per sample.
import { spawnSync } from 'node:child_process'
import { afterAll, describe, expect, it } from 'vitest'
import { buildProject, checkProject, readConfig, readDocs } from '../src/index.ts'
import type { Problem } from '../src/index.ts'
import { CLI, Project, cleanup } from './helpers.ts'

afterAll(cleanup)

const check = (p: Project): Promise<Problem[]> => checkProject(readConfig(undefined, p.dir))
const brief = (problems: Problem[]): string[][] => problems.map((x) => [x.code, x.location])

/** A document that cites one fact with a fact block. */
const citesFact = (id: string): string =>
  `doc({ id: 'c', title: 'C', status: 'draft', sections: [section('s', 'S', [factBlock({ facts: ['${id}'] })])] })`
/** A document that cites one document with `doc:<ref>`. */
const citesDoc = (ref: string): string =>
  `doc({ id: 'c', title: 'C', status: 'draft', sections: [section('s', 'S', [text('see doc:${ref}')])] })`

/** A project whose entry is in layer `from`, citing a fact (`kind` fact) or a document (`kind` doc) of a package in layer `to`. */
function cite(label: string, kind: 'fact' | 'doc', from: string | null, to: string | undefined, name = 'src'): Project {
  const p = new Project(label).entry('main', { acme: '1.0.0' }, from)
  if (kind === 'fact') {
    p.factsPackage(`${name}-facts`, ['src.thing.x'], to).config({ factSources: [`${name}-facts/acme`] })
    p.doc('docs/main/c.doc.ts', 'doc, section, factBlock', citesFact('src.thing.x'))
  } else {
    p.docsPackage(`${name}-docs`, ['target'], to).config({ docSources: [`${name}-docs/main`] })
    p.doc('docs/main/c.doc.ts', 'doc, section, text', citesDoc(`${name}-docs/main#target`))
  }
  return p
}

const KINDS = ['fact', 'doc'] as const

describe('a document cites a source of its own layer or above, or a tool', () => {
  const samples: [string, string, string, string?][] = [
    ['implementation cites product', 'implementation', 'product'],
    ['product cites org', 'product', 'org'],
    ['implementation cites org', 'implementation', 'org'],
    ['product cites product', 'product', 'product'],
    ['org cites org', 'org', 'org'],
    ['org cites a third-party tool', 'org', 'tool', 'fact-kit'],
    ['org cites another product of its own that declares tool', 'org', 'tool', 'other-product'],
    ['implementation cites a tool', 'implementation', 'tool'],
  ]
  for (const kind of KINDS) {
    for (const [name, from, to, source] of samples) {
      it(`passes: ${name} (${kind})`, async () => {
        expect(await check(cite(`pass-${kind}`, kind, from, to, source))).toEqual([])
      })
    }
  }
})

describe('a document cites a source below its layer', () => {
  const samples: [string, string, string][] = [
    ['product cites implementation', 'product', 'implementation'],
    ['org cites product', 'org', 'product'],
    ['org cites implementation', 'org', 'implementation'],
  ]
  for (const kind of KINDS) {
    for (const [name, from, to] of samples) {
      it(`reports cites-lower-layer: ${name} (${kind})`, async () => {
        const problems = await check(cite(`lower-${kind}`, kind, from, to))
        expect(brief(problems)).toEqual([['cites-lower-layer', 'docs/main/c.doc.ts']])
        expect(problems[0]?.message).toContain(`"${from}"`)
        expect(problems[0]?.message).toContain(`"${to}"`)
      })
    }
  }

  it('cites-lower-layer points at the citing document only, one problem for each document', async () => {
    const p = cite('lower-two', 'fact', 'product', 'implementation')
    p.doc('docs/main/d.doc.ts', 'doc, section, factBlock', citesFact('src.thing.x').replace("id: 'c'", "id: 'd'"))
    expect(brief(await check(p))).toEqual([
      ['cites-lower-layer', 'docs/main/c.doc.ts'],
      ['cites-lower-layer', 'docs/main/d.doc.ts'],
    ])
  })
})

describe('a layer that is missing', () => {
  it('reports undeclared-layer when the entry declares no layer, at its index.ts', async () => {
    const p = new Project('no-layer').config().entry('main', { acme: '1.0.0' }, null)
    p.doc('docs/main/a.doc.ts', 'doc, section, text', `doc({ id: 'a', title: 'A', status: 'draft', sections: [section('s', 'S', [text('t')])] })`)
    expect(brief(await check(p))).toEqual([['undeclared-layer', 'docs/main/index.ts']])
  })

  it('fails the build of an entry without a layer, and writes nothing', async () => {
    const p = new Project('no-layer-build').config().entry('main', { acme: '1.0.0' }, null)
    const result = await buildProject(readConfig(undefined, p.dir))
    expect(result.ok).toBe(false)
    expect(result.written).toEqual([])
    const cli = spawnSync(process.execPath, [CLI, 'build'], { cwd: p.dir, encoding: 'utf8' })
    expect(cli.status).toBe(1)
    expect(() => p.read('dist/main/index.json')).toThrow()
  })

  it('refuses a layer that is not one of the four, as a load error', async () => {
    const p = new Project('bad-layer').config().entry('main', { acme: '1.0.0' }, 'team')
    expect(brief(await check(p))).toEqual([['load-error', 'docs/main/index.ts']])
  })

  for (const kind of KINDS) {
    it(`reports undeclared-layer at the citing document when the source has no layer (${kind})`, async () => {
      const problems = await check(cite(`src-no-layer-${kind}`, kind, 'product', undefined))
      expect(brief(problems)).toEqual([['undeclared-layer', 'docs/main/c.doc.ts']])
      expect(problems[0]?.message).toContain('src-')
    })
  }
})

describe('the layer a config gives a source', () => {
  for (const kind of KINDS) {
    const source = kind === 'fact' ? 'src-facts/acme' : 'src-docs/main'
    const key = kind === 'fact' ? 'factSources' : 'docSources'
    it(`stands in for an index without a layer (${kind})`, async () => {
      const p = cite(`config-layer-${kind}`, kind, 'product', undefined)
      p.config({ [key]: [{ source, layer: 'org' }] })
      expect(await check(p)).toEqual([])
    })
    it(`is used for the comparison too, so a config layer below the entry is cites-lower-layer (${kind})`, async () => {
      const p = cite(`config-lower-${kind}`, kind, 'product', undefined)
      p.config({ [key]: [{ source, layer: 'implementation' }] })
      expect(brief(await check(p))).toEqual([['cites-lower-layer', 'docs/main/c.doc.ts']])
    })
    it(`reports layer-mismatch when the config and the index have different layers (${kind})`, async () => {
      const p = cite(`mismatch-${kind}`, kind, 'product', 'org')
      p.config({ [key]: [{ source, layer: 'implementation' }] })
      const problems = await check(p)
      expect(brief(problems)).toEqual([['layer-mismatch', 'clarify-kit.config.json']])
      expect(problems[0]?.message).toMatch(/"implementation".*"org"/)
    })
    it(`does not report when the config and the index agree (${kind})`, async () => {
      const p = cite(`agree-${kind}`, kind, 'product', 'org')
      p.config({ [key]: [{ source, layer: 'org' }] })
      expect(await check(p)).toEqual([])
    })
  }

  it('refuses a config source without a valid layer, or with an unknown field, as an input error', () => {
    const p = new Project('config-bad')
    for (const bad of [{ source: 'a/b' }, { source: 'a/b', layer: 'team' }, { source: 'a/b', layer: 'org', extra: 1 }, 7]) {
      p.config({ factSources: [bad] })
      expect(() => readConfig(undefined, p.dir), JSON.stringify(bad)).toThrow(/factSources\[0\]/)
    }
  })

  it('reads strings and objects in both lists', () => {
    const p = new Project('config-both').config({
      factSources: ['a-facts/x', { source: 'b-facts/x', layer: 'tool' }],
      docSources: [{ source: 'c-docs/x', layer: 'org' }],
    })
    expect(readConfig(undefined, p.dir)).toMatchObject({
      factSources: ['a-facts/x', 'b-facts/x'],
      docSources: ['c-docs/x'],
      sourceLayers: { 'b-facts/x': 'tool', 'c-docs/x': 'org' },
    })
  })
})

describe('doc:<target>#<id>', () => {
  const two = (label: string): Project =>
    new Project(label).config().entry('main').entry('other', { acme: '1.0.0' }, 'implementation')
  const other = (p: Project): Project =>
    p.doc('docs/other/o.doc.ts', 'doc, section, text', `doc({ id: 'o', title: 'O', status: 'draft', sections: [section('s', 'S', [text('t')])] })`)

  it('finds a document of another entry of the project by its entry name', async () => {
    const p = other(two('doc-local')).doc('docs/main/c.doc.ts', 'doc, section, text', citesDoc('other#o'))
    expect(await check(p)).toEqual([])
  })

  it('finds a document of a nested entry by its path below docsDir', async () => {
    const p = new Project('doc-nested').config().entry('main').entry('main/inner', { acme: '1.0.0' }, 'implementation')
    p.doc('docs/main/inner/o.doc.ts', 'doc, section, text', `doc({ id: 'o', title: 'O', status: 'draft', sections: [section('s', 'S', [text('t')])] })`)
      .doc('docs/main/c.doc.ts', 'doc, section, text', citesDoc('main/inner#o'))
    expect(await check(p)).toEqual([])
  })

  it('reports unknown-doc-reference for an id the entry does not have', async () => {
    const p = other(two('doc-no-id')).doc('docs/main/c.doc.ts', 'doc, section, text', citesDoc('other#nope'))
    expect(brief(await check(p))).toEqual([['unknown-doc-reference', 'docs/main/c.doc.ts']])
  })

  it('reports unknown-doc-reference for a target that is no entry and no docSources package', async () => {
    const p = other(two('doc-no-target')).doc('docs/main/c.doc.ts', 'doc, section, text', citesDoc('nowhere#o'))
    expect(brief(await check(p))).toEqual([['unknown-doc-reference', 'docs/main/c.doc.ts']])
  })

  it('reports unknown-doc-reference for an installed package that is not in docSources', async () => {
    const p = new Project('doc-not-listed').config().entry('main').docsPackage('src-docs', ['target'], 'org')
    p.doc('docs/main/c.doc.ts', 'doc, section, text', citesDoc('src-docs/main#target'))
    expect(brief(await check(p))).toEqual([['unknown-doc-reference', 'docs/main/c.doc.ts']])
  })

  it('reports unknown-doc-reference for an id the installed package does not have', async () => {
    const p = cite('doc-installed-no-id', 'doc', 'product', 'org')
    p.doc('docs/main/c.doc.ts', 'doc, section, text', citesDoc('src-docs/main#missing'))
    expect(brief(await check(p))).toEqual([['unknown-doc-reference', 'docs/main/c.doc.ts']])
  })

  it('compares the layer of a local entry too: an implementation entry cited by a product entry is cites-lower-layer', async () => {
    const p = new Project('doc-local-lower').config().entry('main', { acme: '1.0.0' }, 'product').entry('other', { acme: '1.0.0' }, 'implementation')
    other(p).doc('docs/main/c.doc.ts', 'doc, section, text', citesDoc('other#o'))
    expect(brief(await check(p))).toEqual([['cites-lower-layer', 'docs/main/c.doc.ts']])
  })

  it('records docRefs in the index, in the order of first use and each once, and an empty list when there is none', async () => {
    const p = other(two('doc-refs')).doc(
      'docs/main/c.doc.ts',
      'doc, section, text',
      `doc({ id: 'c', title: 'C', status: 'draft', sections: [
        section('s', 'S', [text('first doc:other#o and fact:acme.x.y'), text('again doc:other#o, then doc:main#plain.')]),
        section('t', 'T', [text('a doc:main#plain')])] })`,
    ).doc('docs/main/plain.doc.ts', 'doc, section, text', `doc({ id: 'plain', title: 'P', status: 'draft', sections: [section('s', 'S', [text('t')])] })`)
    expect((await buildProject(readConfig(undefined, p.dir))).ok).toBe(true)
    const docs = p.json('dist/main/index.json').docs as { id: string; docRefs: string[]; factRefs: string[] }[]
    expect(docs.find((d) => d.id === 'c')).toMatchObject({ docRefs: ['other#o', 'main#plain'], factRefs: ['acme.x.y'] })
    expect(docs.find((d) => d.id === 'plain')?.docRefs).toEqual([])
  })

  it('does not take doc: inside a longer word, or without an id, as a reference', async () => {
    const p = other(two('doc-not-ref')).doc('docs/main/c.doc.ts', 'doc, section, text', citesDoc('other#o').replace('see ', 'undoc:x#y and doc:other and doc:#o and '))
    expect(await check(p)).toEqual([])
    expect((await buildProject(readConfig(undefined, p.dir))).ok).toBe(true)
    expect(p.json('dist/main/index.json').docs[0].docRefs).toEqual(['other#o'])
  })
})

describe('the docs index of format 1.0 and 1.1', () => {
  const install = (label: string, layer: string | undefined): Project => {
    const r = new Project(label).docsPackage('acme-docs', ['guide'], layer)
    return r
  }

  it('reads a 1.0 index built by 0.2.0, which has no layer', () => {
    const r = new Project('read-10').install('docs-1x')
    const reader = readDocs('acme-docs-1x/main', { root: r.dir })
    expect(r.json('node_modules/acme-docs-1x/main/index.json').formatVersion).toBe('1.0')
    expect(reader.layer).toBeUndefined()
    expect(reader.get('guide').id).toBe('guide')
    expect(reader.get('guide').docRefs).toEqual([])
  })

  it('reads a 1.1 index with its layer', () => {
    const r = install('read-11', 'product')
    const reader = readDocs('acme-docs/main', { root: r.dir })
    expect(r.json('node_modules/acme-docs/main/index.json').formatVersion).toBe('1.1')
    expect(reader.layer).toBe('product')
    expect(reader.has('guide')).toBe(true)
  })

  it('reads an index that build wrote, with the layer of the entry', async () => {
    const authored = new Project('read-built').config().entry('main', { acme: '1.0.0' }, 'org')
    authored.doc('docs/main/guide.doc.ts', 'doc, section, text', `doc({ id: 'guide', title: 'G', status: 'active', sections: [section('s', 'S', [text('t')])] })`)
    await buildProject(readConfig(undefined, authored.dir))
    const r = new Project('read-built-reader')
    r.write('node_modules/acme-docs/package.json', JSON.stringify({ name: 'acme-docs', version: '1.0.0', exports: { './main/index.json': './main/index.json' } }))
    r.write('node_modules/acme-docs/main/index.json', authored.read('dist/main/index.json'))
    const reader = readDocs('acme-docs/main', { root: r.dir })
    expect(reader.layer).toBe('org')
    expect(authored.json('dist/main/index.json')).toMatchObject({ formatVersion: '1.1', layer: 'org' })
  })

  it('refuses an index whose layer is not a layer, and a format whose major is not 1', () => {
    const r = install('read-bad', 'team')
    expect(() => readDocs('acme-docs/main', { root: r.dir })).toThrow(/not a layer/)
    const q = install('read-major', undefined)
    q.write('node_modules/acme-docs/main/index.json', JSON.stringify({ formatVersion: '2.0', docs: [] }))
    expect(() => readDocs('acme-docs/main', { root: q.dir })).toThrow(/takes 1\.x/)
  })
})
