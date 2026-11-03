import { afterAll, describe, expect, it } from 'vitest'
import { buildProject, checkProject, loadProject, readConfig } from '../src/index.ts'
import type { Document, Problem } from '../src/index.ts'
import { Project, cleanup } from './helpers.ts'

afterAll(cleanup)

const A = `doc({ id: 'a', title: 'A', status: 'draft', sections: [section('s', 'S', [text('t')])] })`
const loadSample = async (name: string): Promise<Document> =>
  ((await import(`./samples/${name}.doc.ts`)) as { default: Document }).default
const check = (p: Project): Promise<Problem[]> => checkProject(readConfig(undefined, p.dir))
const codes = (problems: Problem[]): string[] => problems.map((x) => x.code)

describe('the entry rule', () => {
  const entries = async (p: Project) => (await loadProject(readConfig(undefined, p.dir))).entries
  const ids = (e: { documents: { document: { id: string } }[] }): string[] => e.documents.map((d) => d.document.id)
  const one = (id: string): string => `doc({ id: '${id}', title: 'T', status: 'draft', sections: [section('s', 'S', [text('t')])] })`

  it('takes the directory of an index.ts as an entry and collects the *.doc.ts of it and below it, sorted by relative path', async () => {
    const p = new Project('order').config().entry()
    for (const [file, id] of [
      ['z/c.doc.ts', 'in-z'],
      ['b.doc.ts', 'b'],
      ['b/x.doc.ts', 'in-b'],
      ['a.doc.ts', 'a'],
    ] as const) {
      p.doc(`docs/main/${file}`, 'doc, section, text', one(id))
    }
    const [main, ...others] = await entries(p)
    expect(others).toEqual([])
    expect(main?.name).toBe('main')
    expect(main?.entry).toEqual({ describes: { acme: '1.0.0' }, publish: { target: 'npm', name: 'acme-docs' } })
    expect(ids(main!)).toEqual(['a', 'b', 'in-b', 'in-z'])
    expect(main?.documents.map((d) => d.location)).toEqual(['docs/main/a.doc.ts', 'docs/main/b.doc.ts', 'docs/main/b/x.doc.ts', 'docs/main/z/c.doc.ts'])
    expect(ids((await entries(p))[0]!)).toEqual(ids(main!))
  })

  it('gives the files below a nested index.ts to the nested entry', async () => {
    const p = new Project('nested').config().entry('main').entry('main/inner', { acme: '2.0.0' })
    p.doc('docs/main/a.doc.ts', 'doc, section, text', one('outer')).doc('docs/main/inner/b.doc.ts', 'doc, section, text', one('inner'))
    const found = await entries(p)
    expect(found.map((e) => e.name)).toEqual(['main', 'main/inner'])
    expect(ids(found[0]!)).toEqual(['outer'])
    expect(ids(found[1]!)).toEqual(['inner'])
    expect(found[1]?.entry?.describes).toEqual({ acme: '2.0.0' })
  })

  it('reports a *.doc.ts under no entry as outside-entry, and does not load it', async () => {
    const p = new Project('outside').config().entry()
    p.doc('docs/main/a.doc.ts', 'doc, section, text', one('a'))
      .doc('docs/loose.doc.ts', 'doc, section, text', one('loose'))
      .doc('docs/main/_hidden/h.doc.ts', 'doc, section, text', one('hidden'))
    const project = await loadProject(readConfig(undefined, p.dir))
    expect(project.problems.map((x) => [x.code, x.location])).toEqual([
      ['outside-entry', 'docs/loose.doc.ts'],
      ['outside-entry', 'docs/main/_hidden/h.doc.ts'],
    ])
    expect(ids(project.entries[0]!)).toEqual(['a'])
  })

  it('does not take docsDir itself as an entry', async () => {
    const p = new Project('root-index').config().write('docs/index.ts', 'export default {}\n')
    p.doc('docs/a.doc.ts', 'doc, section, text', one('a'))
    const project = await loadProject(readConfig(undefined, p.dir))
    expect(project.entries).toEqual([])
    expect(codes(project.problems)).toEqual(['outside-entry'])
  })

  it('reports a source that fails to load as load-error, and a default export that is not a document', async () => {
    const p = new Project('load-error').config().entry()
    p.write('docs/main/broken.doc.ts', 'throw new Error("boom")\n')
      .write('docs/main/plain.doc.ts', 'export default { id: "plain" }\n')
      .doc('docs/main/bad.doc.ts', 'doc, section, text', `doc({ id: 'bad', title: 'T', status: 'finished', sections: [section('s', 'S', [text('t')])] })`)
    const project = await loadProject(readConfig(undefined, p.dir))
    expect(project.problems.map((x) => [x.code, x.location])).toEqual([
      ['load-error', 'docs/main/bad.doc.ts'],
      ['load-error', 'docs/main/broken.doc.ts'],
      ['load-error', 'docs/main/plain.doc.ts'],
    ])
    expect(project.problems[0]?.message).toMatch(/status/)
  })

  it('refuses an index.ts whose describes or publish is wrong', async () => {
    const p = new Project('bad-entry').config()
    p.write('docs/main/index.ts', `export default { describes: { acme: 'one' }, publish: { target: 'npm', name: 'x' } }\n`)
    const project = await loadProject(readConfig(undefined, p.dir))
    expect(project.problems.map((x) => [x.code, x.location])).toEqual([['load-error', 'docs/main/index.ts']])
    expect(project.problems[0]?.message).toMatch(/semver/)
    expect(project.entries[0]?.entry).toBeUndefined()
  })
})

