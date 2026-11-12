import { defineFacts } from 'fact-kit'
import { describesOf } from '../../../_lib/describes.ts'

// The facts live in the `*.facts.ts` files next to this one, which the build collects.
export default defineFacts({
  layer: 'tool',
  describes: describesOf('clarify-kit', 'packages/clarify-kit'),
  publish: { target: 'npm', name: 'clarify-kit' },
})
