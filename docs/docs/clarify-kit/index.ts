import { defineDocs } from 'clarify-kit'

// The documents live in the `*.doc.ts` files next to this one. They are the product-level design of clarify-kit, so
// the layer is `product`.
export default defineDocs({
  layer: 'product',
  describes: { 'clarify-kit': '0.2.0' },
  publish: { target: 'npm', name: 'clarify-kit-docs' },
})
