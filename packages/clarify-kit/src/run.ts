// The commands of the CLI, with the exit codes of `clarify-kit.cli.*`: 0 done, 1 problems found or the operation refused,
// 2 a wrong command line or an input that can not be read.
import { readFileSync } from 'node:fs'
import { relative, resolve, sep } from 'node:path'
import { parseArgs } from 'node:util'
import { buildProject } from './build.ts'
import { checkProject } from './check.ts'
import { readConfig } from './config.ts'
import { InputError, RefusedError } from './errors.ts'
import type { Problem } from './load.ts'
import { pinDocs } from './pin.ts'
import { renderProject } from './render.ts'

export const USAGE = `usage: clarify-kit <command> [options]

commands:
  build  [--config <file>]                  write dist/<entry>/index.json for every entry
  check  [--config <file>] [--json]         report problems in the documents; exit 1 when there are any
  pin    --version <v> [--config <file>]    turn the "next" in the "since" and the version fields of documents and blocks into <v>
  render [--out <dir>] [--version <v>] [--include <label>...] [--config <file>]
                                            write the documents as Markdown outside every git work tree
  --version, --help

exit status: 0 done, 1 problems found or refused, 2 wrong usage or an input that can not be read`

export interface Io {
  cwd: string
  out: (text: string) => void
  err: (text: string) => void
}

const version = (): string =>
  (JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')) as { version: string }).version

const line = (p: Problem): string => `${p.location}: ${p.code}: ${p.message}`
const posix = (path: string): string => path.split(sep).join('/')

/** Runs the command in `argv` (without `node` and the script) and returns the exit status. */
export async function run(argv: string[], io: Io): Promise<number> {
  const [command, ...rest] = argv
  if (command === undefined || command === '--help' || command === '-h') {
    ;(command === undefined ? io.err : io.out)(USAGE)
    return command === undefined ? 2 : 0
  }
  if (command === '--version' || command === '-v') {
    io.out(version())
    return 0
  }
  if (!['build', 'check', 'pin', 'render'].includes(command)) {
    io.err(`unknown command "${command}"\n${USAGE}`)
    return 2
  }
  try {
    const { values, positionals } = parseArgs({
      args: rest,
      allowPositionals: true,
      options: {
        config: { type: 'string' },
        json: { type: 'boolean' },
        version: { type: 'string' },
        out: { type: 'string' },
        include: { type: 'string', multiple: true },
      },
    })
    if (values.json && command !== 'check') throw new InputError('--json is only for check')
    if (values.version !== undefined && command !== 'pin' && command !== 'render') throw new InputError('--version is only for pin and render')
    if ((values.out !== undefined || values.include !== undefined) && command !== 'render') throw new InputError('--out and --include are only for render')
    if (command === 'pin' && values.version === undefined) throw new InputError('pin needs --version <v>')
    if (positionals.length !== 0) throw new InputError(`${command} takes no file`)
    const config = readConfig(values.config, io.cwd)

    if (command === 'build') {
      const result = await buildProject(config)
      for (const p of result.problems) io.err(line(p))
      if (!result.ok) return 1
      for (const file of result.written) io.out(`wrote ${posix(relative(io.cwd, file))}`)
      return 0
    }

    if (command === 'check') {
      const problems = await checkProject(config)
      if (values.json) io.out(JSON.stringify(problems, null, 2))
      else {
        for (const p of problems) io.out(line(p))
        io.err(problems.length === 0 ? 'no problems' : `${problems.length} problem${problems.length === 1 ? '' : 's'}`)
      }
      return problems.length === 0 ? 0 : 1
    }

    if (command === 'pin') {
      const result = await pinDocs(config, values.version as string)
      for (const c of result.changed) io.out(`pinned ${c.file}: ${c.pinned}`)
      for (const message of result.skipped) io.err(message)
      const total = result.changed.reduce((n, c) => n + c.pinned, 0)
      io.out(`clarify-kit pin: ${total} "next" pinned to ${values.version} in ${result.changed.length} file(s)`)
      return 0
    }

    const result = await renderProject(config, {
      ...(values.out === undefined ? {} : { out: resolve(io.cwd, values.out) }),
      ...(values.version === undefined ? {} : { version: values.version }),
      include: values.include ?? [],
    })
    io.out(`rendered ${result.written.length} document${result.written.length === 1 ? '' : 's'} to ${result.out}`)
    return 0
  } catch (error) {
    if (error instanceof RefusedError) {
      io.err(error.message)
      return 1
    }
    const usageError = error instanceof InputError || String((error as { code?: unknown }).code ?? '').startsWith('ERR_PARSE_ARGS')
    io.err(usageError ? (error as Error).message : `unexpected error: ${(error as Error).stack ?? error}`)
    return 2
  }
}
