import { defineFacts } from 'fact-kit'

// The facts live in the `*.facts.ts` files below this one, which the build collects.
export default defineFacts({
  layer: 'product',
  describes: { 'sample-product': '0.1.0' },
  publish: { target: 'npm', name: 'sample-product-facts' },
})
