// Runs the CLI as a process (`node src/cli.ts`, Node strips the types), so the exit status is the one a shell sees.
import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { afterAll, describe, expect, it } from 'vitest'
import { CLI, Project, cleanup } from './helpers.ts'

afterAll(cleanup)

const cli = (p: Project, ...args: string[]) => {
  const r = spawnSync(process.execPath, [CLI, ...args], { cwd: p.dir, encoding: 'utf8' })
  return { status: r.status, out: r.stdout, err: r.stderr }
}
const D = `doc({ id: 'a', title: 'A', status: 'draft', sections: [section('s', 'S', [text('t')])] })`
const DEC = `decision({ id: 'use-x', title: 'X', status: 'proposed', appliesFrom: 'next', sections: [section('c', 'C', [text('why')])] })`
const project = (label: string) => new Project(label).config().entry().doc('docs/main/a.doc.ts', 'doc, section, text', D)

describe('clarify-kit build', () => {
  it('exits 0 and writes the index', () => {
    const p = project('cli-build')
    const r = cli(p, 'build')
    expect(r).toMatchObject({ status: 0, out: 'wrote dist/main/index.json\n' })
    expect(p.json('dist/main/index.json').formatVersion).toBe('1.1')
  })
  it('exits 1 and writes nothing when a source does not load', () => {
    const p = project('cli-build-fail').write('docs/main/broken.doc.ts', 'throw new Error("boom")\n')
    const r = cli(p, 'build')
    expect(r.status).toBe(1)
    expect(r.err).toContain('docs/main/broken.doc.ts: load-error')
    expect(() => p.read('dist/main/index.json')).toThrow()
  })
  it('takes the config from --config', () => {
    const p = new Project('cli-config').entry().doc('docs/main/a.doc.ts', 'doc, section, text', D)
    p.write('elsewhere/clarify-kit.config.json', JSON.stringify({ docsDir: '../docs' })).write('elsewhere/package.json', '{"name":"other-docs"}')
    expect(cli(p, 'build', '--config', 'elsewhere/clarify-kit.config.json').status).toBe(0)
    expect(p.json('elsewhere/dist/main/index.json').package).toBe('other-docs')
  })
})

describe('clarify-kit check', () => {
  it('exits 0 when there is no problem', () => {
    expect(cli(project('cli-check'), 'check')).toMatchObject({ status: 0, out: '', err: 'no problems\n' })
  })
  it('exits 1 and prints the code and the file of each problem', () => {
    const p = project('cli-check-fail').doc('docs/stray/x.doc.ts', 'doc, section, text', D)
    const r = cli(p, 'check')
    expect(r.status).toBe(1)
    expect(r.out).toMatch(/^docs\/stray\/x\.doc\.ts: outside-entry: /)
    expect(r.err).toBe('1 problem\n')
  })
  it('prints the problems as JSON with --json, each with code, message and location', () => {
    const p = project('cli-check-json').doc('docs/stray/x.doc.ts', 'doc, section, text', D)
    const r = cli(p, 'check', '--json')
    expect(r.status).toBe(1)
    const problems = JSON.parse(r.out)
    expect(problems).toHaveLength(1)
    expect(Object.keys(problems[0])).toEqual(['code', 'message', 'location'])
    expect(problems[0].code).toBe('outside-entry')
    expect(JSON.parse(cli(project('cli-check-json-ok'), 'check', '--json').out)).toEqual([])
  })
  it('exits 2 when a facts package it was told to read is not installed', () => {
    const p = new Project('cli-check-input').config({ factSources: ['not-installed/acme'] }).entry()
    const r = cli(p, 'check')
    expect(r.status).toBe(2)
    expect(r.err).toContain('cannot read the facts of "not-installed/acme"')
  })
})

describe('clarify-kit adopt, which is retired', () => {
  it('is an unknown command: exits 2 and prints the usage, and leaves the file as it was', () => {
    const p = project('cli-adopt').doc('docs/main/use-x.doc.ts', 'decision, section, text', DEC)
    const before = p.read('docs/main/use-x.doc.ts')
    const r = cli(p, 'adopt', 'docs/main/use-x.doc.ts')
    expect(r.status).toBe(2)
    expect(r.err).toContain('unknown command "adopt"')
    expect(r.err).toContain('usage: clarify-kit <command> [options]')
    expect(r.err).not.toMatch(/^\s+adopt\s/m)
    expect(p.read('docs/main/use-x.doc.ts')).toBe(before)
  })
})

describe('a source that still has contentHash', () => {
  it('fails the build as an unknown field and names contentHash', () => {
    const p = project('cli-content-hash').doc(
      'docs/main/use-x.doc.ts',
      'decision, section, text',
      DEC.replace("appliesFrom: 'next',", `appliesFrom: 'next', contentHash: '${'a'.repeat(64)}',`),
    )
    const r = cli(p, 'build')
    expect(r.status).not.toBe(0)
    expect(r.err).toContain('contentHash')
    expect(r.err).toContain('load-error')
    expect(() => p.read('dist/main/index.json')).toThrow()
  })
})

describe('the command line', () => {
  it('exits 2 for no command, an unknown command, an unknown option and a pin without a version', () => {
    const p = project('cli-usage')
    expect(cli(p).status).toBe(2)
    expect(cli(p, 'frobnicate').status).toBe(2)
    expect(cli(p, 'build', '--nope').status).toBe(2)
    expect(cli(p, 'pin').status).toBe(2)
    expect(cli(p, 'render', '--nope').status).toBe(2)
  })
  it('exits 0 for --version and --help', () => {
    const p = project('cli-help')
    // release-please bumps the version on a release branch, so compare with the package's own version
    const { version } = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')) as { version: string }
    expect(cli(p, '--version')).toMatchObject({ status: 0, out: `${version}\n` })
    const help = cli(p, '--help')
    expect(help.status).toBe(0)
    expect(help.out).toContain('clarify-kit <command>')
  })
})
