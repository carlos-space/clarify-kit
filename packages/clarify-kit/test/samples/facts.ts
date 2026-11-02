// Stand-ins for the fact objects a facts package exports. A fact object is any object with an `id`.
export const designTokenFact = {
  id: 'acme.tokens.color-primary',
  tool: 'acme',
  topics: ['design:token'],
  title: 'Primary color',
}
export const docTypeFact = { id: 'clarify-kit.doc-types.doc', tool: 'clarify-kit', topics: ['doc-types'], title: 'doc type' }
