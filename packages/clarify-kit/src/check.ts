// The rules of `clarify-kit check`, with the codes of `clarify-kit.check.codes`. A fact a document cites is looked up
// through fact-kit (`loadInstalledIndex` and `selectFacts`), never by parsing an `index.json` here, so a facts
// package built by an older fact-kit (index format 1.x) is read as well as one built by 2.0.
import { loadInstalledIndex, selectFacts } from 'fact-kit'
import type { Config } from './config.ts'
import { DocModelError, InputError } from './errors.ts'
import { loadProject } from './load.ts'
import type { LoadedDocument, LoadedEntry, Problem, ProblemCode } from './load.ts'
import { missingSections } from './templates.ts'

/** The ids of the facts a reader on head sees in the facts packages `config.factSources` names, pending rows included. */
export function knownFactIds(config: Config): Set<string> {
  const ids = new Set<string>()
  for (const spec of config.factSources) {
    let facts
    try {
      const { index } = loadInstalledIndex(spec, config.dir)
      const labels = new Set<string>()
      for (const fact of index.facts) for (const row of fact.variants ?? []) if (row.pending !== undefined) labels.add(row.pending)
      facts = selectFacts(index, { version: 'head', include: [...labels] })
    } catch (error) {
      throw new InputError(`cannot read the facts of "${spec}" from ${config.dir}: ${(error as Error).message}`)
    }
    for (const fact of facts) ids.add(fact.id)
  }
  return ids
}

function checkDocument(
  loaded: LoadedDocument,
  entry: LoadedEntry,
  known: ReadonlySet<string>,
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

  for (const id of document.factRefs) {
    if (!known.has(id)) {
      add('unknown-fact-reference', `${label} cites the fact "${id}", which no facts package in factSources has`, location)
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
  const known = knownFactIds(config)
  const problems = [...project.problems]
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
    for (const loaded of entry.documents) checkDocument(loaded, entry, known, decisions, add)
  }
  return problems
}
