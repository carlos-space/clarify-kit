import { DocModelError } from './errors.ts'
import { requireText } from './validate.ts'

/** The format of a topic, shared with the `topics` of a fact: `<domain>:<name>`, e.g. `design:token`. */
export const TOPIC_PATTERN = '^[a-z0-9-]+:[a-z0-9-]+$'
const pattern = new RegExp(TOPIC_PATTERN)

export const isTopic = (value: unknown): value is string => typeof value === 'string' && pattern.test(value)

/** A topic, or an error when it is not written `<domain>:<name>`. */
export function topic(value: string): string {
  const text = requireText(value, 'topic')
  if (!isTopic(text)) throw new DocModelError(`topic "${text}" must be written <domain>:<name>, e.g. design:token`)
  return text
}

export function topicsOf(values: unknown, what: string): string[] {
  if (values === undefined) return []
  if (!Array.isArray(values)) throw new DocModelError(`${what} must be an array of topics`)
  const out = values.map((v) => topic(v as string))
  if (new Set(out).size !== out.length) throw new DocModelError(`${what} lists a topic twice`)
  return out
}
