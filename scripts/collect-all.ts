// Run every collector sequentially. One failing collector should NOT block
// the others; we exit 0 unless they ALL fail. Each collector is invoked as a
// child `tsx` process so its top-level `main()` runs in isolation.

import 'dotenv/config'

import { spawn } from 'node:child_process'
import { resolve } from 'node:path'

import { REPO_ROOT } from './lib/util.ts'

interface RunResult {
  source: string
  ok: boolean
  code: number | null
}

const COLLECTORS = [
  'github',
  'untappd',
  'cricket',
  'twitter',
  'instagram',
  'setlist',
  'spotify',
] as const

function runChild(scriptName: string): Promise<RunResult> {
  const scriptPath = resolve(REPO_ROOT, 'scripts', `collect-${scriptName}.ts`)
  // Use the locally installed `tsx` binary; on Windows the .cmd shim is the
  // node_modules/.bin entry but Node's spawn resolves PATHEXT for us.
  const tsx = resolve(REPO_ROOT, 'node_modules', '.bin', 'tsx')
  return new Promise((resolveP) => {
    const proc = spawn(tsx, [scriptPath], {
      stdio: 'inherit',
      env: process.env,
    })
    proc.on('error', (err) => {
      console.error(`[collect-all] failed to spawn ${scriptName}: ${err.message}`)
      resolveP({ source: scriptName, ok: false, code: null })
    })
    proc.on('close', (code) => {
      resolveP({ source: scriptName, ok: code === 0, code })
    })
  })
}

async function main(): Promise<void> {
  console.log('[collect-all] starting...')
  const results: RunResult[] = []
  for (const c of COLLECTORS) {
    const r = await runChild(c)
    results.push(r)
  }
  const failed = results.filter((r) => !r.ok)
  const passed = results.filter((r) => r.ok)
  console.log(
    `[collect-all] done: ${passed.length} ok, ${failed.length} failed`
  )
  for (const r of results) {
    console.log(`  - ${r.source}: ${r.ok ? 'ok' : `failed (exit ${r.code})`}`)
  }
  if (failed.length === results.length) {
    console.error('[collect-all] every collector failed')
    process.exit(1)
  }
}

main()
