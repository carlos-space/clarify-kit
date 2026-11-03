// Small project directories for the tests of build, check and the CLI. They are made under the `tmp/` of the repository
// and removed afterwards. A document written here imports the package from its source by absolute path.
import { cpSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

export const PACKAGE_DIR = fileURLToPath(new URL('..', import.meta.url))
export const SRC = join(PACKAGE_DIR, 'src', 'index.ts')
export const CLI = join(PACKAGE_DIR, 'src', 'cli.ts')
const ROOT = join(PACKAGE_DIR, '..', '..', 'tmp', 'clarify-kit-tests')

const made: string[] = []

export class Project {
  readonly dir: string
  constructor(label: string) {
    mkdirSync(ROOT, { recursive: true })
    this.dir = mkdtempSync(join(ROOT, `${label}-`))
    made.push(this.dir)
    this.write('package.json', JSON.stringify({ name: 'acme-docs', version: '0.0.0', type: 'module' }))
  }
  path(rel: string): string {
    return join(this.dir, rel)
  }
  write(rel: string, content: string): this {
    mkdirSync(dirname(this.path(rel)), { recursive: true })
    writeFileSync(this.path(rel), content)
    return this
  }
  read(rel: string): string {
    return readFileSync(this.path(rel), 'utf8')
  }
  json(rel: string): any {
    return JSON.parse(this.read(rel))
  }
  config(settings: Record<string, unknown> = {}): this {
    return this.write('clarify-kit.config.json', JSON.stringify({ docsDir: 'docs', ...settings }))
  }
  /** An `index.ts` that makes `docs/<entry>` an entry. */
  entry(entry = 'main', describes: Record<string, string> = { acme: '1.0.0' }, layer: string | null = 'implementation'): this {
    const declared = layer === null ? '' : `layer: '${layer}', `
    return this.write(
      `docs/${entry}/index.ts`,
      `import { defineDocs } from '${SRC}'\nexport default defineDocs({ ${declared}describes: ${JSON.stringify(describes)}, publish: { target: 'npm', name: 'acme-docs' } })\n`,
    )
  }
  /**
   * Installs a facts package `name` with the entry `acme`, in index format 2.1 with the `layer`, or format 2.0 when
   * there is none. It has one fact for each of `ids`.
   */
  factsPackage(name: string, ids: string[], layer?: string): this {
    this.write(`node_modules/${name}/package.json`, JSON.stringify({ name, version: '1.0.0', exports: { './acme/index.json': './acme/index.json' } }))
    const facts = ids.map((id) => ({ id, tool: id.split('.')[0], topics: ['t:x'], title: id, content: { value: 1 }, variants: [{ since: '1.0.0', content: { value: 1 } }], source: { kind: 'published' } }))
    const head = layer === undefined ? { indexFormat: '2.0', formatVersion: '2.0' } : { indexFormat: '2.1', formatVersion: '2.1', layer }
    return this.write(`node_modules/${name}/acme/index.json`, JSON.stringify({ ...head, package: name, entry: 'acme', describes: { acme: '1.0.0' }, publish: { target: 'npm', name }, facts }))
  }
  /** Installs a docs package `name` with the entry `main`, in index format 1.1 with the `layer`, or 1.0 when there is none, holding a document for each of `ids`. */
  docsPackage(name: string, ids: string[], layer?: string): this {
    this.write(`node_modules/${name}/package.json`, JSON.stringify({ name, version: '1.0.0', exports: { './main/index.json': './main/index.json' } }))
    const docs = ids.map((id) => ({ id, type: 'doc', title: id, topics: [], sections: [], factRefs: [], docRefs: [], status: 'active' }))
    const head = layer === undefined ? { formatVersion: '1.0', package: name, entry: 'main' } : { formatVersion: '1.1', package: name, entry: 'main', layer }
    return this.write(`node_modules/${name}/main/index.json`, JSON.stringify({ ...head, describes: { acme: '1.0.0' }, publish: { target: 'npm', name }, docs }))
  }
  /** Writes a `.doc.ts` that imports the names it needs from the package and default-exports `body`. */
  doc(rel: string, imports: string, body: string): this {
    return this.write(rel, `import { ${imports} } from '${SRC}'\n\nexport default ${body}\n`)
  }
  /** Installs a facts package fixture under `node_modules`. */
  install(fixture: string): this {
    const name = JSON.parse(readFileSync(join(PACKAGE_DIR, 'test', 'fixtures', fixture, 'package.json'), 'utf8')).name as string
    cpSync(join(PACKAGE_DIR, 'test', 'fixtures', fixture), this.path(`node_modules/${name}`), { recursive: true })
    return this
  }
  /** Copies the document samples of the document model into `docs/<entry>`, pointing their imports at the source by absolute path. */
  samples(entry = 'main'): this {
    const from = join(PACKAGE_DIR, 'test', 'samples')
    for (const name of readdirSync(from)) {
      this.write(`docs/${entry}/${name}`, readFileSync(join(from, name), 'utf8').replaceAll("'../../src/index.ts'", `'${SRC}'`))
    }
    return this
  }
}

export function cleanup(): void {
  for (const dir of made.splice(0)) rmSync(dir, { recursive: true, force: true })
}
