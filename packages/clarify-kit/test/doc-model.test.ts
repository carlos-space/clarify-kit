import { describe, expect, it } from 'vitest'
import {
  BLOCK_FIELDS,
  DocModelError,
  STANDARD_TEMPLATES,
  asset,
  code,
  decision,
  doc,
  factBlock,
  fromTemplate,
  getRenderer,
  getTemplate,
  isDocument,
  list,
  listRenderers,
  missingSections,
  record,
  registerRenderer,
  registerTemplate,
  requirement,
  scenario,
  section,
  table,
  text,
  topic,
} from '../src/index.ts'
import type { Block, Document } from '../src/index.ts'
import { designTokenFact } from './samples/facts.ts'

const load = async (name: string): Promise<Document> => ((await import(`./samples/${name}.doc.ts`)) as { default: Document }).default
const body = [section('s', 'S', [text('t')])]

describe('the four document types', () => {
  it('load with their type, status, version field and sections', async () => {
    const d = await load('type-doc')
    expect(isDocument(d)).toBe(true)
    expect(d).toMatchObject({ type: 'doc', status: 'active', since: '0.1.0', topics: ['design:token'] })
    expect(d.sections.map((s) => s.id)).toEqual(['overview'])

    const r = await load('type-requirement')
    expect(r).toMatchObject({ type: 'requirement', status: 'planned', release: '0.2.0' })
    expect(r.sections[0]?.blocks[0]?.kind).toBe('scenario')

    const dec = await load('type-decision')
    expect(dec).toMatchObject({
      type: 'decision',
      status: 'accepted',
      appliesFrom: 'next',
      supersedes: ['older-decision'],
      contentHash: 'a'.repeat(64),
    })

    const rec = await load('type-record')
    expect(rec).toMatchObject({ type: 'record', date: '2026-11-02', contentHash: 'b'.repeat(64) })
    expect('status' in rec).toBe(false)
  })

  it('leave a requirement release unscheduled as null', () => {
    expect(requirement({ id: 'r', title: 'R', status: 'planned', sections: body }).release).toBeNull()
    expect(requirement({ id: 'r', title: 'R', status: 'planned', release: null, sections: body }).release).toBeNull()
    expect(requirement({ id: 'r', title: 'R', status: 'planned', release: 'next', sections: body }).release).toBe('next')
  })

  it('serialize without the marks that tell a document from a plain object', async () => {
    const d = await load('type-doc')
    expect(JSON.parse(JSON.stringify(d))).toEqual({ ...d })
    expect(isDocument(JSON.parse(JSON.stringify(d)))).toBe(false)
  })
})

describe('values the types do not allow are refused when the document is loaded', () => {
  it('refuses a decision status it does not have, and the type checker does too', () => {
    // @ts-expect-error "done" is not a decision status
    expect(() => decision({ id: 'd', title: 'D', status: 'done', appliesFrom: '1.0.0', sections: body })).toThrow(
      /decision status must be one of "proposed", "accepted", "rejected", "superseded"/,
    )
    // @ts-expect-error "active" belongs to doc, not to requirement
    expect(() => requirement({ id: 'r', title: 'R', status: 'active', sections: body })).toThrow(DocModelError)
    // @ts-expect-error a doc has no "shipped" status
    expect(() => doc({ id: 'd', title: 'D', status: 'shipped', sections: body })).toThrow(DocModelError)
  })

  it('refuses a requirement release that is not a version', () => {
    for (const release of ['v1', '1.0', 'soon', '']) {
      expect(() => requirement({ id: 'r', title: 'R', status: 'planned', release, sections: body }), release).toThrow(
        /requirement release/,
      )
    }
  })

  it('refuses a bad appliesFrom, since, date, hash, id and field name', () => {
    const decide = (extra: object) =>
      decision({ id: 'd', title: 'D', status: 'proposed', appliesFrom: '1.0.0', sections: body, ...extra })
    expect(() => decide({ appliesFrom: '1' })).toThrow(/appliesFrom/)
    expect(() => decide({ contentHash: 'abc' })).toThrow(/sha256/)
    expect(() => decide({ supersedes: 'd' })).toThrow(/supersede itself/)
    expect(() => decide({ extra: 1 })).toThrow(/unknown field "extra"/)
    expect(() => doc({ id: 'd', title: 'D', status: 'draft', since: 'later', sections: body })).toThrow(/doc since/)
    expect(() => doc({ id: 'D!', title: 'D', status: 'draft', sections: body })).toThrow(/doc id/)
    const rec = (extra: object) => record({ id: 'r', title: 'R', date: '2026-11-02', sections: body, ...extra })
    expect(() => rec({ date: '2026-02-30' })).toThrow(/YYYY-MM-DD/)
    expect(() => rec({ date: '11/02/2026' })).toThrow(/YYYY-MM-DD/)
    expect(() => rec({ status: 'draft' })).toThrow(/no status/)
  })

  it('refuses a section list that repeats an id or holds something a builder did not make', () => {
    const s = section('a', 'A', [])
    expect(() => doc({ id: 'd', title: 'D', status: 'draft', sections: [s, s] })).toThrow(/two sections "a"/)
    expect(() => section('a', 'A', [{ kind: 'text', text: 'x' }])).toThrow(/block builder/)
  })
})

