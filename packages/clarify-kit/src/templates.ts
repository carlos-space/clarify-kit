// Templates give a document a skeleton of sections and the sections it must have. The ten standard templates are
// registered here; a module registers its own with `registerTemplate`, and a function that renders a fact with
// `registerRenderer`. Checking that a document has its required sections is `check`'s job, `missingSections` is the
// lookup it uses.
import type { SelectedFact } from 'fact-kit'
import { build } from './docs.ts'
import type { DocDocument, DocInput, DocType, Document, InputOf, RecordDocument, RecordInput } from './docs.ts'
import { DocModelError } from './errors.ts'
import { onlyKeys, requireObject, requireOneOf, requireText, slug } from './validate.ts'
import { DOC_TYPE_NAMES } from './docs.ts'

export interface TemplateSection {
  id: string
  title: string
  required: boolean
}
export interface Template {
  name: string
  type: DocType
  sections: TemplateSection[]
}

/**
 * What a renderer is told about the reader it renders for and the place of the fact block, as
 * `clarify-kit.modules.render-context` lists them. `version` and `include` are the ones the facts were chosen with, so a
 * renderer that looks up another fact reads it the same way. `document` and `section` let it write anchors and links
 * that are unique across the documents of one render.
 */
export interface RenderContext {
  /** The version the reader runs, or "head". */
  readonly version: string
  /** The `pending` labels the reader includes. */
  readonly include: readonly string[]
  /** The document the fact block is in. */
  readonly document: { readonly id: string; readonly type: DocType }
  /** The id of the section the fact block is in. */
  readonly section: string
}
export type Renderer = (fact: SelectedFact, context: RenderContext) => string

const templates = new Map<string, Template>()
const renderers = new Map<string, Renderer>()

/** Registers a template. A name that is already registered, standard or not, is refused. */
export function registerTemplate(template: Template): void {
  const t = requireObject(template, 'template')
  onlyKeys(t, ['name', 'type', 'sections'], 'template')
  const name = slug(t.name, 'template name')
  if (templates.has(name)) throw new DocModelError(`template "${name}" is already registered`)
  const type = requireOneOf(t.type, DOC_TYPE_NAMES, `template "${name}" type`)
  if (!Array.isArray(t.sections) || t.sections.length === 0) {
    throw new DocModelError(`template "${name}" sections must be a non-empty array`)
  }
  const ids = new Set<string>()
  const sections = t.sections.map((s: unknown, i: number): TemplateSection => {
    const o = requireObject(s, `template "${name}" sections[${i}]`)
    onlyKeys(o, ['id', 'title', 'required'], `template "${name}" sections[${i}]`)
    const id = slug(o.id, `template "${name}" sections[${i}] id`)
    if (ids.has(id)) throw new DocModelError(`template "${name}" has two sections "${id}"`)
    ids.add(id)
    if (typeof o.required !== 'boolean') throw new DocModelError(`template "${name}" sections[${i}] required must be a boolean`)
    return { id, title: requireText(o.title, `template "${name}" sections[${i}] title`), required: o.required }
  })
  templates.set(name, { name, type, sections })
}

export const getTemplate = (name: string): Template | undefined => templates.get(name)
export const listTemplates = (): Template[] => [...templates.values()]

/** Registers a function that renders a fact; a fact block selects it with its `renderer` field. */
export function registerRenderer(name: string, render: Renderer): void {
  const key = requireText(name, 'renderer name')
  if (typeof render !== 'function') throw new DocModelError(`renderer "${key}" must be a function`)
  if (renderers.has(key)) throw new DocModelError(`renderer "${key}" is already registered`)
  renderers.set(key, render)
}

export const getRenderer = (name: string): Renderer | undefined => renderers.get(name)
export const listRenderers = (): string[] => [...renderers.keys()]

/** Writes a document from the template `name`. The input is the one the constructor of the template's type takes. */
export function fromTemplate<T extends DocType>(name: string, input: InputOf[T]): Document {
  const template = templates.get(name)
  if (!template) throw new DocModelError(`unknown template "${name}"`)
  return build(template.type as T, input, { template: name })
}

/** The ids of the sections of `template` a document must have, in order. */
export function requiredSections(name: string): string[] {
  const template = templates.get(name)
  if (!template) throw new DocModelError(`unknown template "${name}"`)
  return template.sections.filter((s) => s.required).map((s) => s.id)
}

/** The required sections a document written from a template does not have. A document without a template has none missing. */
export function missingSections(document: Document): string[] {
  if (document.template === undefined) return []
  const have = new Set(document.sections.map((s) => s.id))
  return requiredSections(document.template).filter((id) => !have.has(id))
}

/** The empty sections of a template, to fill with blocks. */
export function skeletonOf(name: string): { id: string; title: string; blocks: [] }[] {
  const template = templates.get(name)
  if (!template) throw new DocModelError(`unknown template "${name}"`)
  return template.sections.map((s) => ({ id: s.id, title: s.title, blocks: [] }))
}

const titleCase = (id: string): string => id.replace(/-/g, ' ').replace(/^./, (c) => c.toUpperCase())

/** The standard templates and their required sections, in order, as `clarify-kit.templates.<name>` lists them. */
export const STANDARD_TEMPLATES = {
  vision: { type: 'doc', requiredSections: ['purpose', 'audience', 'outcome'] },
  goal: { type: 'doc', requiredSections: ['objective', 'measure', 'non-goals'] },
  problem: { type: 'doc', requiredSections: ['situation', 'impact', 'cause'] },
  policy: { type: 'doc', requiredSections: ['rule', 'rationale', 'scope', 'exceptions'] },
  concept: { type: 'doc', requiredSections: ['definition', 'scope', 'relations'] },
  guide: { type: 'doc', requiredSections: ['goal', 'prerequisites', 'steps', 'verify'] },
  example: { type: 'doc', requiredSections: ['context', 'sample', 'explanation'] },
  research: { type: 'record', requiredSections: ['question', 'method', 'findings', 'conclusion'] },
  retro: { type: 'record', requiredSections: ['summary', 'went-well', 'to-improve', 'actions'] },
  release: { type: 'record', requiredSections: ['version', 'changes', 'upgrade-notes'] },
} as const

export type StandardTemplate = keyof typeof STANDARD_TEMPLATES

for (const [name, { type, requiredSections: ids }] of Object.entries(STANDARD_TEMPLATES)) {
  registerTemplate({ name, type, sections: ids.map((id) => ({ id, title: titleCase(id), required: true })) })
}

const docTemplate = (name: StandardTemplate) => (input: DocInput): DocDocument =>
  fromTemplate<'doc'>(name, input) as DocDocument
const recordTemplate = (name: StandardTemplate) => (input: RecordInput): RecordDocument =>
  fromTemplate<'record'>(name, input) as RecordDocument

export const vision = docTemplate('vision')
export const goal = docTemplate('goal')
export const problem = docTemplate('problem')
export const policy = docTemplate('policy')
export const concept = docTemplate('concept')
export const guide = docTemplate('guide')
export const example = docTemplate('example')
export const research = recordTemplate('research')
export const retro = recordTemplate('retro')
export const release = recordTemplate('release')
