// Collect Play-Cricket batting & bowling stats for a single player and write
// public/data/cricket.json. Iterates seasons -> matches -> match_detail and
// caches per-match responses to .cache/cricket/<match_id>.json so re-runs are
// cheap. See research/niche-apis.md for the API shape.
//
// CLI flags:
//   --no-cache         skip the on-disk cache and force-refetch everything
//   --seasons 2024     restrict to one or more comma-separated seasons.
//                      When set, existing cricket.json is loaded and the
//                      fresh seasons are merged with historical ones so that
//                      passing --seasons $(date +%Y) on the daily cron only
//                      re-fetches the current year (all others preserved).

import 'dotenv/config'

import { existsSync } from 'node:fs'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

import type {
  CricketBatting,
  CricketBestBowling,
  CricketBowling,
  CricketCareer,
  CricketData,
  CricketFielding,
  CricketSeason,
} from '../src/types/cricket.ts'

import {
  CACHE_DIR,
  dataPath,
  logError,
  logStart,
  logWrote,
  nowIso,
  sleep,
  writeJson,
} from './lib/util.ts'

const SOURCE = 'cricket'
const DEFAULT_SITE_ID = 5819 // Southend on Sea & EMT CC
const DEFAULT_CLUB_NAME = 'Southend on Sea & EMT CC'
const BASE_URL = 'https://play-cricket.com/api/v2'
const REQUEST_GAP_MS = 500 // self-imposed ~2 req/s
const CACHE_SUBDIR = join(CACHE_DIR, 'cricket')

interface MatchListEntry {
  id: number
  match_date: string
  season: string
}
interface MatchListResponse {
  matches?: MatchListEntry[]
}

interface BatRow {
  position?: string
  batsman_name?: string
  batsman_id?: string
  how_out?: string
  fielder_name?: string
  fielder_id?: string
  bowler_name?: string
  bowler_id?: string
  runs?: string
  fours?: string
  sixes?: string
  balls?: string
}
interface BowlRow {
  bowler_name?: string
  bowler_id?: string
  overs?: string
  maidens?: string
  runs?: string
  wides?: string
  wickets?: string
  no_balls?: string
}
interface InningsRow {
  team_batting_name?: string
  team_batting_id?: string
  innings_number?: string
  bat?: BatRow[]
  bowl?: BowlRow[]
}
interface MatchDetail {
  id: number | string
  match_id: number | string
  match_date?: string
  innings?: InningsRow[]
}
interface MatchDetailResponse {
  match_details?: MatchDetail[]
}

interface CliOptions {
  useCache: boolean
  seasons: number[] | null
}

function parseCli(argv: string[]): CliOptions {
  let useCache = true
  let seasons: number[] | null = null
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--no-cache') useCache = false
    else if (a === '--seasons') {
      const next = argv[++i]
      if (next) {
        seasons = next
          .split(',')
          .map((s) => parseInt(s.trim(), 10))
          .filter((n) => Number.isFinite(n))
      }
    }
  }
  return { useCache, seasons }
}

function toNumber(s: string | undefined): number {
  if (s === undefined || s === null || s === '') return 0
  const n = parseFloat(s)
  return Number.isFinite(n) ? n : 0
}

// "12.3" overs -> 75 balls (12 * 6 + 3). Sum balls, then convert back at
// the end via floor(b/6) + (b%6)/10.
function oversToBalls(overs: string | undefined): number {
  if (!overs) return 0
  const parts = overs.split('.')
  const whole = parseInt(parts[0] ?? '0', 10) || 0
  const balls = parts[1] ? parseInt(parts[1], 10) || 0 : 0
  return whole * 6 + balls
}

function ballsToOvers(balls: number): number {
  const whole = Math.floor(balls / 6)
  const rem = balls % 6
  // round to one decimal place to match the on-disk seed shape
  return Math.round((whole + rem / 10) * 10) / 10
}

const NOT_OUT_CODES = new Set(['', 'no', 'not out'])
const DID_NOT_BAT_CODES = new Set([
  'dnb',
  'tdnb',
  'did not bat',
  'timed did not bat',
  'absent',
  'absent hurt',
  'abs',
])

