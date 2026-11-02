// The content hash of a decision or a record, as `clarify-kit.doc-types.content-hash` defines it: sha256 of the
// normalized body blocks, written as JSON with sorted keys. The state, the version fields, `supersedes` and the
// `since` and `pending` of a section or block are left out, so pinning a version, taking off a `pending` label when
// the feature lands, or replacing a decision does not change it.
import { createHash } from 'node:crypto'
import type { Document } from './docs.ts'

/** JSON with sorted object keys and no `undefined`, so equal values give equal strings. */
function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`
  if (value !== null && typeof value === 'object') {
    const entries = Object.entries(value)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonical(v)}`).join(',')}}`
  }
  return JSON.stringify(value) ?? 'null'
}

/** `since` and `pending` mark a release, they are not the text of the body. */
const withoutMarks = <T extends object>(item: T): Omit<T, 'since' | 'pending'> => {
  const { since: _since, pending: _pending, ...rest } = item as T & { since?: unknown; pending?: unknown }
  return rest
}

/** The body of a document as the hash reads it. */
export function bodyOf(document: Document): unknown {
  return document.sections.map((s) => ({ ...withoutMarks(s), blocks: s.blocks.map(withoutMarks) }))
}

export function contentHashOf(document: Document): string {
  return createHash('sha256').update(canonical(bodyOf(document))).digest('hex')
}
