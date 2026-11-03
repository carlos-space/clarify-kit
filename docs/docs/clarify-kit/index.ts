import { defineDocs } from 'clarify-kit'

// The documents live in the `*.doc.ts` files next to this one. This task still uses the 0.2.0 API, so the entry has no
// `layer` yet; the task that implements the layer adds it.
export default defineDocs({
  describes: { 'clarify-kit': '0.2.0' },
  publish: { target: 'npm', name: 'clarify-kit-docs' },
})