function isNotOut(row: BatRow): boolean {
  const code = (row.how_out ?? '').toLowerCase().trim()
  if (NOT_OUT_CODES.has(code)) return true
  // Empty bowler_id often signals an unfinished innings
  if (!row.bowler_id || row.bowler_id.trim() === '') {
    if (!DID_NOT_BAT_CODES.has(code)) return true
  }
  return false
}

function isDidNotBat(row: BatRow): boolean {
  const code = (row.how_out ?? '').toLowerCase().trim()
  if (DID_NOT_BAT_CODES.has(code)) return true
  // Heuristic for placeholder rows: a teammate listed in the bat order but
  // never got to bat shows up with empty how_out, no bowler, and zero stats.
  // Without this we'd count them as a "not out" innings (since isNotOut
  // returns true on empty bowler_id) and grossly inflate innings/notOuts.
  if (code !== '') return false
  const bowlerEmpty = !(row.bowler_id ?? '').trim()
  if (!bowlerEmpty) return false
  const noActivity =
    toNumber(row.runs) === 0 &&
    toNumber(row.balls) === 0 &&
    toNumber(row.fours) === 0 &&
    toNumber(row.sixes) === 0
  return noActivity
}

function emptyBatting(): CricketBatting {
  return {
    matches: 0,
    innings: 0,
    notOuts: 0,
    runs: 0,
    highScore: 0,
    highScoreNotOut: false,
    average: null,
    strikeRate: null,
    fifties: 0,
    hundreds: 0,
    fours: 0,
    sixes: 0,
    ducks: 0,
  }
}

function emptyBowling(): CricketBowling {
  return {
    matches: 0,
    innings: 0,
    overs: 0,
    maidens: 0,
    runs: 0,
    wickets: 0,
    average: null,
    economy: 0,
    strikeRate: 0,
    bestBowling: { wickets: 0, runs: 0, matchId: 0 },
    fiveWicketHauls: 0,
  }
}

interface BattingAccumulator {
  matches: Set<number>
  innings: number
  notOuts: number
  runs: number
  balls: number
  highScore: number
  highScoreNotOut: boolean
  fifties: number
  hundreds: number
  fours: number
  sixes: number
  ducks: number
}

interface BowlingAccumulator {
  matches: Set<number>
  innings: number
  balls: number
  maidens: number
  runs: number
  wickets: number
  best: CricketBestBowling
  fiveWicketHauls: number
}

interface FieldingAccumulator {
  catches: number
  stumpings: number
  runOuts: number
}

interface SeasonAccumulator {
  year: number
  bat: BattingAccumulator
  bowl: BowlingAccumulator
  field: FieldingAccumulator
}

function newBat(): BattingAccumulator {
  return {
    matches: new Set(),
    innings: 0,
    notOuts: 0,
    runs: 0,
    balls: 0,
    highScore: 0,
    highScoreNotOut: false,
    fifties: 0,
    hundreds: 0,
    fours: 0,
    sixes: 0,
    ducks: 0,
  }
}

function newBowl(): BowlingAccumulator {
  return {
    matches: new Set(),
    innings: 0,
    balls: 0,
    maidens: 0,
    runs: 0,
    wickets: 0,
    best: { wickets: 0, runs: 0, matchId: 0 },
    fiveWicketHauls: 0,
  }
}

function newField(): FieldingAccumulator {
  return { catches: 0, stumpings: 0, runOuts: 0 }
}

