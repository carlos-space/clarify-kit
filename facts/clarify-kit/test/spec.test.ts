// Reads the built index the way a reader on head does and compares it with the plan in the facts. A pending row
// is only visible to a reader that passes its label as `include`, so every test passes the labels it reads.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { describe, it } from 'node:test'
import { selectFacts } from 'fact-kit'
import type { FactIndex } from 'fact-kit'

const index = JSON.parse(
  readFileSync(new URL('../dist/clarify-kit/index.json', import.meta.url), 'utf8'),
) as FactIndex

const labels = ['pin-read-impact-render']
const all = new Map(selectFacts(index, { version: 'head', include: ['pin-read-impact-render'] }).map((f) => [f.id, f]))
const value = (id: string): any => {
  const f = all.get(`clarify-kit.${id}`)
  assert.ok(f, `no fact clarify-kit.${id}`)
  return (f.content as { value: unknown }).value
}

describe('pending rows', () => {
  it('are hidden from a reader that includes no label, which still reads the rows that carry none', () => {
    const plain = selectFacts(index, { version: 'head' })
    assert.ok(plain.length > 0)
    for (const f of plain) assert.ok(index.facts.find((x) => x.id === f.id)?.variants?.every((v) => v.pending === undefined), f.id)
    assert.ok(plain.length < index.facts.length)
  })
  it('are visible once per label', () => {
    for (const label of labels) {
      const some = selectFacts(index, { version: 'head', include: [label] })
      assert.ok(some.length > 0, label)
    }
  })
  it('all start at next, and carry the label of the task that has not landed yet unless the code they describe is already there', () => {
    for (const fact of index.facts) {
      assert.ok(fact.variants && fact.variants.length > 0, fact.id)
      for (const v of fact.variants) {
        assert.equal(v.since, 'next', fact.id)
        assert.ok(v.pending === undefined || labels.includes(v.pending), `${fact.id}: ${v.pending}`)
      }
    }
  })
  it('are left on no fact of the document model, build and check, which the package implements', () => {
    for (const fact of index.facts) {
      const topic = fact.id.split('.')[1]
      if (['doc-types', 'blocks', 'topics', 'templates', 'modules', 'index', 'check'].includes(topic ?? '')) {
        assert.ok(fact.variants?.every((v) => v.pending === undefined), fact.id)
      }
    }
    for (const name of ['commands', 'build', 'check', 'adopt', 'config', 'entry-rule']) {
      assert.ok(index.facts.find((f) => f.id === `clarify-kit.cli.${name}`)?.variants?.every((v) => v.pending === undefined), name)
    }
  })
  it('stay on the facts of the pin, render and read commands, and nowhere else', () => {
    const pending = index.facts.filter((f) => f.variants?.some((v) => v.pending !== undefined)).map((f) => f.id.split('.')[1])
    assert.ok(pending.length > 0)
    for (const topic of pending) assert.ok(['cli', 'read'].includes(topic ?? ''), String(topic))
  })
})

describe('doc types', () => {
  it('have four kinds with their states and version fields', () => {
    const doc = value('doc-types.doc')
    const req = value('doc-types.requirement')
    const dec = value('doc-types.decision')
    const rec = value('doc-types.record')
    assert.deepEqual(Object.keys(doc.states), ['draft', 'active', 'deprecated'])
    assert.equal(doc.versionField, 'since')
    assert.deepEqual(Object.keys(req.states), ['planned', 'in-progress', 'shipped'])
    assert.equal(req.versionField, 'release')
    assert.deepEqual(Object.keys(dec.states), ['proposed', 'accepted', 'rejected', 'superseded'])
    assert.equal(dec.versionField, 'appliesFrom')
    assert.deepEqual(Object.keys(rec.states), [])
    assert.equal(rec.versionField, 'date')
  })
  it('have the specific rules', () => {
    assert.ok(value('doc-types.requirement').specificRules.some((r: string) => r.includes('scenario-without-fact')))
    const dec = value('doc-types.decision').specificRules.join('\n')
    assert.match(dec, /supersedes/)
    assert.match(dec, /採納後內文不改/)
    assert.match(value('doc-types.record').specificRules.join('\n'), /寫完不改/)
  })
  it('hash the body only, for decision and record', () => {
    const hash = value('doc-types.content-hash')
    assert.deepEqual(hash.appliesTo, ['decision', 'record'])
    assert.deepEqual(hash.excludes, ['狀態', '版本欄位', 'since', 'supersedes', '被取代的關係'])
    assert.equal(hash.writtenBy, 'adopt')
  })
})