describe('build', () => {
  it('writes every sample of the four types and ten templates, with the six top-level fields', async () => {
    const p = new Project('build-samples').config().entry('main', { 'clarify-kit': '0.0.0' }).samples()
    const result = await buildProject(readConfig(undefined, p.dir))
    expect(result.ok).toBe(true)
    expect(result.problems).toEqual([])
    expect(result.written).toEqual([p.path('dist/main/index.json')])

    const index = p.json('dist/main/index.json')
    expect(Object.keys(index)).toEqual(['formatVersion', 'package', 'entry', 'describes', 'publish', 'docs'])
    expect(index.formatVersion).toBe('1.0')
    expect(index.package).toBe('acme-docs')
    expect(index.entry).toBe('main')
    expect(index.describes).toEqual({ 'clarify-kit': '0.0.0' })
    expect(index.publish).toEqual({ target: 'npm', name: 'acme-docs' })

    const samples = [
      'type-doc', 'type-requirement', 'type-decision', 'type-record',
      ...['vision', 'goal', 'problem', 'policy', 'concept', 'guide', 'example', 'research', 'retro', 'release'].map((t) => `template-${t}`),
      'blocks', 'topic-shared',
    ]
    // The sample of a custom template registers it when it is loaded, and a template can be registered once per process,
    // so it is only looked for in the index, not loaded a second time here.
    expect(index.docs).toHaveLength(samples.length + 1)
    expect(index.docs.find((d: { id: string }) => d.id === 'sample-acme-brand')).toMatchObject({ type: 'doc', template: 'acme-brand', status: 'active' })
    const byId = new Map<string, any>(index.docs.map((d: { id: string }) => [d.id, d]))
    for (const name of samples) {
      const sample = await loadSample(name)
      expect(byId.get(sample.id), name).toEqual(JSON.parse(JSON.stringify(sample)))
    }
    expect(index.docs.map((d: { type: string }) => d.type).filter((t: string, i: number, all: string[]) => all.indexOf(t) === i).sort()).toEqual(['decision', 'doc', 'record', 'requirement'])
  })

  it('writes the id, the factRefs and the template of each document, and the index of a nested entry under its path', async () => {
    const p = new Project('build-fields').config().entry().entry('main/inner')
    p.doc('docs/main/a.doc.ts', 'vision, section, text, factBlock', `vision({ id: 'v', title: 'V', status: 'draft', sections: [
      section('purpose', 'P', [text('see fact:acme.x.y'), factBlock({ facts: ['acme.x.z', 'acme.x.y'] })]),
      section('audience', 'A', [text('a')]), section('outcome', 'O', [text('o')])] })`)
      .doc('docs/main/b.doc.ts', 'doc, section, text', A)
      .doc('docs/main/inner/c.doc.ts', 'doc, section, text', A)
    const result = await buildProject(readConfig(undefined, p.dir))
    expect(result.written).toEqual([p.path('dist/main/index.json'), p.path('dist/main/inner/index.json')])
    const [v, a] = p.json('dist/main/index.json').docs
    expect(v).toMatchObject({ id: 'v', template: 'vision', factRefs: ['acme.x.y', 'acme.x.z'] })
    expect(a.id).toBe('a')
    expect('template' in a).toBe(false)
    expect(a.factRefs).toEqual([])
    expect(p.json('dist/main/inner/index.json').entry).toBe('main/inner')
  })

  it('writes nothing when a source fails to load, and only warns about a file outside every entry', async () => {
    const p = new Project('build-fail').config().entry()
    p.doc('docs/main/a.doc.ts', 'doc, section, text', A).write('docs/main/broken.doc.ts', 'throw new Error("boom")\n')
    const failed = await buildProject(readConfig(undefined, p.dir))
    expect(failed.ok).toBe(false)
    expect(codes(failed.problems)).toEqual(['load-error'])
    expect(failed.written).toEqual([])
    expect(() => p.read('dist/main/index.json')).toThrow()

    const q = new Project('build-warn').config().entry()
    q.doc('docs/main/a.doc.ts', 'doc, section, text', A).doc('docs/loose.doc.ts', 'doc, section, text', A)
    const warned = await buildProject(readConfig(undefined, q.dir))
    expect(warned.ok).toBe(true)
    expect(codes(warned.problems)).toEqual(['outside-entry'])
  })
})

