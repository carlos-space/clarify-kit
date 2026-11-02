// `clarify-kit render`: writes the documents as Markdown, one file per document, to a place outside every git work tree
// (`clarify-kit.cli.render-location`). The output is never part of the repository, the sources are the only truth.
// A fact block calls the renderer the module registered under its `renderer` name, and a fact block without one gets the
// plain rendering of `defaultFactMarkdown`.
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { loadInstalledIndex, selectFacts } from 'fact-kit'
import type { SelectedFact } from 'fact-kit'
import type { Block } from './blocks.ts'
import type { Config } from './config.ts'
import type { Document } from './docs.ts'
import { InputError, RefusedError } from './errors.ts'
import { knownFactIds } from './check.ts'
import { loadProject } from './load.ts'
import { selectDocs } from './read.ts'
import { getRenderer } from './templates.ts'
import type { RenderContext } from './templates.ts'

export interface RenderOptions {
  /** Output directory. Defaults to a new directory under `os.tmpdir()`. */
  out?: string
  /** The version the reader runs. Without it the reader is on head. */
  version?: string
  /** Labels of `pending` content a reader on head also sees. */
  include?: readonly string[]
}

export interface RenderResult {
  /** Absolute output directory. */
  out: string
  /** Absolute paths of the files written, in entry and document order. */
  written: string[]
}

/** Whether `dir`, or the closest directory above it that exists, is inside a git work tree. A place git can not be asked about is outside. */
export function insideWorkTree(dir: string): boolean {
  let current = resolve(dir)
  while (!existsSync(current) && dirname(current) !== current) current = dirname(current)
  try {
    return execFileSync('git', ['-C', current, 'rev-parse', '--is-inside-work-tree'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim() === 'true'
  } catch {
    return false
  }
}

const cell = (text: string): string => text.replaceAll('|', '\\|').replaceAll('\n', ' ')

/** The rendering of a fact that has no renderer: its title, its description and the `value` of its content as JSON. */
export function defaultFactMarkdown(fact: SelectedFact): string {
  const title = typeof fact.title === 'string' ? fact.title : fact.id
  const lines = [`**${title}** (\`${fact.id}\`)`]
  if (typeof fact.description === 'string') lines.push('', fact.description)
  const content = fact.content as { value?: unknown }
  if (content.value !== undefined) lines.push('', '```json', JSON.stringify(content.value, null, 2), '```')
  return lines.join('\n')
}

function blockMarkdown(block: Block, facts: ReadonlyMap<string, SelectedFact>, known: ReadonlySet<string>, context: RenderContext): string {
  switch (block.kind) {
    case 'text':
      return block.text
    case 'list':
      return block.items.map((item, i) => `${block.ordered ? `${i + 1}.` : '-'} ${item}`).join('\n')
    case 'table':
      return [
        `| ${block.columns.map(cell).join(' | ')} |`,
        `| ${block.columns.map(() => '---').join(' | ')} |`,
        ...block.rows.map((row) => `| ${row.map(cell).join(' | ')} |`),
      ].join('\n')
    case 'code':
      return `\`\`\`${block.lang}\n${block.code}\n\`\`\``
    case 'asset':
      return `![${block.alt ?? ''}](${block.path})`
    case 'scenario':
      return [`**Scenario:** ${block.scenario}`, `**Expected:** ${block.expected}`, `**Judgement:** ${block.judgement}`].join('\n\n')
    case 'fact': {
      const render = block.renderer === undefined ? undefined : getRenderer(block.renderer)
      if (block.renderer !== undefined && render === undefined) {
        throw new InputError(`${context.document.id}: the fact block names the renderer "${block.renderer}", which no module registered`)
      }
      const parts: string[] = []
      for (const id of block.facts) {
        const fact = facts.get(id)
        if (fact === undefined) {
          // A fact the reader does not see (older version, pending label not included) is left out; a fact no package has is an error.
          if (!known.has(id)) throw new InputError(`${context.document.id}: the fact "${id}" is in no package of factSources`)
          continue
        }
        const text = render === undefined ? defaultFactMarkdown(fact) : render(fact, context)
        if (typeof text !== 'string') throw new InputError(`the renderer "${block.renderer}" returned ${typeof text} for ${id}, and a renderer returns a string`)
        parts.push(text)
      }
      return parts.join('\n\n')
    }
  }
}

/** The Markdown of one document. */
export function documentMarkdown(
  document: Document,
  facts: ReadonlyMap<string, SelectedFact>,
  known: ReadonlySet<string>,
  reader: { version: string; include: readonly string[] },
): string {
  const out = [`# ${document.title}`]
  for (const section of document.sections) {
    out.push(`## ${section.title}`)
    const context: RenderContext = { ...reader, document: { id: document.id, type: document.type }, section: section.id }
    for (const block of section.blocks) {
      const text = blockMarkdown(block, facts, known, context)
      if (text !== '') out.push(text)
    }
  }
  return `${out.join('\n\n')}\n`
}

function selectedFacts(config: Config, reader: { version: string; include: readonly string[] }): Map<string, SelectedFact> {
  const facts = new Map<string, SelectedFact>()
  for (const spec of config.factSources) {
    try {
      const { index } = loadInstalledIndex(spec, config.dir)
      for (const fact of selectFacts(index, { version: reader.version, include: reader.include })) facts.set(fact.id, fact)
    } catch (error) {
      throw new InputError(`cannot read the facts of "${spec}" from ${config.dir}: ${(error as Error).message}`)
    }
  }
  return facts
}

/**
 * Renders every document of every entry to `<out>/<entry>/<document id>.md`. Throws {@link RefusedError} when `out` is
 * inside a git work tree, and writes nothing then.
 */
export async function renderProject(config: Config, options: RenderOptions = {}): Promise<RenderResult> {
  const out = options.out === undefined ? mkdtempSync(join(tmpdir(), 'clarify-kit-render-')) : resolve(options.out)
  if (insideWorkTree(out)) {
    throw new RefusedError(`${out} is inside a git work tree. Rendered files are not part of the repository, so choose a directory outside it, or leave out --out for a new directory under ${tmpdir()}`)
  }
  const project = await loadProject(config)
  const failed = project.problems.filter((p) => p.code === 'load-error')
  if (failed.length > 0) throw new InputError(`cannot load: ${failed.map((p) => `${p.location}: ${p.message}`).join('; ')}`)
  const reader = { version: options.version ?? 'head', include: options.include ?? [] }
  const facts = selectedFacts(config, reader)
  const known = knownFactIds(config)
  const written: string[] = []
  for (const entry of project.entries) {
    const docs = selectDocs(entry.documents.map((d) => d.document), {
      ...(options.version === undefined ? {} : { version: options.version }),
      include: reader.include,
    })
    for (const document of docs) {
      const file = join(out, entry.name, `${document.id}.md`)
      mkdirSync(dirname(file), { recursive: true })
      writeFileSync(file, documentMarkdown(document, facts, known, reader))
      written.push(file)
    }
  }
  return { out, written }
}
