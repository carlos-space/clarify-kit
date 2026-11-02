// Builds each entry into `dist/<entry>/index.json`, the file a docs package ships. The top-level fields are the six
// of `clarify-kit.index.fields`, in that order, and `formatVersion` is the one of `clarify-kit.index.format-version`.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import type { Config } from './config.ts'
import type { Document } from './docs.ts'
import type { PublishInfo } from './entry.ts'
import { InputError } from './errors.ts'
import { loadProject } from './load.ts'
import type { LoadedEntry, Problem } from './load.ts'

/** The version of the index format this package writes. A reader takes the same major. */
export const FORMAT_VERSION = '1.0'

/** The built `dist/<entry>/index.json`. */
export interface DocsIndex {
  formatVersion: string
  package: string
  entry: string
  describes: Record<string, string>
  publish: PublishInfo
  docs: Document[]
}

export interface BuildResult {
  /** Absolute paths of the index files written, in entry order. Empty when `problems` is not. */
  written: string[]
  /** Problems that stopped the build, and warnings (`outside-entry`) that did not. */
  problems: Problem[]
  ok: boolean
}

/** The package name from the package.json of the project directory. */
export function readPackageName(dir: string): string {
  try {
    const name = (JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8')) as { name?: unknown }).name
    if (typeof name === 'string' && name !== '') return name
  } catch (error) {
    throw new InputError(`cannot read ${join(dir, 'package.json')}: ${(error as Error).message}`)
  }
  throw new InputError(`${join(dir, 'package.json')} has no name`)
}

/** The index of one entry that loaded. */
export function buildIndex(packageName: string, entry: LoadedEntry): DocsIndex {
  if (entry.entry === undefined) throw new InputError(`entry "${entry.name}" has no describes and publish`)
  return {
    formatVersion: FORMAT_VERSION,
    package: packageName,
    entry: entry.name,
    describes: entry.entry.describes,
    publish: entry.entry.publish,
    docs: entry.documents.map((d) => d.document),
  }
}

/** Writes the index of every entry. Nothing is written when a source fails to load. */
export async function buildProject(config: Config): Promise<BuildResult> {
  const project = await loadProject(config)
  const blocking = project.problems.filter((p) => p.code === 'load-error')
  if (blocking.length > 0) return { written: [], problems: project.problems, ok: false }
  const packageName = readPackageName(config.dir)
  const written: string[] = []
  for (const entry of project.entries) {
    const file = join(config.dir, 'dist', entry.name, 'index.json')
    mkdirSync(dirname(file), { recursive: true })
    writeFileSync(file, `${JSON.stringify(buildIndex(packageName, entry), null, 2)}\n`)
    written.push(file)
  }
  return { written, problems: project.problems, ok: true }
}
