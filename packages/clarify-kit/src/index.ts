import { readFileSync } from 'node:fs'

/** The version of this package, read from its package.json. */
export function version(): string {
  const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')) as { version: string }
  return pkg.version
}

export const usage = 'usage: clarify-kit --version | --help'
