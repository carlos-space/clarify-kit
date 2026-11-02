import { readFileSync } from 'node:fs'

export { BLOCK_FIELDS, BLOCK_KINDS, asset, code, factBlock, factRefsOf, isBlock, list, scenario, table, text } from './blocks.ts'
export type {
  AssetBlock,
  Block,
  BlockKind,
  CodeBlock,
  FactBlock,
  FactRef,
  ListBlock,
  ScenarioBlock,
  TableBlock,
  TextBlock,
  Versioned,
} from './blocks.ts'
export { DOC_TYPES, DOC_TYPE_NAMES, decision, doc, isDocument, record, requirement, section } from './docs.ts'
export type {
  DecisionDocument,
  DecisionInput,
  DecisionStatus,
  DocDocument,
  DocInput,
  DocStatus,
  DocType,
  Document,
  RecordDocument,
  RecordInput,
  RequirementDocument,
  RequirementInput,
  RequirementStatus,
  Section,
} from './docs.ts'
export { DocModelError } from './errors.ts'
export { TOPIC_PATTERN, isTopic, topic } from './topics.ts'
export {
  STANDARD_TEMPLATES,
  concept,
  example,
  fromTemplate,
  getRenderer,
  getTemplate,
  goal,
  guide,
  listRenderers,
  listTemplates,
  missingSections,
  policy,
  problem,
  registerRenderer,
  registerTemplate,
  release,
  requiredSections,
  research,
  retro,
  skeletonOf,
  vision,
} from './templates.ts'
export type { RenderContext, Renderer, StandardTemplate, Template, TemplateSection } from './templates.ts'

/** The version of this package, read from its package.json. */
export function version(): string {
  const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')) as { version: string }
  return pkg.version
}

export const usage = 'usage: clarify-kit --version | --help'
