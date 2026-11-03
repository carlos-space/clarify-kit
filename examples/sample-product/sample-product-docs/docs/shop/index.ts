import { defineDocs } from 'clarify-kit'

// The documents live in the `*.doc.ts` files below this one, at the same relative path as the facts they cite.
export default defineDocs({
  layer: 'product',
  describes: { 'sample-product': '0.1.0' },
  publish: { target: 'npm', name: 'sample-product-docs' },
})
