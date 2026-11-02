// Reads the built sample product by version and asserts what a reader sees, then prints it.
// Called by sample-product.sh; it is not meant to be run by hand.
//
// usage: node sample-product-read.mjs <before|after> <reader-root> <clarify-kit index.js> <fact-kit index.js> <old> <new>
//   <reader-root>  a directory whose node_modules holds sample-product-docs and sample-product-facts
//   <old>          the version the sample was pinned to before this round (its facts and blocks carry it)
//   <new>          the version `next` is pinned to in `after`
// Phases:
//   before  `next` is still in the sources: a reader on head sees it, a reader of <old> does not.
//   after   `next` was pinned to <new> and rebuilt: a reader of <new> sees it, a reader of <old> does not.
// Both phases also check the pending label: a reader on head sees the pending block only with `include`.
// Exit status: 0 every assertion holds, 1 one fails (the failed ones are printed).
import assert from 'node:assert/strict'
import { pathToFileURL } from 'node:url'

const [phase, root, clarifyIndex, factKitIndex, oldVersion, newVersion] = process.argv.slice(2)
if (!['before', 'after'].includes(phase) || !newVersion) {
  console.error('usage: sample-product-read.mjs <before|after> <root> <clarify-kit index.js> <fact-kit index.js> <old> <new>')
  process.exit(2)
}
const { readDocs } = await import(pathToFileURL(clarifyIndex).href)
const { readFacts } = await import(pathToFileURL(factKitIndex).href)

const FACTS = 'sample-product-facts/shop'
const DOCS = 'sample-product-docs/shop'
const NEXT_FACT = 'sample-product.cart.free-shipping'
const OLD_FACT = 'sample-product.cart.discount-rate'

const factIds = (options) => readFacts(FACTS, { root, ...options }).facts.map((f) => f.id)
const blocksOf = (options) =>
  readDocs(DOCS, { root, ...options }).docs.flatMap((d) =>
    d.sections.flatMap((s) =>
      s.blocks.map((b) => {
        const what = b.kind === 'text' ? JSON.stringify(b.text.slice(0, 30)) : b.facts.join(',')
        return `${d.id}/${s.id}: ${b.kind} ${what}${b.since ? ` since=${b.since}` : ''}${b.pending ? ` pending=${b.pending}` : ''}`
      }),
    ),
  )
const nextBlock = (blocks) => blocks.some((b) => b.includes(`scenario ${NEXT_FACT}`))
const pendingBlock = (blocks) => blocks.some((b) => b.includes('pending=coupon'))

let failed = 0
const check = (label, run) => {
  try {
    run()
    console.log(`  ok   ${label}`)
  } catch (error) {
    failed += 1
    console.log(`  FAIL ${label}: ${error.message.split('\n')[0]}`)
  }
}
const show = (label, ids, blocks) => {
  console.log(`${label}`)
  console.log(`  facts: ${ids.join(', ')}`)
  for (const b of blocks) console.log(`  block: ${b}`)
}

if (phase === 'before') {
  // fact-kit reads the latest published content without a version, so head is asked for by name; clarify-kit reads head without one
  const head = { ids: factIds({ version: 'head' }), blocks: blocksOf({}) }
  const old = { ids: factIds({ version: oldVersion }), blocks: blocksOf({ version: oldVersion }) }
  show('[before pin] head (no version)', head.ids, head.blocks)
  show(`[before pin] version ${oldVersion}`, old.ids, old.blocks)
  check('head reads the next fact', () => assert.ok(head.ids.includes(NEXT_FACT)))
  check('head reads the block that cites the next fact', () => assert.ok(nextBlock(head.blocks)))
  check(`version ${oldVersion} does not read the next fact`, () => assert.ok(!old.ids.includes(NEXT_FACT)))
  check(`version ${oldVersion} does not read the block that cites it`, () => assert.ok(!nextBlock(old.blocks)))
  check(`version ${oldVersion} still reads the pinned fact and its blocks`, () => {
    assert.ok(old.ids.includes(OLD_FACT))
    assert.ok(old.blocks.some((b) => b.includes(OLD_FACT)))
  })
} else {
  const fresh = { ids: factIds({ version: newVersion }), blocks: blocksOf({ version: newVersion }) }
  const old = { ids: factIds({ version: oldVersion }), blocks: blocksOf({ version: oldVersion }) }
  show(`[after pin] version ${newVersion}`, fresh.ids, fresh.blocks)
  show(`[after pin] version ${oldVersion}`, old.ids, old.blocks)
  check(`version ${newVersion} reads the new fact`, () => assert.ok(fresh.ids.includes(NEXT_FACT)))
  check(`version ${newVersion} reads the block that cites it, now since=${newVersion}`, () =>
    assert.ok(fresh.blocks.some((b) => b.includes(`scenario ${NEXT_FACT} since=${newVersion}`))))
  check(`version ${oldVersion} does not read the new fact`, () => assert.ok(!old.ids.includes(NEXT_FACT)))
  check(`version ${oldVersion} does not read the block that cites it`, () => assert.ok(!nextBlock(old.blocks)))
}

const without = blocksOf({})
const withLabel = blocksOf({ include: ['coupon'] })
const withOther = blocksOf({ include: ['other'] })
console.log(`[${phase} pin] pending block: head without include ${pendingBlock(without)}, with include=coupon ${pendingBlock(withLabel)}`)
check('head without include does not read the pending block', () => assert.ok(!pendingBlock(without)))
check('head with include=coupon reads the pending block', () => assert.ok(pendingBlock(withLabel)))
check('head with another label does not read the pending block', () => assert.ok(!pendingBlock(withOther)))
check('a version reader does not read the pending block even with include', () =>
  assert.ok(!pendingBlock(blocksOf({ version: phase === 'before' ? oldVersion : newVersion, include: ['coupon'] }))))

process.exit(failed === 0 ? 0 : 1)