function processMatch(
  detail: MatchDetail,
  playerId: string,
  season: SeasonAccumulator
): void {
  const rawMatchId = detail.match_id ?? detail.id
  const matchId =
    typeof rawMatchId === 'number' ? rawMatchId : parseInt(String(rawMatchId), 10) || 0
  for (const innings of detail.innings ?? []) {
    // Batting rows for our player
    for (const row of innings.bat ?? []) {
      if ((row.batsman_id ?? '') !== playerId) continue
      season.bat.matches.add(matchId)

      if (isDidNotBat(row)) continue
      season.bat.innings += 1
      const runs = toNumber(row.runs)
      const balls = toNumber(row.balls)
      const fours = toNumber(row.fours)
      const sixes = toNumber(row.sixes)
      const notOut = isNotOut(row)
      if (notOut) season.bat.notOuts += 1
      season.bat.runs += runs
      season.bat.balls += balls
      season.bat.fours += fours
      season.bat.sixes += sixes
      if (runs > season.bat.highScore) {
        season.bat.highScore = runs
        season.bat.highScoreNotOut = notOut
      }
      if (runs === 0 && !notOut) season.bat.ducks += 1
      if (runs >= 100) season.bat.hundreds += 1
      else if (runs >= 50) season.bat.fifties += 1
    }

    // Bowling rows for our player
    for (const row of innings.bowl ?? []) {
      if ((row.bowler_id ?? '') !== playerId) continue
      season.bowl.matches.add(matchId)
      season.bowl.innings += 1
      const balls = oversToBalls(row.overs)
      const maidens = toNumber(row.maidens)
      const runs = toNumber(row.runs)
      const wickets = toNumber(row.wickets)
      season.bowl.balls += balls
      season.bowl.maidens += maidens
      season.bowl.runs += runs
      season.bowl.wickets += wickets
      const isBetter =
        wickets > season.bowl.best.wickets ||
        (wickets === season.bowl.best.wickets && runs < season.bowl.best.runs)
      if (wickets > 0 && (season.bowl.best.matchId === 0 || isBetter)) {
        season.bowl.best = { wickets, runs, matchId }
      }
      if (wickets >= 5) season.bowl.fiveWicketHauls += 1
    }

    // Fielding rows: catches & stumpings appear as fielder_id on bat rows.
    for (const row of innings.bat ?? []) {
      if ((row.fielder_id ?? '') !== playerId) continue
      const code = (row.how_out ?? '').toLowerCase().trim()
      if (code === 'ct') season.field.catches += 1
      else if (code === 'st') season.field.stumpings += 1
      else if (code === 'ro' || code === 'run out') season.field.runOuts += 1
    }
  }
}

function finaliseBatting(acc: BattingAccumulator): CricketBatting {
  const out = emptyBatting()
  out.matches = acc.matches.size
  out.innings = acc.innings
  out.notOuts = acc.notOuts
  out.runs = acc.runs
  out.balls = acc.balls
  out.highScore = acc.highScore
  out.highScoreNotOut = acc.highScoreNotOut
  out.fifties = acc.fifties
  out.hundreds = acc.hundreds
  out.fours = acc.fours
  out.sixes = acc.sixes
  out.ducks = acc.ducks
  const dismissals = acc.innings - acc.notOuts
  out.average =
    dismissals > 0 ? Math.round((acc.runs / dismissals) * 100) / 100 : null
  out.strikeRate =
    acc.balls > 0 ? Math.round((acc.runs / acc.balls) * 10000) / 100 : null
  return out
}

function finalisedOversToApproxBalls(overs: number): number {
  const whole = Math.floor(overs)
  const rem = Math.round((overs - whole) * 10)
  return whole * 6 + rem
}