describe('the seven blocks', () => {
  it('load from one sample, each with the fields the facts list', async () => {
    const d = await load('blocks')
    const blocks = d.sections.flatMap((s) => s.blocks)
    expect(blocks.map((b) => b.kind)).toEqual(['text', 'list', 'table', 'fact', 'scenario', 'code', 'asset'])
    for (const block of blocks) {
      const allowed = ['kind', 'since', 'pending', ...BLOCK_FIELDS[block.kind]]
      expect(Object.keys(block).every((k) => allowed.includes(k)), block.kind).toBe(true)
    }
    expect(blocks[0]).toMatchObject({ since: '0.1.0' })
    expect(blocks[3]).toMatchObject({ pending: 'later', renderer: 'table' })
  })

  it('record a fact id string, a fact object and a fact: mention in the loaded document', async () => {
    const d = await load('blocks')
    expect(d.factRefs).toEqual(['acme.tokens.color-primary', 'clarify-kit.doc-types.doc'])
    const fact = d.sections[0]?.blocks[3]
    expect(fact).toMatchObject({ facts: ['acme.tokens.color-primary', 'clarify-kit.doc-types.doc'] })
    const byString = factBlock({ facts: 'a.b' })
    const byObject = factBlock({ facts: { id: 'a.b' } })
    expect(byString).toEqual(byObject)
  })

  it('refuse values a block does not allow', () => {
    expect(() => text('')).toThrow(/text must be a non-empty string/)
    expect(() => list([])).toThrow(/must not be empty/)
    expect(() => table(['a', 'b'], [['1']])).toThrow(/1 cells, the table has 2 columns/)
    expect(() => factBlock({ facts: [] })).toThrow(/must not be empty/)
    expect(() => factBlock({ facts: 'nodot' })).toThrow(/fact id/)
    expect(() => factBlock({ facts: { id: 3 } as never })).toThrow(/fact id/)
    expect(() => scenario({ scenario: 'S', expected: '', judgement: 'J' })).toThrow(/expected/)
    expect(() => code('', 'x')).toThrow(/lang/)
    expect(() => asset('')).toThrow(/path/)
    expect(() => text('x', { since: 'soon' })).toThrow(/since/)
    expect(() => text('x', { pending: 'Bad Label' })).toThrow(/pending/)
    // @ts-expect-error a misspelt option
    expect(() => text('x', { sinse: '1.0.0' })).toThrow(/unknown field "sinse"/)
  })

  it('accept since and pending on every block builder', () => {
    const made: Block[] = [
      text('x', { since: 'next', pending: 'p' }),
      list(['x'], { since: '1.0.0', pending: 'p' }),
      table(['a'], [['1']], { since: ['1.0.0', 'next'], pending: 'p' }),
      factBlock({ facts: 'a.b' }, { since: 'next', pending: 'p' }),
      scenario({ scenario: 'S', expected: 'E', judgement: 'J' }, { since: 'next', pending: 'p' }),
      code('ts', 'x', { since: 'next', pending: 'p' }),
      asset('a.png', { since: 'next', pending: 'p' }),
    ]
    expect(made.every((b) => b.pending === 'p' && b.since !== undefined)).toBe(true)
  })
})