describe('check against the counterexamples', () => {
  const clean = (p: Project) => p.config().entry().doc('docs/main/ok.doc.ts', 'doc, section, text', A.replace("id: 'a'", "id: 'ok'"))

  it('passes a project with none of them', async () => {
    expect(await check(clean(new Project('clean')))).toEqual([])
  })

  it('reports a required section the template needs and the document lacks', async () => {
    const p = clean(new Project('missing-section'))
    p.doc('docs/main/v.doc.ts', 'vision, section, text', `vision({ id: 'v', title: 'V', status: 'draft', sections: [
      section('purpose', 'P', [text('p')]), section('audience', 'A', [text('a')])] })`)
    const problems = await check(p)
    expect(problems.map((x) => [x.code, x.location])).toEqual([['missing-required-section', 'docs/main/v.doc.ts']])
    expect(problems[0]?.message).toContain('"outcome"')
  })

  it('reports a cited fact that no facts package has, however it is cited', async () => {
    const p = clean(new Project('unknown-fact')).install('facts-2x')
    p.config({ factSources: ['acme-facts-2x/acme'] })
    p.doc('docs/main/u.doc.ts', 'doc, section, text, factBlock', `doc({ id: 'u', title: 'U', status: 'draft', sections: [
      section('s', 'S', [factBlock({ facts: ['acme.buttons.radius', 'acme.nope.one'] }), text('and fact:acme.nope.two')])] })`)
    const problems = await check(p)
    expect(problems.map((x) => [x.code, x.location])).toEqual([
      ['unknown-fact-reference', 'docs/main/u.doc.ts'],
      ['unknown-fact-reference', 'docs/main/u.doc.ts'],
    ])
    expect(problems.map((x) => x.message).join('\n')).toMatch(/acme\.nope\.one[\s\S]*acme\.nope\.two/)
  })

  it('reports a supersedes that points at no decision of the entry', async () => {
    const p = clean(new Project('supersedes'))
    const dec = (id: string, supersedes: string) =>
      `decision({ id: '${id}', title: 'D', status: 'proposed', appliesFrom: 'next', supersedes: '${supersedes}', sections: [section('s', 'S', [text('t')])] })`
    p.doc('docs/main/d1.doc.ts', 'decision, section, text', dec('d-one', 'nowhere'))
      .doc('docs/main/d2.doc.ts', 'decision, section, text', dec('d-two', 'd-one'))
      .doc('docs/main/ok2.doc.ts', 'doc, section, text', A.replace("id: 'a'", "id: 'same-id-as-doc'"))
      .doc('docs/main/d3.doc.ts', 'decision, section, text', dec('d-three', 'same-id-as-doc'))
    const problems = await check(p)
    expect(problems.map((x) => [x.code, x.location])).toEqual([
      ['supersedes-unknown', 'docs/main/d1.doc.ts'],
      ['supersedes-unknown', 'docs/main/d3.doc.ts'],
    ])
    expect(problems[0]?.message).toContain('"nowhere"')
  })

  it('reports a scenario of a requirement that cites no fact, and not one that does', async () => {
    const p = clean(new Project('scenario')).install('facts-2x')
    p.config({ factSources: ['acme-facts-2x/acme'] })
    p.doc('docs/main/r.doc.ts', 'requirement, section, scenario', `requirement({ id: 'r', title: 'R', status: 'planned', sections: [section('acceptance', 'Acceptance', [
      scenario({ scenario: 'S', expected: 'E', judgement: 'J', facts: 'acme.buttons.radius' }),
      scenario({ scenario: 'S2', expected: 'E', judgement: 'J' })])] })`)
    const problems = await check(p)
    expect(problems.map((x) => [x.code, x.location])).toEqual([['scenario-without-fact', 'docs/main/r.doc.ts']])
    expect(problems[0]?.message).toContain('"acceptance"')
  })

  it('reports a *.doc.ts that is under no entry', async () => {
    const p = clean(new Project('outside-entry'))
    p.doc('docs/stray/x.doc.ts', 'doc, section, text', A)
    expect((await check(p)).map((x) => [x.code, x.location])).toEqual([['outside-entry', 'docs/stray/x.doc.ts']])
  })

  it('reports two documents of one entry with the same id', async () => {
    const p = clean(new Project('duplicate'))
    p.doc('docs/main/ok-too.doc.ts', 'doc, section, text', A.replace("id: 'a'", "id: 'ok'"))
    expect((await check(p)).map((x) => [x.code, x.location])).toEqual([['duplicate-document-id', 'docs/main/ok.doc.ts']])
  })

  it('reports every required section that is missing, one problem each', async () => {
    const p = clean(new Project('template-gone'))
    p.doc('docs/main/t.doc.ts', 'vision, section, text', `vision({ id: 'v', title: 'V', status: 'draft', sections: [section('purpose','P',[text('p')])] })`)
    expect(codes(await check(p))).toEqual(['missing-required-section', 'missing-required-section'])
  })
})