// Recompute career totals from an array of already-finalised CricketSeason
// objects. Used in incremental mode when merging fresh seasons with historical
// data loaded from the existing JSON (where raw accumulators aren't available).
function computeCareerFromFinalised(seasons: CricketSeason[]): CricketCareer {
  let batMatches = 0, innings = 0, notOuts = 0, runs = 0, balls = 0
  let highScore = 0, highScoreNotOut = false
  let fifties = 0, hundreds = 0, fours = 0, sixes = 0, ducks = 0

  let bowlMatches = 0, bowlInnings = 0, bowlBalls = 0
  let maidens = 0, bowlRuns = 0, wickets = 0
  let best: CricketBestBowling = { wickets: 0, runs: 0, matchId: 0 }
  let fiveWicketHauls = 0

  let catches = 0, stumpings = 0, runOuts = 0

  for (const s of seasons) {
    const b = s.batting
    batMatches += b.matches
    innings += b.innings
    notOuts += b.notOuts
    runs += b.runs
    balls += b.balls ?? 0
    fours += b.fours
    sixes += b.sixes
    ducks += b.ducks
    fifties += b.fifties
    hundreds += b.hundreds
    if (b.highScore > highScore) {
      highScore = b.highScore
      highScoreNotOut = b.highScoreNotOut
    }

    const bw = s.bowling
    bowlMatches += bw.matches
    bowlInnings += bw.innings
    bowlBalls += finalisedOversToApproxBalls(bw.overs)
    maidens += bw.maidens
    bowlRuns += bw.runs
    wickets += bw.wickets
    fiveWicketHauls += bw.fiveWicketHauls
    const isBetter =
      bw.bestBowling.wickets > best.wickets ||
      (bw.bestBowling.wickets === best.wickets && bw.bestBowling.runs < best.runs)
    if (bw.bestBowling.matchId !== 0 && (best.matchId === 0 || isBetter)) {
      best = { ...bw.bestBowling }
    }

    catches += s.fielding.catches
    stumpings += s.fielding.stumpings
    runOuts += s.fielding.runOuts
  }

  const dismissals = innings - notOuts
  return {
    batting: {
      matches: batMatches, innings, notOuts, runs, balls,
      highScore, highScoreNotOut,
      average: dismissals > 0 ? Math.round((runs / dismissals) * 100) / 100 : null,
      strikeRate: balls > 0 ? Math.round((runs / balls) * 10000) / 100 : null,
      fifties, hundreds, fours, sixes, ducks,
    },
    bowling: {
      matches: bowlMatches, innings: bowlInnings,
      overs: ballsToOvers(bowlBalls),
      maidens, runs: bowlRuns, wickets,
      average: wickets > 0 ? Math.round((bowlRuns / wickets) * 100) / 100 : null,
      economy: bowlBalls > 0 ? Math.round(((bowlRuns * 6) / bowlBalls) * 100) / 100 : 0,
      strikeRate: wickets > 0 ? Math.round((bowlBalls / wickets) * 10) / 10 : 0,
      bestBowling: best,
      fiveWicketHauls,
    },
    fielding: { catches, stumpings, runOuts },
  }
}

async function loadExistingData(file: string): Promise<CricketData | null> {
  if (!existsSync(file)) return null
  try {
    const raw = await readFile(file, 'utf8')
    return JSON.parse(raw) as CricketData
  } catch {
    return null
  }
}

function finaliseBowling(acc: BowlingAccumulator): CricketBowling {
  const out = emptyBowling()
  out.matches = acc.matches.size
  out.innings = acc.innings
  out.overs = ballsToOvers(acc.balls)
  out.maidens = acc.maidens
  out.runs = acc.runs
  out.wickets = acc.wickets
  out.average =
    acc.wickets > 0 ? Math.round((acc.runs / acc.wickets) * 100) / 100 : null
  out.economy =
    acc.balls > 0 ? Math.round(((acc.runs * 6) / acc.balls) * 100) / 100 : 0
  out.strikeRate =
    acc.wickets > 0 ? Math.round((acc.balls / acc.wickets) * 10) / 10 : 0
  out.bestBowling = acc.best
  out.fiveWicketHauls = acc.fiveWicketHauls
  return out
}

function finaliseFielding(acc: FieldingAccumulator): CricketFielding {
  return { catches: acc.catches, stumpings: acc.stumpings, runOuts: acc.runOuts }
}

async function loadCachedMatch(
  matchId: number,
  useCache: boolean
): Promise<MatchDetail | null> {
  if (!useCache) return null
  const file = join(CACHE_SUBDIR, `${matchId}.json`)
  if (!existsSync(file)) return null
  try {
    const raw = await readFile(file, 'utf8')
    return JSON.parse(raw) as MatchDetail
  } catch {
    return null
  }
}

async function saveCachedMatch(matchId: number, detail: MatchDetail): Promise<void> {
  await mkdir(CACHE_SUBDIR, { recursive: true })
  await writeFile(
    join(CACHE_SUBDIR, `${matchId}.json`),
    JSON.stringify(detail),
    'utf8'
  )
}

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url, {
    headers: {
      Accept: 'application/json',
      'User-Agent': 'chris-hunt-website-collector',
    },
  })
  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new Error(`GET ${url} -> ${res.status} ${res.statusText}: ${body.slice(0, 200)}`)
  }
  return (await res.json()) as T
}

async function listMatches(
  siteId: number,
  season: number,
  token: string
): Promise<MatchListEntry[]> {
  const url = `${BASE_URL}/matches.json?site_id=${siteId}&season=${season}&api_token=${token}`
  const json = await fetchJson<MatchListResponse>(url)
  return json.matches ?? []
}

