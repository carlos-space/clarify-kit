// Small checks every builder shares. They build on the helpers fact-kit exports for its own builders,
// so a value that is "text" or an "object" means the same here as in a fact.
import { isObject, isText, parseVersion, sinceIssue } from 'fact-kit'
import type { Since } from 'fact-kit'
import { DocModelError } from './errors.ts'

export { isObject }

/** The id of a fact, `<tool>.<name>`. Whether the fact exists is for `check`, not for the builder. */
const FACT_ID = /^[^\s.:]+\.\S+$/
/** The label of a `pending` tag. */
const PENDING = /^[a-z0-9]+(-[a-z0-9]+)*$/
/** An id of a document or a section. */
const SLUG = /^[a-z0-9]+(-[a-z0-9]+)*$/

export function requireText(value: unknown, what: string): string {
  if (typeof value !== 'string' || !isText(value)) throw new DocModelError(`${what} must be a non-empty string`)
  return value
}

export function requireObject(value: unknown, what: string): Record<string, unknown> {
  if (!isObject(value)) throw new DocModelError(`${what} must be an object`)
  return value
}

export function requireArray(value: unknown, what: string): unknown[] {
  if (!Array.isArray(value)) throw new DocModelError(`${what} must be an array`)
  return value
}

/** Refuses a key that is not in `allowed`, so a misspelt field is not dropped without a word. */
export function onlyKeys(input: Record<string, unknown>, allowed: readonly string[], what: string): void {
  for (const key of Object.keys(input)) {
    if (!allowed.includes(key)) throw new DocModelError(`${what} has an unknown field "${key}"`)
  }
}

export function requireOneOf<T extends string>(value: unknown, allowed: readonly T[], what: string): T {
  if (typeof value !== 'string' || !(allowed as readonly string[]).includes(value)) {
    throw new DocModelError(`${what} must be one of ${allowed.map((a) => `"${a}"`).join(', ')}, got ${JSON.stringify(value)}`)
  }
  return value as T
}

export function slug(value: unknown, what: string): string {
  const text = requireText(value, what)
  if (!SLUG.test(text)) throw new DocModelError(`${what} "${text}" must be lowercase words joined by "-"`)
  return text
}

/** A `since` in the forms fact-kit allows: a version, "next", or one version per release line. */
export function sinceOf(value: unknown, what: string): Since {
  const ok = typeof value === 'string' || (Array.isArray(value) && value.every((v) => typeof v === 'string'))
  if (!ok) throw new DocModelError(`${what} must be a version string or an array of them`)
  const issue = sinceIssue(value as Since)
  if (issue) throw new DocModelError(`${what}: ${issue.message}`)
  return value as Since
}

export function pendingOf(value: unknown, what: string): string {
  const text = requireText(value, what)
  if (!PENDING.test(text)) throw new DocModelError(`${what} "${text}" must be lowercase words joined by "-"`)
  return text
}

/** A semver version, or "next" when `allowNext`. */
export function versionOf(value: unknown, what: string, allowNext = true): string {
  const text = requireText(value, what)
  if (text === 'next' ? !allowNext : parseVersion(text) === undefined) {
    throw new DocModelError(`${what} "${text}" is not a semver version${allowNext ? ' or "next"' : ''}`)
  }
  return text
}

export function dateOf(value: unknown, what: string): string {
  const text = requireText(value, what)
  const valid = /^\d{4}-\d{2}-\d{2}$/.test(text) && new Date(`${text}T00:00:00Z`).toISOString().startsWith(text)
  if (!valid) throw new DocModelError(`${what} "${text}" must be a date written YYYY-MM-DD`)
  return text
}

/** The id a fact reference stands for: a fact id string or an imported fact object. */
export function factIdOf(ref: unknown, what: string): string {
  const id = typeof ref === 'string' ? ref : isObject(ref) ? ref.id : undefined
  if (typeof id !== 'string' || !FACT_ID.test(id)) {
    throw new DocModelError(`${what} must be a fact id "<tool>.<name>" or a fact object, got ${JSON.stringify(id ?? ref)}`)
  }
  return id
}

/** Fact references as ids, in the order written, each once. */
export function factIdsOf(refs: unknown, what: string): string[] {
  const list = Array.isArray(refs) ? refs : [refs]
  return [...new Set(list.map((ref, i) => factIdOf(ref, `${what}[${i}]`)))]
}
