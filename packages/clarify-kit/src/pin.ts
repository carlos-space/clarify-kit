// `clarify-kit pin --version <v>`: turns the `next` of a `since` into a version, in the `*.doc.ts` under `docsDir`.
// The work is `pinVersion` of fact-kit, which reads every row (an object with a `since`) and changes only the text of
// the literal. A document or block that carries a `pending` label is left as it is, so is a `since` that is not a literal.
import { relative } from 'node:path'
import { pinVersion } from 'fact-kit'
import type { PinResult } from 'fact-kit'
import type { Config } from './config.ts'
import { InputError } from './errors.ts'

/**
 * A document is not a fact, so none of its property names holds data that must be skipped: `fact-kit` skips an object
 * under `content`, `value` and a few other keys by default, and a block option written under one of them would stay
 * `next`. An empty list makes `pinVersion` read every object.
 */
export const DOC_DATA_KEYS: readonly string[] = []

/** Pins the `since: 'next'` of the documents and blocks under `config.docsDir` to `version`. A version that is not semver is an {@link InputError}. */
export async function pinDocs(config: Config, version: string): Promise<PinResult> {
  try {
    return await pinVersion({
      version,
      cwd: config.dir,
      factsDir: relative(config.dir, config.docsDir) || '.',
      dataKeys: DOC_DATA_KEYS,
    })
  } catch (error) {
    // fact-kit throws its own InputError class; the CLI maps ours to exit status 2.
    if ((error as Error).name === 'InputError') throw new InputError((error as Error).message)
    throw error
  }
}