describe('a decision is replaced by another one', () => {
  const decisionSource = (status: string, body = 'The reason.', blockOptions = '') =>
    `decision({
  id: 'use-x',
  title: 'Use X',
  status: '${status}',
  appliesFrom: 'next',
  sections: [section('context', 'Context', [text('${body}'${blockOptions})])],
})`
  const FILE = 'docs/main/use-x.doc.ts'

  it('still passes when pin sets the versions and the decision is then replaced', async () => {
    const p = new Project('pinned').config().entry().doc(FILE, 'decision, section, text', decisionSource('accepted', 'The reason.', ", { since: 'next' }"))
    p.doc('docs/main/use-y.doc.ts', 'decision, section, text', decisionSource('accepted', 'Y reason.').replace("'use-x'", "'use-y'").replace('Use X', 'Use Y'))
    expect(await check(p)).toEqual([])
    // what `pin --version 1.0.0` does to the source: next becomes the version
    p.write(FILE, p.read(FILE).replace("appliesFrom: 'next'", "appliesFrom: '1.0.0'").replace("since: 'next'", "since: '1.0.0'"))
    expect(await check(p)).toEqual([])
    // and the decision is replaced by another one
    p.write(FILE, p.read(FILE).replace("status: 'accepted'", "status: 'superseded'"))
    p.write('docs/main/use-y.doc.ts', p.read('docs/main/use-y.doc.ts').replace("appliesFrom: 'next',", "appliesFrom: '1.1.0',\n  supersedes: 'use-x',"))
    expect(await check(p)).toEqual([])
  })

  it('does not compare the body of an accepted decision with anything, because PR review guards it', async () => {
    const p = new Project('no-body-check').config().entry().doc(FILE, 'decision, section, text', decisionSource('accepted'))
    expect(await check(p)).toEqual([])
    p.write(FILE, p.read(FILE).replace('The reason.', 'Another reason.'))
    expect(await check(p)).toEqual([])
  })
})

