// The rules of `clarify-kit check`, with the codes of `clarify-kit.check.codes`. A fact a document cites is looked up
// through fact-kit (`loadInstalledIndex` and `selectFacts`), never by parsing an `index.json` here, so a facts
// package built by an older fact-kit (index format 1.x) is read as well as one built by 2.0.
import { loadInstalledIndex, loadInstalledJson, selectFacts } from 'fact-kit'
import type { Config } from './config.ts'
import { CONFIG_FILE } from './config.ts'
import { isLayer } from './entry.ts'
import type { Layer } from './entry.ts'
import { DocModelError, InputError } from './errors.ts'
import { loadProject } from './load.ts'
import type { LoadedDocument, LoadedEntry, Problem, ProblemCode } from './load.ts'
import { assertDocsIndex } from './read.ts'
import { missingSections } from './templates.ts'

/** What a document needs to know about a source it cites: where the cited thing is, and the layer of the source. */
interface Source {
  spec: string
  /** Undefined when neither the index of the source nor the config gives one. */
  layer: Layer | undefined
}

/** Every fact a reader on head sees in `config.factSources`, pending rows included, with the first source that has it. */
function factsOf(config: Config): { sources: Source[]; owner: Map<string, Source>; problems: Problem[] } {
  const sources: Source[] = []
  const owner = new Map<string, Source>()
  const problems: Problem[] = []
  for (const spec of config.factSources) {
    let facts
    let declared: unknown
    try {
      const { index } = loadInstalledIndex(spec, config.dir)
      declared = index.layer
      const labels = new Set<string>()
      for (const fact of index.facts) for (const row of fact.variants ?? []) if (row.pending !== undefined) labels.add(row.pending)
      facts = selectFacts(index, { version: 'head', include: [...labels] })
    } catch (error) {
      throw new InputError(`cannot read the facts of "${spec}" from ${config.dir}: ${(error as Error).message}`)
    }
    const source = layerOfSource(config, spec, declared, problems)
    sources.push(source)
    for (const fact of facts) if (!owner.has(fact.id)) owner.set(fact.id, source)
  }
  return { sources, owner, problems }
}

/** The layer of a source: its index first, the config when the index has none. Reports `layer-mismatch` when both have one. */
function layerOfSource(config: Config, spec: string, declared: unknown, problems: Problem[]): Source {
  const fromIndex = isLayer(declared) ? declared : undefined
  const fromConfig = config.sourceLayers[spec]
  if (fromIndex !== undefined && fromConfig !== undefined && fromIndex !== fromConfig) {
    problems.push({
      code: 'layer-mismatch',
      message: `the config gives "${spec}" the layer "${fromConfig}", and its index declares "${fromIndex}"`,
      location: CONFIG_FILE,
    })
  }
  return { spec, layer: fromIndex ?? fromConfig }
}

/** The ids of the facts a reader on head sees in the facts packages `config.factSources` names, pending rows included. */
export function knownFactIds(config: Config): Set<string> {
  return new Set(factsOf(config).owner.keys())
}

/** The documents of the installed docs packages `config.docSources` names, by source. */
function docsOf(config: Config, problems: Problem[]): Map<string, { source: Source; ids: Set<string> }> {
  const out = new Map<string, { source: Source; ids: Set<string> }>()
  for (const spec of config.docSources) {
    try {
      const installed = loadInstalledJson(spec, config.dir)
      const index = assertDocsIndex(installed.data, installed.file)
      out.set(spec, { source: layerOfSource(config, spec, index.layer, problems), ids: new Set(index.docs.map((d) => d.id)) })
    } catch (error) {
      throw new InputError(`cannot read the documents of "${spec}" from ${config.dir}: ${(error as Error).message}`)
    }
  }
  return out
}

/** `org`, `product` and `implementation` go from the top down; `tool` is below none of them. */
const RANK: Partial<Record<Layer, number>> = { org: 0, product: 1, implementation: 2 }

/** Whether a document of layer `from` cites something of layer `to` below it. */
function citesLower(from: Layer, to: Layer): boolean {
  const a = RANK[from]
  const b = RANK[to]
  return a !== undefined && b !== undefined && b > a
}

