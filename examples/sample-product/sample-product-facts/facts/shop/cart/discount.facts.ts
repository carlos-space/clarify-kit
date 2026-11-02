import { factsOf, history } from 'fact-kit'

// Write the `since` of a new row as the literal string next, in this file: `fact-kit pin` rewrites only that literal
// in the files under the facts directory, so a helper or a spread would never be pinned.
const f = factsOf({ tool: 'sample-product', source: { kind: 'published' }, topics: ['cart'], prefix: 'cart' })

export default [
  f.value(
    'discount-rate',
    history({ since: '0.1.0', value: { member: 0.1, guest: 0, unit: 'ratio of the cart total' } }),
    { title: 'Discount rate', description: 'The share of the cart total taken off for each kind of customer.' },
  ),
  f.value(
    'free-shipping',
    history({ since: 'next', value: { threshold: 1000, currency: 'TWD' } }),
    { title: 'Free shipping threshold', description: 'A cart at or above this total ships for free.' },
  ),
]
