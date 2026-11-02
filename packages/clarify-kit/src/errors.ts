/** Raised while a `.doc.ts` is evaluated, when a builder gets a value the document model does not allow. */
export class DocModelError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'DocModelError'
  }
}

/** Raised when a command can not run: a bad setting, a file or a facts package it was told to read is unreadable. The CLI exits with 2. */
export class InputError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'InputError'
  }
}