describe('the facts a document cites are read through fact-kit', () => {
  const cites = (id: string) => `doc({ id: 'c', title: 'C', status: 'draft', sections: [section('s', 'S', [factBlock({ facts: ['${id}'] })])] })`

  for (const [fixture, source, ids] of [
    ['facts-1x', 'acme-facts-1x/acme', ['acme.tokens.color-primary', 'acme.tokens.spacing']],
    ['facts-1x2', 'acme-facts-1x2/acme', ['acme.layout.gutter', 'acme.layout.columns']],
    ['facts-2x', 'acme-facts-2x/acme', ['acme.buttons.radius', 'acme.buttons.shadow']],
  ] as const) {
    it(`passes a document that cites facts of the ${fixture} index, and reports one they do not have`, async () => {
      const p = new Project(`facts-${fixture}`).config({ factSources: [source] }).entry().install(fixture)
      p.doc('docs/main/c.doc.ts', 'doc, section, factBlock', `doc({ id: 'c', title: 'C', status: 'draft', sections: [section('s', 'S', [factBlock({ facts: ${JSON.stringify(ids)} })])] })`)
      expect(await check(p)).toEqual([])
      p.doc('docs/main/c.doc.ts', 'doc, section, factBlock', cites('acme.other.thing'))
      expect(codes(await check(p))).toEqual(['unknown-fact-reference'])
    })
  }

  it('reads all three index formats in one project', async () => {
    const p = new Project('facts-both')
      .config({ factSources: ['acme-facts-1x/acme', 'acme-facts-1x2/acme', 'acme-facts-2x/acme'] })
      .entry().install('facts-1x').install('facts-1x2').install('facts-2x')
    p.doc('docs/main/c.doc.ts', 'doc, section, factBlock', `doc({ id: 'c', title: 'C', status: 'draft', sections: [section('s', 'S', [factBlock({ facts: ['acme.tokens.spacing', 'acme.layout.gutter', 'acme.buttons.shadow'] })])] })`)
    expect(await check(p)).toEqual([])
    p.doc('docs/main/c.doc.ts', 'doc, section, factBlock', cites('acme.other.thing'))
    expect(codes(await check(p))).toEqual(['unknown-fact-reference'])
  })

  it('stops with an input error when a facts package is not installed', async () => {
    const p = new Project('facts-missing').config({ factSources: ['not-installed/acme'] }).entry()
    await expect(check(p)).rejects.toThrow(/cannot read the facts of "not-installed\/acme"/)
  })
})
