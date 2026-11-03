// The four document types and their constructors. A type is a governance rule (states, version field, what is frozen),
// not a kind of content: the kind of content is the template, the topics and the blocks.
import type { Since } from 'fact-kit'
import { setMark } from 'fact-kit'
import { factRefsOf, isBlock } from './blocks.ts'
import type { Block, Versioned } from './blocks.ts'
import { DocModelError } from './errors.ts'
import { topicsOf } from './topics.ts'
import {
  dateOf,
  onlyKeys,
  pendingOf,
  requireArray,
  requireObject,
  requireOneOf,
  requireText,
  sinceOf,
  slug,
  versionOf,
} from './validate.ts'

export type DocType = 'doc' | 'requirement' | 'decision' | 'record'

export type DocStatus = 'draft' | 'active' | 'deprecated'
export type RequirementStatus = 'planned' | 'in-progress' | 'shipped'
export type DecisionStatus = 'proposed' | 'accepted' | 'rejected' | 'superseded'

/** The types as `clarify-kit.doc-types.<kind>` lists them. */
export const DOC_TYPES = {
  doc: { lifecycle: 'living', states: ['draft', 'active', 'deprecated'], versionField: 'since' },
  requirement: { lifecycle: 'living', states: ['planned', 'in-progress', 'shipped'], versionField: 'release' },
  decision: {
    lifecycle: 'record',
    states: ['proposed', 'accepted', 'rejected', 'superseded'],
    versionField: 'appliesFrom',
  },
  record: { lifecycle: 'record', states: [], versionField: 'date' },
} as const satisfies Record<DocType, { lifecycle: 'living' | 'record'; states: readonly string[]; versionField: string }>

export const DOC_TYPE_NAMES = Object.keys(DOC_TYPES) as DocType[]

export interface Section extends Versioned {
  id: string
  title: string
  blocks: Block[]
}

/** A section of the body. `id` is what a template's required sections are matched against. */
export function section(id: string, title: string, blocks: readonly Block[], options?: Versioned): Section {
  const out: Section = {
    id: slug(id, 'section id'),
    title: requireText(title, 'section title'),
    blocks: requireArray(blocks, `section "${id}" blocks`).map((b, i) => {
      if (!isBlock(b)) throw new DocModelError(`section "${id}" blocks[${i}] was not made by a block builder`)
      return b
    }),
  }
  if (options !== undefined) {
    const o = requireObject(options, 'section options')
    onlyKeys(o, ['since', 'pending'], 'section options')
    if (o.since !== undefined) out.since = sinceOf(o.since, 'section since')
    if (o.pending !== undefined) out.pending = pendingOf(o.pending, 'section pending')
  }
  return out
}

interface Common {
  /** Names the document; `supersedes` points at it. Lowercase words joined by `-`. */
  id: string
  title: string
  /** Topics shared with the `topics` of a fact, e.g. `design:token`. */
  topics?: string[]
  sections: Section[]
  /** Only a reader on head that includes this label sees the document. */
  pending?: string
}

export interface DocInput extends Common {
  status: DocStatus
  since?: Since
}
export interface RequirementInput extends Common {
  status: RequirementStatus
  /** The product version the requirement is planned into, "next", or null / left out when not scheduled. */
  release?: string | null
}
export interface DecisionInput extends Common {
  status: DecisionStatus
  /** The version the decision starts to apply from, or "next". */
  appliesFrom: string
  /** Id, or ids, of the decisions this one replaces. */
  supersedes?: string | string[]
}
export interface RecordInput extends Common {
  /** `YYYY-MM-DD`. */
  date: string
}

interface Built {
  id: string
  title: string
  topics: string[]
  sections: Section[]
  /** The template the document was written from, if it was. */
  template?: string
  pending?: string
  /** Ids of every fact the body cites, each once, in the order they first appear. */
  factRefs: string[]
}
export type DocDocument = Built & { type: 'doc'; status: DocStatus; since?: Since }
export type RequirementDocument = Built & { type: 'requirement'; status: RequirementStatus; release: string | null }
export type DecisionDocument = Built & {
  type: 'decision'
  status: DecisionStatus
  appliesFrom: string
  supersedes: string[]
}
export type RecordDocument = Built & { type: 'record'; date: string }
export type Document = DocDocument | RequirementDocument | DecisionDocument | RecordDocument

const DOCUMENT = Symbol.for('clarify-kit.document')

/** True for a document a constructor of this package made. */
export const isDocument = (value: unknown): value is Document =>
  typeof value === 'object' && value !== null && (value as Record<symbol, unknown>)[DOCUMENT] === true

