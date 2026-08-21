#!/usr/bin/env node
/**
 * Cross-platform launcher for demos 5–8.
 * Sets DSH_HOME to <demoDir>/.dsh-home and forwards args to the local dsh CLI.
 *
 * Usage:
 *   node scripts/run-dsh.mjs <demo-dir> <patch.yml> <task...>
 *   node scripts/run-dsh.mjs <demo-dir> --profile <name> <task...>
 */
import { spawn } from 'node:child_process'
import { createRequire } from 'node:module'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const require = createRequire(import.meta.url)
const demosRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const [demoDirName, second, ...rest] = process.argv.slice(2)

if (!demoDirName) {
  console.error('usage: node scripts/run-dsh.mjs <demo-dir> (<patch.yml> | --profile <name>) <task...>')
  process.exit(2)
}

const demoDir = path.join(demosRoot, demoDirName)
const dshHome = path.join(demoDir, '.dsh-home')
const dshBin = require.resolve('@deepseek-ai/dsh/lib/bin.js')

/** @type {string[]} */
const dshArgs = []
if (second === '--profile') {
  const profile = rest.shift()
  if (!profile) {
    console.error('missing profile name after --profile')
    process.exit(2)
  }
  dshArgs.push('--profile', profile, ...rest)
} else if (second) {
  dshArgs.push('--profile', 'headless', '--patch', path.join(demoDir, second), ...rest)
} else {
  console.error('usage: node scripts/run-dsh.mjs <demo-dir> (<patch.yml> | --profile <name>) <task...>')
  process.exit(2)
}

const child = spawn(process.execPath, [dshBin, ...dshArgs], {
  cwd: demoDir,
  env: { ...process.env, DSH_HOME: dshHome },
  stdio: 'inherit',
})

child.on('exit', (code, signal) => {
  if (signal) process.kill(process.pid, signal)
  process.exit(code ?? 1)
})