describe('the ten standard templates', () => {
  for (const [name, { type, requiredSections }] of Object.entries(STANDARD_TEMPLATES)) {
    it(`${name} loads from its sample with its required sections`, async () => {
      const d = await load(`template-${name}`)
      expect(d.type).toBe(type)
      expect(d.template).toBe(name)
      expect(d.sections.map((s) => s.id)).toEqual(requiredSections)
      expect(missingSections(d)).toEqual([])
    })
  }

  it('list a missing required section', () => {
    const d = fromTemplate<'doc'>('vision', { id: 'v', title: 'V', status: 'draft', sections: [section('purpose', 'P', [])] })
    expect(missingSections(d)).toEqual(['audience', 'outcome'])
  })

  it('give a doc template the doc type and a record template the record type', () => {
    expect(getTemplate('guide')?.type).toBe('doc')
    expect(getTemplate('retro')?.type).toBe('record')
    expect(() => fromTemplate<'doc'>('nope', { id: 'x', title: 'X', status: 'draft', sections: body })).toThrow(/unknown template/)
  })
})

describe('modules register templates and renderers', () => {
  it('lets a document be written from a template a module registered', async () => {
    const d = await load('acme-brand')
    expect(d).toMatchObject({ type: 'doc', template: 'acme-brand' })
    expect(getTemplate('acme-brand')?.sections.map((s) => s.required)).toEqual([true, true, false])
    expect(missingSections(d)).toEqual([])
    expect(getRenderer('acme-swatch')?.({ id: 'a.b' } as never, { version: 'head', include: [] })).toBe('swatch a.b')
    expect(listRenderers()).toContain('acme-swatch')
  })

  it('refuses a name that is registered, a template that is not well formed, and a renderer that is not a function', () => {
    const sections = [{ id: 'a', title: 'A', required: true }]
    expect(() => registerTemplate({ name: 'acme-brand', type: 'doc', sections })).toThrow(/already registered/)
    expect(() => registerTemplate({ name: 'vision', type: 'doc', sections })).toThrow(/already registered/)
    // @ts-expect-error "memo" is not a document type
    expect(() => registerTemplate({ name: 'x-memo', type: 'memo', sections })).toThrow(/type must be one of/)
    expect(() => registerTemplate({ name: 'x-empty', type: 'doc', sections: [] })).toThrow(/non-empty/)
    expect(() => registerRenderer('acme-swatch', () => '')).toThrow(/already registered/)
    // @ts-expect-error a renderer is a function
    expect(() => registerRenderer('x-bad', 'nope')).toThrow(/must be a function/)
  })
})

describe('topics', () => {
  it('are recorded when they follow <domain>:<name>, including one a fact uses', async () => {
    const d = await load('topic-shared')
    expect(d.topics).toEqual(designTokenFact.topics)
    expect(d.topics).toEqual(['design:token'])
    expect(topic('ddd:entity')).toBe('ddd:entity')
  })

  it('refuse a topic of another format when the document is loaded', () => {
    for (const bad of ['design', 'Design:token', 'a:b:c', ':x', 'x:', 'a b:c']) {
      expect(() => topic(bad), bad).toThrow(/<domain>:<name>/)
      expect(() => doc({ id: 'd', title: 'D', status: 'draft', topics: [bad], sections: body }), bad).toThrow(DocModelError)
    }
    expect(() => doc({ id: 'd', title: 'D', status: 'draft', topics: ['a:b', 'a:b'], sections: body })).toThrow(/twice/)
  })
})