const COMMON_KEYS = ['id', 'title', 'topics', 'sections', 'pending'] as const

function built(input: Record<string, unknown>, type: DocType, template: string | undefined): Built {
  const id = slug(input.id, `${type} id`)
  const sections = requireArray(input.sections, `${type} "${id}" sections`).map((s, i) => {
    const sec = requireObject(s, `${type} "${id}" sections[${i}]`) as unknown as Section
    if (!Array.isArray(sec.blocks) || !sec.blocks.every(isBlock)) {
      throw new DocModelError(`${type} "${id}" sections[${i}] was not made by section()`)
    }
    return sec
  })
  const seen = new Set<string>()
  for (const sec of sections) {
    if (seen.has(sec.id)) throw new DocModelError(`${type} "${id}" has two sections "${sec.id}"`)
    seen.add(sec.id)
  }
  const out: Built = {
    id,
    title: requireText(input.title, `${type} "${id}" title`),
    topics: topicsOf(input.topics, `${type} "${id}" topics`),
    sections,
    factRefs: [...new Set(sections.flatMap((s) => s.blocks.flatMap(factRefsOf)))],
  }
  if (template !== undefined) out.template = template
  if (input.pending !== undefined) out.pending = pendingOf(input.pending, `${type} "${id}" pending`)
  return out
}

function finish<T extends Document>(document: T): T {
  setMark(document, DOCUMENT, true)
  return document
}

/** @internal `template` is set by the template functions. */
export interface Options {
  template?: string
}

export function doc(input: DocInput, options?: Options): DocDocument {
  const i = requireObject(input, 'doc')
  onlyKeys(i, [...COMMON_KEYS, 'status', 'since'], 'doc')
  const out: DocDocument = {
    type: 'doc',
    ...built(i, 'doc', options?.template),
    status: requireOneOf(i.status, DOC_TYPES.doc.states, 'doc status'),
  }
  if (i.since !== undefined) out.since = sinceOf(i.since, 'doc since')
  return finish(out)
}

export function requirement(input: RequirementInput, options?: Options): RequirementDocument {
  const i = requireObject(input, 'requirement')
  onlyKeys(i, [...COMMON_KEYS, 'status', 'release'], 'requirement')
  return finish({
    type: 'requirement',
    ...built(i, 'requirement', options?.template),
    status: requireOneOf(i.status, DOC_TYPES.requirement.states, 'requirement status'),
    release: i.release === undefined || i.release === null ? null : versionOf(i.release, 'requirement release'),
  })
}

export function decision(input: DecisionInput, options?: Options): DecisionDocument {
  const i = requireObject(input, 'decision')
  onlyKeys(i, [...COMMON_KEYS, 'status', 'appliesFrom', 'supersedes'], 'decision')
  const base = built(i, 'decision', options?.template)
  const list = i.supersedes === undefined ? [] : Array.isArray(i.supersedes) ? i.supersedes : [i.supersedes]
  const supersedes = [...new Set(list.map((s, n) => slug(s, `decision "${base.id}" supersedes[${n}]`)))]
  if (supersedes.includes(base.id)) throw new DocModelError(`decision "${base.id}" cannot supersede itself`)
  return finish({
    type: 'decision',
    ...base,
    status: requireOneOf(i.status, DOC_TYPES.decision.states, 'decision status'),
    appliesFrom: versionOf(i.appliesFrom, 'decision appliesFrom'),
    supersedes,
  })
}

export function record(input: RecordInput, options?: Options): RecordDocument {
  const i = requireObject(input, 'record')
  if ('status' in i) throw new DocModelError('record has no status')
  onlyKeys(i, [...COMMON_KEYS, 'date'], 'record')
  return finish({
    type: 'record',
    ...built(i, 'record', options?.template),
    date: dateOf(i.date, 'record date'),
  })
}

export interface InputOf {
  doc: DocInput
  requirement: RequirementInput
  decision: DecisionInput
  record: RecordInput
}

/** Builds a document of `type` through the constructor of that type. */
export function build<T extends DocType>(type: T, input: InputOf[T], options?: Options): Document {
  switch (type) {
    case 'doc':
      return doc(input as DocInput, options)
    case 'requirement':
      return requirement(input as RequirementInput, options)
    case 'decision':
      return decision(input as DecisionInput, options)
    case 'record':
      return record(input as RecordInput, options)
    default:
      throw new DocModelError(`unknown document type "${String(type)}"`)
  }
}