interface Lookup {
  facts: Map<string, Source>
  /** Local entries by name, with the layer they declare and the document ids in them. */
  entries: Map<string, { source: Source; ids: Set<string> }>
  installed: Map<string, { source: Source; ids: Set<string> }>
}

function checkDocument(
  loaded: LoadedDocument,
  entry: LoadedEntry,
  lookup: Lookup,
  decisions: ReadonlySet<string>,
  add: (code: ProblemCode, message: string, location: string) => void,
): void {
  const { document, location } = loaded
  const label = `${document.type} "${document.id}"`

  try {
    for (const id of missingSections(document)) {
      add('missing-required-section', `${label} lacks the section "${id}" that its template "${document.template}" requires`, location)
    }
  } catch (error) {
    if (!(error instanceof DocModelError)) throw error
    add('load-error', `${label}: ${error.message}`, location)
  }

  if (document.type === 'requirement') {
    for (const section of document.sections) {
      section.blocks.forEach((block, i) => {
        if (block.kind === 'scenario' && block.facts.length === 0) {
          add('scenario-without-fact', `${label} section "${section.id}" blocks[${i}] is a scenario that cites no fact`, location)
        }
      })
    }
  }

  const layer = entry.entry?.layer
  const undeclared = new Set<string>()
  const cite = (what: string, to: Source): void => {
    if (to.layer === undefined) {
      if (layer !== undefined && !undeclared.has(to.spec)) {
        undeclared.add(to.spec)
        add('undeclared-layer', `${label} cites ${what}, but "${to.spec}" has no layer: its index declares none and the config does not give one`, location)
      }
    } else if (layer !== undefined && citesLower(layer, to.layer)) {
      add('cites-lower-layer', `${label} is in layer "${layer}" and cites ${what} of layer "${to.layer}" from "${to.spec}"`, location)
    }
  }

  for (const id of document.factRefs) {
    const source = lookup.facts.get(id)
    if (source === undefined) {
      add('unknown-fact-reference', `${label} cites the fact "${id}", which no facts package in factSources has`, location)
    } else {
      cite(`the fact "${id}"`, source)
    }
  }

  for (const ref of document.docRefs) {
    const hash = ref.lastIndexOf('#')
    const target = ref.slice(0, hash)
    const id = ref.slice(hash + 1)
    const found = lookup.entries.get(target) ?? lookup.installed.get(target)
    if (found === undefined || !found.ids.has(id)) {
      add('unknown-doc-reference', `${label} cites the document "${ref}", which is in no entry of the project and no package in docSources`, location)
    } else {
      cite(`the document "${ref}"`, found.source)
    }
  }

  if (document.type === 'decision') {
    for (const id of document.supersedes) {
      if (!decisions.has(id)) add('supersedes-unknown', `${label} supersedes "${id}", which is not a decision of entry "${entry.name}"`, location)
    }
  }
}

/** Every problem of the project, in the order entries, then documents, then rules. An empty list means the check passes. */
export async function checkProject(config: Config): Promise<Problem[]> {
  const project = await loadProject(config)
  const problems = [...project.problems]
  const { sources: _sources, owner, problems: factProblems } = factsOf(config)
  problems.push(...factProblems)
  const installed = docsOf(config, problems)
  const entries: Lookup['entries'] = new Map(
    project.entries.map((e) => [
      e.name,
      { source: { spec: e.name, layer: e.entry?.layer }, ids: new Set(e.documents.map((d) => d.document.id)) },
    ]),
  )
  const lookup: Lookup = { facts: owner, entries, installed }
  const add = (code: ProblemCode, message: string, location: string): void => {
    problems.push({ code, message, location })
  }
  for (const entry of project.entries) {
    const seen = new Map<string, string>()
    for (const loaded of entry.documents) {
      const first = seen.get(loaded.document.id)
      if (first !== undefined) {
        add('duplicate-document-id', `id "${loaded.document.id}" is also the id of ${first} in entry "${entry.name}"`, loaded.location)
      } else {
        seen.set(loaded.document.id, loaded.location)
      }
    }
    const decisions = new Set(entry.documents.filter((d) => d.document.type === 'decision').map((d) => d.document.id))
    for (const loaded of entry.documents) checkDocument(loaded, entry, lookup, decisions, add)
  }
  return problems
}
