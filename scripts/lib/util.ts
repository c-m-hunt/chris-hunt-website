// Small shared helpers for collectors.
// Keep this file dependency-free apart from Node built-ins.

import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'

export const REPO_ROOT = resolve(new URL('../..', import.meta.url).pathname)
export const DATA_DIR = resolve(REPO_ROOT, 'public', 'data')
export const CACHE_DIR = resolve(REPO_ROOT, '.cache')

export function dataPath(name: string): string {
  return resolve(DATA_DIR, `${name}.json`)
}

export async function writeJson(filePath: string, value: unknown): Promise<void> {
  await mkdir(dirname(filePath), { recursive: true })
  const body = JSON.stringify(value, null, 2) + '\n'
  await writeFile(filePath, body, 'utf8')
}

export function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms))
}

export function nowIso(): string {
  return new Date().toISOString()
}

export function logStart(source: string): void {
  console.log(`[${source}] starting...`)
}

export function logWrote(source: string, n: number): void {
  console.log(`[${source}] wrote ${n} items`)
}

export function logSkipped(source: string, reason: string): void {
  console.log(`[${source}] skipped (${reason})`)
}

export function logError(source: string, err: unknown): void {
  const msg = err instanceof Error ? err.stack ?? err.message : String(err)
  console.error(`[${source}] error: ${msg}`)
}
