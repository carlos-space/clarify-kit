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

/** Raised when a command is refused on purpose, for example `render` into a git work tree. The CLI exits with 1. */
export class RefusedError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'RefusedError'
  }
}
