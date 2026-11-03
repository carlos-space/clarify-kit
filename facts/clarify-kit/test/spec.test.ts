// Reads the built index the way a reader on head does and compares it with the plan in the facts. Every task the plan
// was cut into has landed, so no row carries a `pending` label any more and a reader on head needs no `include`.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { describe, it } from 'node:test'
import { selectFacts } from 'fact-kit'
import type { FactIndex } from 'fact-kit'

const index = JSON.parse(
  readFileSync(new URL('../dist/clarify-kit/index.json', import.meta.url), 'utf8'),
) as FactIndex

// Retired in next: a head reader no longer gets them, a 0.1.0 reader still does.
const retired = ['clarify-kit.cli.adopt', 'clarify-kit.doc-types.content-hash']

const all = new Map(selectFacts(index, { version: 'head' }).map((f) => [f.id, f]))
const value = (id: string): any => {
  const f = all.get(`clarify-kit.${id}`)
  assert.ok(f, `no fact clarify-kit.${id}`)
  return (f.content as { value: unknown }).value
}

describe('rows', () => {
  // A release branch pins `next` to the Release PR's version before it merges, so a row is either still `next` or
  // pinned to a release line this repository has shipped (0.1.0, 0.2.0 or their prereleases).
  it('all start in the first release and carry no pending label, because the code they describe is in the repository', () => {
    assert.ok(index.facts.length > 0)
    for (const fact of index.facts) {
      assert.ok(fact.variants && fact.variants.length > 0, fact.id)
      for (const v of fact.variants) {
        assert.match(String(v.since), /^(next|0\.[12]\.0(-[a-z]+\.\d+)?)$/, fact.id)
        assert.equal(v.pending, undefined, fact.id)
      }
    }
  })
  it('are all read by a reader on head that includes no label', () => {
    // content-hash and adopt are retired in next, so a head reader no longer gets them
    assert.equal(all.size, index.facts.length - retired.length)
    for (const id of retired) assert.ok(!all.has(id), id)
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
    assert.match(dec, /accepted-content-frozen: 採納後內文不改，由 PR 審查把關/)
    assert.doesNotMatch(dec, /雜湊/)
    const rec = value('doc-types.record').specificRules.join('\n')
    assert.match(rec, /written-once: 寫完不改，由 PR 審查把關/)
    assert.doesNotMatch(rec, /雜湊/)
  })
  it('retire adopt and the content hash in next, and still give them to a 0.1.0 reader', () => {
    for (const id of retired) {
      assert.ok(!all.has(id), id)
      assert.ok(selectFacts(index, { version: '0.1.0' }).some((x) => x.id === id), id)
    }
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
  it('list the four commands', () => {
    assert.deepEqual(value('cli.commands').commands, ['build', 'check', 'pin', 'render'])
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
  it('write seven top-level fields, among them layer, and no data version field', () => {
    const fields = value('index.fields')
    assert.deepEqual(fields.topLevel, ['formatVersion', 'package', 'entry', 'layer', 'describes', 'publish', 'docs'])
    assert.match(fields.meaning.package, /<RepoName>-docs/)
    assert.deepEqual(Object.keys(fields.meaning).sort(), [...fields.topLevel].sort())
    assert.equal(fields.noOtherFields, true)
    for (const name of ['dataFormatVersion', 'indexFormat', 'schemaVersion']) assert.ok(!fields.topLevel.includes(name))
  })
  it('start formatVersion at "1.0" and read the same major', () => {
    const version = value('index.format-version')
    assert.equal(version.initial, '1.0')
    assert.match(version.initial, /^\d+\.\d+$/)
    assert.match(version.reader, /同一個 major/)
    assert.match(version.reader, /1\.0 與 1\.1/)
    assert.equal(version.current, '1.1')
    assert.equal(version.dataVersionField, null)
  })
  it('list the fields of a document, among them id, factRefs and template', () => {
    const fields = value('index.doc-fields')
    for (const name of ['id', 'factRefs', 'docRefs']) assert.ok(fields.required.includes(name), name)
    assert.ok(fields.optional.includes('template'))
    assert.deepEqual(Object.keys(fields.meaning).sort(), [...fields.required, ...fields.optional].sort())
    assert.match(fields.meaning.docRefs, /<target>#<id>/)
    assert.deepEqual(Object.keys(fields.byType), ['doc', 'requirement', 'decision', 'record'])
    assert.equal(fields.noOtherFields, true)
  })
  it('state the docs package convention', () => {
    const convention = value('index.docs-package-convention')
    assert.equal(convention.name, '`<RepoName>-docs`，私有倉加 `@<OrgName>/`，例如 `@carlos-space/blueprint-poly-hub-docs`')
    assert.deepEqual(convention.exports, { './<entry>/index.json': './dist/<entry>/index.json' })
    assert.deepEqual(convention.files, ['dist'])
    assert.equal(convention.private, 'unset')
  })
  it('have at least six check codes', () => {
    const codes = Object.keys(value('check.codes').codes)
    for (const code of [
      'missing-required-section',
      'unknown-fact-reference',
      'supersedes-unknown',
      'scenario-without-fact',
      'outside-entry',
    ]) {
      assert.ok(codes.includes(code), code)
    }
    assert.ok(!codes.includes('adopted-content-changed'))
    assert.ok(!('adopted-content-changed' in value('check.codes').scope))
    for (const code of ['cites-lower-layer', 'undeclared-layer', 'unknown-doc-reference', 'layer-mismatch']) {
      assert.ok(codes.includes(code), code)
      assert.ok(code in value('check.codes').scope, code)
    }
    assert.ok(codes.length >= 6)
    assert.deepEqual(codes.slice(0, 5), [
      'missing-required-section',
      'unknown-fact-reference',
      'supersedes-unknown',
      'scenario-without-fact',
      'outside-entry',
    ])
  })
  it('declare the layer of an entry, with four values and a direction', () => {
    const layer = value('cli.layer')
    assert.deepEqual(layer.values, ['org', 'product', 'implementation', 'tool'])
    assert.match(layer.order, /org > product > implementation/)
    assert.match(layer.citeRule, /cites-lower-layer/)
    assert.match(layer.tool, /每一層都可以引用/)
    assert.match(layer.crossProduct, /不另比較產品/)
    assert.match(value('cli.entry-rule').layer, /undeclared-layer/)
    assert.match(value('cli.entry-rule').entryFile, /`layer`/)
  })
  it('find the layer of a source in its index first, then in the config', () => {
    const source = value('cli.source-layer')
    assert.match(source.first, /index 的頂層 `layer`/)
    assert.match(source.configFallback, /"layer"/)
    assert.match(source.mismatch, /layer-mismatch/)
    assert.match(source.undeclared, /undeclared-layer/)
    const settings = value('cli.config').settings
    assert.match(settings.factSources, /"layer"/)
    assert.match(settings.docSources, /-docs/)
  })
  it('cite a document with doc:<target>#<id>', () => {
    const ref = value('cli.doc-reference')
    assert.match(ref.syntax, /doc:<target>#<id>/)
    assert.match(ref.target, /docSources/)
    assert.match(ref.unknown, /unknown-doc-reference/)
  })
  it('read facts through fact-kit', () => {
    assert.match(value('check.fact-lookup').rule, /loadInstalledIndex.*selectFacts/)
  })
})

describe('pin, render, read and impact', () => {
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
  it('pin leaves a pending row alone', () => {
    const keeps = value('cli.pin').keeps
    assert.match(keeps, /帶 `pending`.*不動/)
    assert.doesNotMatch(keeps, /雜湊/)
  })
  it('give a renderer the version, the include labels and the place of the block', () => {
    const context = value('modules.render-context')
    assert.equal(context.type, 'RenderContext')
    assert.deepEqual(Object.keys(context.fields), ['version', 'include', 'document', 'section'])
  })
  it('name the references the extractor recognizes', () => {
    const extractor = value('read.impact-extractor')
    assert.equal(extractor.files, '`*.doc.ts`')
    assert.equal(extractor.recognized.length, 3)
    assert.match(extractor.recognized.join('\n'), /fact id 字串字面值/)
  })
})
