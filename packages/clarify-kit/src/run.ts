// The commands of the CLI, with the exit codes of `clarify-kit.cli.*`: 0 done, 1 problems found or the operation refused,
// 2 a wrong command line or an input that can not be read.
import { readFileSync } from 'node:fs'
import { relative, sep } from 'node:path'
import { parseArgs } from 'node:util'
import { AdoptError, adoptFile } from './adopt.ts'
import { buildProject } from './build.ts'
import { checkProject } from './check.ts'
import { readConfig } from './config.ts'
import { InputError } from './errors.ts'
import type { Problem } from './load.ts'

export const USAGE = `usage: clarify-kit <command> [options]

commands:
  build  [--config <file>]                  write dist/<entry>/index.json for every entry
  check  [--config <file>] [--json]         report problems in the documents; exit 1 when there are any
  adopt  <file> [--config <file>]           set a decision to accepted and write the content hash of a decision or record
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
  if (!['build', 'check', 'adopt'].includes(command)) {
    io.err(['pin', 'render'].includes(command) ? `"${command}" is not available in this version\n${USAGE}` : `unknown command "${command}"\n${USAGE}`)
    return 2
  }
  try {
    const { values, positionals } = parseArgs({
      args: rest,
      allowPositionals: true,
      options: { config: { type: 'string' }, json: { type: 'boolean' } },
    })
    if (values.json && command !== 'check') throw new InputError('--json is only for check')
    if (command === 'adopt' ? positionals.length !== 1 : positionals.length !== 0) {
      throw new InputError(command === 'adopt' ? 'adopt takes one file' : `${command} takes no file`)
    }
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

    const result = await adoptFile(config, positionals[0] as string, io.cwd)
    io.out(`adopted ${posix(relative(io.cwd, result.file))}: ${result.status ? `status ${result.status}, ` : ''}contentHash ${result.hash}`)
    return 0
  } catch (error) {
    if (error instanceof AdoptError) {
      io.err(error.message)
      return 1
    }
    const usageError = error instanceof InputError || String((error as { code?: unknown }).code ?? '').startsWith('ERR_PARSE_ARGS')
    io.err(usageError ? (error as Error).message : `unexpected error: ${(error as Error).stack ?? error}`)
    return 2
  }
}
