#!/usr/bin/env node
import { run } from './run.ts'

process.exitCode = await run(process.argv.slice(2), {
  cwd: process.cwd(),
  out: (text) => console.log(text),
  err: (text) => console.error(text),
})