async function fetchMatchDetail(
  matchId: number,
  token: string
): Promise<MatchDetail | null> {
  const url = `${BASE_URL}/match_detail.json?match_id=${matchId}&api_token=${token}`
  const json = await fetchJson<MatchDetailResponse>(url)
  const arr = json.match_details ?? []
  return arr.length > 0 ? arr[0] : null
}

async function main(): Promise<void> {
  logStart(SOURCE)
  const token = process.env.PLAY_CRICKET_API_TOKEN?.trim()
  const playerIdRaw = process.env.PLAY_CRICKET_PLAYER_ID?.trim()
  if (!token) {
    logError(SOURCE, new Error('PLAY_CRICKET_API_TOKEN is required'))
    process.exit(1)
  }
  if (!playerIdRaw) {
    logError(SOURCE, new Error('PLAY_CRICKET_PLAYER_ID is required'))
    process.exit(1)
  }
  const playerId = playerIdRaw
  const playerIdNum = parseInt(playerIdRaw, 10)

  const siteIdRaw = process.env.PLAY_CRICKET_SITE_ID?.trim()
  const siteId = siteIdRaw ? parseInt(siteIdRaw, 10) : DEFAULT_SITE_ID
  if (!Number.isFinite(siteId) || siteId <= 0) {
    logError(SOURCE, new Error(`PLAY_CRICKET_SITE_ID must be a positive integer (got ${siteIdRaw})`))
    process.exit(1)
  }
  const clubName =
    process.env.PLAY_CRICKET_CLUB_NAME?.trim() || DEFAULT_CLUB_NAME

  const opts = parseCli(process.argv.slice(2))
  const currentYear = new Date().getUTCFullYear()
  const seasons =
    opts.seasons && opts.seasons.length > 0
      ? opts.seasons
      : Array.from({ length: currentYear - 2010 + 1 }, (_, i) => 2010 + i)

  // In incremental mode (explicit --seasons), load the existing JSON so we can
  // merge historical seasons that aren't being re-fetched this run.
  let historicalSeasons: CricketSeason[] | null = null
  if (opts.seasons && opts.seasons.length > 0) {
    const existing = await loadExistingData(dataPath('cricket'))
    if (existing) {
      historicalSeasons = existing.seasons
      console.log(
        `[cricket] incremental mode: loaded ${historicalSeasons.length} historical seasons from existing JSON`
      )
    }
  }

  const seasonAcc: SeasonAccumulator[] = []
  let playerName = 'Chris Hunt'
  let totalMatchesProcessed = 0

  // Build the JSON snapshot from the current season accumulator state and
  // write it to disk. Called after each season completes so that a timeout
  // mid-run still produces useful partial data.
  //
  // historicalSeasons: seasons loaded from existing JSON that are NOT being
  // re-fetched in this run. When set (incremental mode), they are merged with
  // the freshly computed seasons and career is recomputed across the full set.
  async function writeSnapshot(historicalSeasons: CricketSeason[] | null): Promise<void> {
    const freshSeasons: CricketSeason[] = seasonAcc.map((s) => ({
      year: s.year,
      batting: finaliseBatting(s.bat),
      bowling: finaliseBowling(s.bowl),
      fielding: finaliseFielding(s.field),
    }))

    let allSeasons: CricketSeason[]
    let career: CricketCareer

    if (historicalSeasons) {
      // Incremental: merge historical (not re-fetched) with fresh (re-fetched)
      allSeasons = [
        ...historicalSeasons.filter((h) => !freshSeasons.some((f) => f.year === h.year)),
        ...freshSeasons,
      ].sort((a, b) => b.year - a.year)
      career = computeCareerFromFinalised(allSeasons)
    } else {
      // Full run: compute career directly from raw accumulators (exact)
      allSeasons = freshSeasons.sort((a, b) => b.year - a.year)
      const careerBat = newBat()
      const careerBowl = newBowl()
      const careerField = newField()
      for (const s of seasonAcc) {
        for (const m of s.bat.matches) careerBat.matches.add(m)
        careerBat.innings += s.bat.innings
        careerBat.notOuts += s.bat.notOuts
        careerBat.runs += s.bat.runs
        careerBat.balls += s.bat.balls
        careerBat.fours += s.bat.fours
        careerBat.sixes += s.bat.sixes
        careerBat.ducks += s.bat.ducks
        careerBat.fifties += s.bat.fifties
        careerBat.hundreds += s.bat.hundreds
        if (s.bat.highScore > careerBat.highScore) {
          careerBat.highScore = s.bat.highScore
          careerBat.highScoreNotOut = s.bat.highScoreNotOut
        }
        for (const m of s.bowl.matches) careerBowl.matches.add(m)
        careerBowl.innings += s.bowl.innings
        careerBowl.balls += s.bowl.balls
        careerBowl.maidens += s.bowl.maidens
        careerBowl.runs += s.bowl.runs
        careerBowl.wickets += s.bowl.wickets
        careerBowl.fiveWicketHauls += s.bowl.fiveWicketHauls
        const isBetter =
          s.bowl.best.wickets > careerBowl.best.wickets ||
          (s.bowl.best.wickets === careerBowl.best.wickets &&
            s.bowl.best.runs < careerBowl.best.runs)
        if (s.bowl.best.matchId !== 0 && (careerBowl.best.matchId === 0 || isBetter)) {
          careerBowl.best = { ...s.bowl.best }
        }
        careerField.catches += s.field.catches
        careerField.stumpings += s.field.stumpings
        careerField.runOuts += s.field.runOuts
      }
      career = {
        batting: finaliseBatting(careerBat),
        bowling: finaliseBowling(careerBowl),
        fielding: finaliseFielding(careerField),
      }
    }

    const data: CricketData = {
      generatedAt: nowIso(),
      playerId: playerIdNum,
      playerName,
      club: { id: siteId, name: clubName },
      career,
      seasons: allSeasons,
    }
    await writeJson(dataPath('cricket'), data)
  }

  try {
    for (const year of seasons) {
      console.log(`[cricket] season ${year}: listing matches`)
      let matches: MatchListEntry[] = []
      try {
        matches = await listMatches(siteId, year, token)
      } catch (err) {
        console.warn(
          `[cricket] failed to list matches for ${year}: ${(err as Error).message}`
        )
        await sleep(REQUEST_GAP_MS)
        continue
      }
      await sleep(REQUEST_GAP_MS)
      if (matches.length === 0) continue

      const acc: SeasonAccumulator = {
        year,
        bat: newBat(),
        bowl: newBowl(),
        field: newField(),
      }

      for (const m of matches) {
        let detail = await loadCachedMatch(m.id, opts.useCache)
        if (!detail) {
          try {
            detail = await fetchMatchDetail(m.id, token)
          } catch (err) {
            console.warn(
              `[cricket] match ${m.id} failed: ${(err as Error).message}`
            )
            await sleep(REQUEST_GAP_MS)
            continue
          }
          await sleep(REQUEST_GAP_MS)
          if (detail) {
            try {
              await saveCachedMatch(m.id, detail)
            } catch {
              // cache write failure is non-fatal
            }
          }
        }
        if (!detail) continue

        // Capture the player's display name on first hit.
        for (const innings of detail.innings ?? []) {
          for (const row of innings.bat ?? []) {
            if (row.batsman_id === playerId && row.batsman_name) {
              playerName = row.batsman_name
            }
          }
          for (const row of innings.bowl ?? []) {
            if (row.bowler_id === playerId && row.bowler_name) {
              playerName = row.bowler_name
            }
          }
        }

        processMatch(detail, playerId, acc)
        totalMatchesProcessed += 1
      }

      const seasonHasData =
        acc.bat.matches.size > 0 ||
        acc.bowl.matches.size > 0 ||
        acc.field.catches +
          acc.field.stumpings +
          acc.field.runOuts >
          0
      if (seasonHasData) {
        seasonAcc.push(acc)
        // Snapshot after each completed season so a timeout mid-run still
        // leaves usable JSON on disk.
        await writeSnapshot(historicalSeasons)
        console.log(
          `[cricket] season ${year}: ok (${matches.length} matches scanned, snapshot written)`
        )
      }
    }

    await writeSnapshot(historicalSeasons)
    console.log(
      `[cricket] processed ${totalMatchesProcessed} matches across ${seasonAcc.length} seasons`
    )
    logWrote(SOURCE, seasonAcc.length)
  } catch (err) {
    logError(SOURCE, err)
    process.exit(1)
  }
}

main()
