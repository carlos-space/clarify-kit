#!/usr/bin/env node
import { usage, version } from './index.ts'

const arg = process.argv[2]
if (arg === '--version' || arg === '-v') {
  console.log(version())
} else {
  console.log(usage)
  if (arg !== undefined && arg !== '--help' && arg !== '-h') process.exitCode = 2
}
