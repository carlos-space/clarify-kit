import { readFileSync } from 'node:fs'

export { BLOCK_FIELDS, BLOCK_KINDS, asset, code, docRefsOf, factBlock, factRefsOf, isBlock, list, scenario, table, text } from './blocks.ts'
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
export { DocModelError, InputError, RefusedError } from './errors.ts'
export { FORMAT_VERSION, buildIndex, buildProject, readPackageName } from './build.ts'
export type { BuildResult, DocsIndex } from './build.ts'
export { checkProject, knownFactIds } from './check.ts'
export { CONFIG_FILE, CONFIG_KEYS, readConfig } from './config.ts'
export type { Config } from './config.ts'
export { LAYERS, defineDocs, entryOf, isLayer } from './entry.ts'
export type { DocsEntry, Layer, ParsedEntry, PublishInfo } from './entry.ts'
export { DOC_FILE, PROBLEM_CODES, loadModules, loadProject } from './load.ts'
export type { LoadedDocument, LoadedEntry, Problem, ProblemCode, Project } from './load.ts'
export { DOC_DATA_KEYS, pinDocs, pinnableFields } from './pin.ts'
export { DOC_READ_ERROR_CODES, DocReadError, assertDocsIndex, readDocs, selectDocs } from './read.ts'
export type { DocReadErrorCode, DocReader, ReadDocsOptions, SelectOptions } from './read.ts'
export { IMPACT_EXTRACTOR_NAME, docImpactExtractor, registerDocImpactExtractor } from './impact.ts'
export { defaultFactMarkdown, documentMarkdown, outputRefusal, renderProject } from './render.ts'
export type { RenderOptions, RenderResult } from './render.ts'
export { USAGE, run } from './run.ts'
export type { Io } from './run.ts'
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



export const usage = 'usage: clarify-kit build | check | pin --version <v> | render | --version | --help'
