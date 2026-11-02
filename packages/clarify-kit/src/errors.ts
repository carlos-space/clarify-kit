/** Raised while a `.doc.ts` is evaluated, when a builder gets a value the document model does not allow. */
export class DocModelError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'DocModelError'
  }
}
