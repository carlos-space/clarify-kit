// `clarify-kit render`: writes the documents as Markdown, one file per document, to a place outside every git work tree
// (`clarify-kit.cli.render-location`). The output is never part of the repository, the sources are the only truth.
// A fact block calls the renderer the module registered under its `renderer` name, and a fact block without one gets the
// plain rendering of `defaultFactMarkdown`.
import { execFileSync } from 'node:child_process'
import { lstatSync, mkdirSync, mkdtempSync, realpathSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, dirname, join, resolve, sep } from 'node:path'
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

/** Runs git in `cwd` and returns the trimmed stdout, `undefined` when git exits non-zero, and throws when git can not be started. */
function git(cwd: string, args: string[]): string | undefined {
  try {
    return execFileSync('git', ['-C', cwd, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim()
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') throw error
    return undefined
  }
}

const under = (path: string, root: string): boolean => path === root || path.startsWith(root.endsWith(sep) ? root : root + sep)

/**
 * The reason `dir` can not take rendered files, or `undefined` when it can. `dir` is resolved through symbolic links at the
 * closest ancestor that exists, then compared with the work tree root and the git directory of the repository there, so a
 * path under `.git/` or behind a link into the repository is refused as well. A place outside every repository is allowed.
 * When git can not be started, `whenGitMissing` decides: `'refuse'` for a place the user chose, `'allow'` for the tool's own.
 * Throws {@link InputError} when a link on the way can not be resolved.
 */
export function outputRefusal(dir: string, whenGitMissing: 'refuse' | 'allow' = 'refuse'): string | undefined {
  const target = resolve(dir)
  const rest: string[] = []
  let current = target
  for (;;) {
    try {
      lstatSync(current)
      break
    } catch {
      const parent = dirname(current)
      if (parent === current) break
      rest.unshift(basename(current))
      current = parent
    }
  }
  let real: string
  try {
    real = realpathSync(current)
  } catch (error) {
    throw new InputError(`cannot resolve the output location ${target}: ${current} is a link or path that can not be followed (${(error as NodeJS.ErrnoException).code ?? 'error'})`)
  }
  const path = join(real, ...rest)
  let gitDir: string | undefined
  let topLevel: string | undefined
  try {
    gitDir = git(real, ['rev-parse', '--absolute-git-dir'])
    // Inside the git directory there is no work tree and this fails, the git directory check below covers that place.
    topLevel = gitDir === undefined ? undefined : git(real, ['rev-parse', '--show-toplevel'])
  } catch {
    return whenGitMissing === 'allow' ? undefined : `${target} can not be checked because git is not available, so it is not known whether it is inside a repository`
  }
  if (gitDir === undefined) return undefined
  const roots = [topLevel, gitDir].filter((r): r is string => r !== undefined && r !== '').map((r) => realpathSync(r))
  const hit = roots.find((root) => under(path, root))
  if (hit === undefined) return undefined
  return `${target} is inside a git work tree or git directory (${hit})`
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
  const refusal = outputRefusal(out, options.out === undefined ? 'allow' : 'refuse')
  if (refusal !== undefined) {
    throw new RefusedError(`${refusal}. Rendered files are not part of the repository, so choose a directory outside it, or leave out --out for a new directory under ${tmpdir()}`)
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
