// Collect Instagram posts by shelling out to scripts/_instagram_fetch.py.
// Disabled by default behind INSTAGRAM_ENABLED=true. The Python script uses
// instagrapi (`python3 -m pip install instagrapi`) and persists its session
// to .cache/instagram/session.json so re-runs avoid re-logging in.

import 'dotenv/config'

import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'

import type { InstagramData } from '../src/types/instagram.ts'

import {
  REPO_ROOT,
  dataPath,
  logError,
  logSkipped,
  logStart,
  logWrote,
  nowIso,
  writeJson,
} from './lib/util.ts'

const SOURCE = 'instagram'
const PYTHON_SCRIPT = resolve(REPO_ROOT, 'scripts', '_instagram_fetch.py')

async function preserveExisting(file: string): Promise<InstagramData | null> {
  if (!existsSync(file)) return null
  try {
    const raw = await readFile(file, 'utf8')
    return JSON.parse(raw) as InstagramData
  } catch {
    return null
  }
}

interface PythonRun {
  stdout: string
  stderr: string
  code: number | null
}

function runPython(): Promise<PythonRun> {
  return new Promise((resolveP, rejectP) => {
    const proc = spawn('python3', [PYTHON_SCRIPT], {
      env: { ...process.env },
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    let stdout = ''
    let stderr = ''
    proc.stdout.on('data', (b: Buffer) => (stdout += b.toString('utf8')))
    proc.stderr.on('data', (b: Buffer) => (stderr += b.toString('utf8')))
    proc.on('error', rejectP)
    proc.on('close', (code) => resolveP({ stdout, stderr, code }))
  })
}

function isInstagramData(value: unknown): value is InstagramData {
  if (!value || typeof value !== 'object') return false
  const v = value as Record<string, unknown>
  return (
    typeof v.user === 'string' &&
    typeof v.fetched_at === 'string' &&
    Array.isArray(v.posts)
  )
}

async function main(): Promise<void> {
  logStart(SOURCE)
  const enabled =
    process.env.INSTAGRAM_ENABLED?.trim().toLowerCase() === 'true'
  const file = dataPath('instagram')

  if (!enabled) {
    logSkipped(SOURCE, 'INSTAGRAM_ENABLED not true; see README')
    const existing = await preserveExisting(file)
    if (existing) {
      const refreshed: InstagramData = { ...existing, generatedAt: nowIso() }
      await writeJson(file, refreshed)
    }
    return
  }

  if (!existsSync(PYTHON_SCRIPT)) {
    logError(SOURCE, new Error(`missing ${PYTHON_SCRIPT}`))
    process.exit(1)
  }

  try {
    const { stdout, stderr, code } = await runPython()
    if (code !== 0) {
      const tail = stderr.trim().slice(-500) || `python3 exited ${code}`
      logError(SOURCE, new Error(tail))
      process.exit(1)
    }
    let parsed: unknown
    try {
      parsed = JSON.parse(stdout)
    } catch (err) {
      logError(
        SOURCE,
        new Error(
          `failed to parse JSON from python: ${(err as Error).message}; stdout head: ${stdout.slice(0, 200)}`
        )
      )
      process.exit(1)
    }
    if (!isInstagramData(parsed)) {
      logError(SOURCE, new Error('python output did not match InstagramData shape'))
      process.exit(1)
    }
    const data: InstagramData = { ...parsed, generatedAt: nowIso() }
    await writeJson(file, data)
    logWrote(SOURCE, data.posts.length)
  } catch (err) {
    logError(SOURCE, err)
    process.exit(1)
  }
}

main()