describe('blocks, topics, templates and modules', () => {
  it('have seven blocks, each with since and pending', () => {
    const kinds = value('blocks.kinds').kinds
    assert.deepEqual(kinds, ['text', 'list', 'table', 'fact', 'scenario', 'code', 'asset'])
    for (const kind of kinds) {
      const block = value(`blocks.${kind}`)
      assert.equal(block.kind, kind)
      assert.equal(block.fields.since, 'optional')
      assert.equal(block.fields.pending, 'optional')
    }
    assert.ok(value('blocks.since-pending').pending)
  })
  it('accept a fact id string and an imported fact object', () => {
    assert.equal(value('blocks.fact-reference').accepts.length, 2)
  })
  it('share the topic format with facts', () => {
    const topic = value('topics.format')
    assert.equal(topic.field, 'topics')
    const pattern = new RegExp(topic.pattern)
    for (const sample of topic.examples) assert.match(sample, pattern)
    assert.match('design:token', pattern)
    assert.doesNotMatch('design', pattern)
  })
  it('have ten standard templates with required sections', () => {
    const set = value('templates.standard-set')
    assert.deepEqual(set.doc, ['vision', 'goal', 'problem', 'policy', 'concept', 'guide', 'example'])
    assert.deepEqual(set.record, ['research', 'retro', 'release'])
    for (const type of ['doc', 'record'] as const) {
      for (const name of set[type]) {
        const template = value(`templates.${name}`)
        assert.equal(template.type, type)
        assert.ok(template.requiredSections.length >= 3, name)
      }
    }
  })
  it('let a module register templates and renderers', () => {
    assert.equal(value('modules.register-template').function, 'registerTemplate')
    assert.equal(value('modules.register-renderer').function, 'registerRenderer')
    assert.match(value('modules.register-renderer').usedBy, /renderer/)
  })
})

describe('CLI, config, entry rule, index format and check codes', () => {
  it('list the five commands', () => {
    assert.deepEqual(value('cli.commands').commands, ['build', 'check', 'pin', 'render', 'adopt'])
    for (const name of value('cli.commands').commands) assert.ok(all.has(`clarify-kit.cli.${name}`), name)
  })
  it('collect *.doc.ts by the entry rule', () => {
    const rule = value('cli.entry-rule')
    assert.match(rule.entry, /index\.ts/)
    assert.match(rule.collect, /\*\.doc\.ts/)
    assert.match(rule.collect, /相對路徑排序/)
    assert.match(rule.outside, /outside-entry/)
    assert.equal(value('cli.config').file, 'clarify-kit.config.json')
  })
  it('write six top-level fields and no data version field', () => {
    const fields = value('index.fields')
    assert.deepEqual(fields.topLevel, ['formatVersion', 'package', 'entry', 'describes', 'publish', 'docs'])
    assert.deepEqual(Object.keys(fields.meaning), fields.topLevel)
    assert.equal(fields.noOtherFields, true)
    for (const name of ['dataFormatVersion', 'indexFormat', 'schemaVersion']) assert.ok(!fields.topLevel.includes(name))
  })
  it('start formatVersion at "1.0" and read the same major', () => {
    const version = value('index.format-version')
    assert.equal(version.initial, '1.0')
    assert.match(version.initial, /^\d+\.\d+$/)
    assert.match(version.reader, /同一個 major/)
    assert.equal(version.dataVersionField, null)
  })
  it('list the fields of a document, among them id, factRefs and template', () => {
    const fields = value('index.doc-fields')
    for (const name of ['id', 'factRefs']) assert.ok(fields.required.includes(name), name)
    assert.ok(fields.optional.includes('template'))
    assert.deepEqual(Object.keys(fields.meaning), [...fields.required, ...fields.optional])
    assert.deepEqual(Object.keys(fields.byType), ['doc', 'requirement', 'decision', 'record'])
    assert.equal(fields.noOtherFields, true)
  })
  it('state the docs package convention', () => {
    const convention = value('index.docs-package-convention')
    assert.equal(convention.name, '`<product>-docs`')
    assert.deepEqual(convention.exports, { './<entry>/index.json': './dist/<entry>/index.json' })
    assert.deepEqual(convention.files, ['dist'])
    assert.equal(convention.private, 'unset')
  })
  it('have at least six check codes', () => {
    const codes = Object.keys(value('check.codes').codes)
    for (const code of [
      'missing-required-section',
      'unknown-fact-reference',
      'adopted-content-changed',
      'supersedes-unknown',
      'scenario-without-fact',
      'outside-entry',
    ]) {
      assert.ok(codes.includes(code), code)
    }
    assert.ok(codes.length >= 6)
    assert.deepEqual(codes.slice(0, 6), [
      'missing-required-section',
      'unknown-fact-reference',
      'adopted-content-changed',
      'supersedes-unknown',
      'scenario-without-fact',
      'outside-entry',
    ])
  })
  it('read facts through fact-kit', () => {
    assert.match(value('check.fact-lookup').rule, /readFacts.*selectFacts/)
  })
})

describe('pin, render, read and impact (pin-read-impact-render)', () => {
  it('pin needs --version and render refuses a work tree', () => {
    assert.ok(value('cli.pin').flags['--version'])
    const render = value('cli.render-location')
    assert.match(render.default, /系統暫存目錄/)
    assert.match(render.outInsideWorkTree, /結束碼非 0/)
    assert.ok(value('cli.render').flags['--out'])
  })
  it('select by version and include', () => {
    const select = value('read.select')
    assert.match(select.version, /version/)
    assert.match(select.include, /include/)
  })
  it('read installed docs with loadInstalledJson and not assertIndexFormat', () => {
    const installed = value('read.installed')
    assert.match(installed.loader, /^loadInstalledJson/)
    assert.deepEqual(installed.doesNotUse, ['assertIndexFormat', 'loadInstalledIndex'])
    assert.match(installed.thenChecks.join('\n'), /major 是 1/)
    assert.match(installed.thenChecks.join('\n'), /`docs`/)
  })
  it('name the references the extractor recognizes', () => {
    const extractor = value('read.impact-extractor')
    assert.equal(extractor.files, '`*.doc.ts`')
    assert.equal(extractor.recognized.length, 3)
    assert.match(extractor.recognized.join('\n'), /fact id 字串字面值/)
  })
})
