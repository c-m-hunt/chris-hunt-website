// Collect attended gigs from setlist.fm and write public/data/setlist.json.
// Skips with a friendly message if SETLISTFM_API_KEY is missing (the user is
// still waiting on key approval as of writing).
// See research/niche-apis.md for endpoint shape and rate limits.

import 'dotenv/config'

import { existsSync } from 'node:fs'
import { readFile } from 'node:fs/promises'

import type { SetlistData, SetlistGig } from '../src/types/setlist.ts'

import {
  dataPath,
  logError,
  logSkipped,
  logStart,
  logWrote,
  nowIso,
  sleep,
  writeJson,
} from './lib/util.ts'
import {
  fetchAccessToken,
  pickArtistImage,
  readSpotifyEnv,
  searchArtist,
} from './lib/spotify.ts'

const SOURCE = 'setlist'
const REQUEST_GAP_MS = 500
const SPOTIFY_GAP_MS = 100

interface ApiCity {
  name?: string
  country?: { name?: string }
}
interface ApiVenue {
  name?: string
  city?: ApiCity
}
interface ApiArtist {
  name?: string
  mbid?: string
}
interface ApiSetlist {
  id: string
  eventDate: string // dd-MM-yyyy
  artist?: ApiArtist
  venue?: ApiVenue
  tour?: { name?: string }
  url?: string
}

interface ApiResponse {
  total?: number
  page?: number
  itemsPerPage?: number
  setlist?: ApiSetlist[]
}

function ddmmyyyyToIso(value: string): string {
  const m = value.match(/^(\d{2})-(\d{2})-(\d{4})$/)
  if (!m) return value
  return `${m[3]}-${m[2]}-${m[1]}`
}

async function preserveExisting(file: string): Promise<SetlistData | null> {
  if (!existsSync(file)) return null
  try {
    const raw = await readFile(file, 'utf8')
    return JSON.parse(raw) as SetlistData
  } catch {
    return null
  }
}

async function fetchPage(
  username: string,
  page: number,
  apiKey: string
): Promise<ApiResponse> {
  const url = `https://api.setlist.fm/rest/1.0/user/${encodeURIComponent(username)}/attended?p=${page}`
  const res = await fetch(url, {
    headers: {
      'x-api-key': apiKey,
      Accept: 'application/json',
      'Accept-Language': 'en',
      'User-Agent': 'chris-hunt-website-collector',
    },
  })
  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new Error(`GET ${url} -> ${res.status} ${res.statusText}: ${body.slice(0, 200)}`)
  }
  return (await res.json()) as ApiResponse
}

function mapGig(s: ApiSetlist): SetlistGig {
  return {
    id: s.id,
    date: ddmmyyyyToIso(s.eventDate),
    artist: s.artist?.name ?? 'Unknown',
    artistMbid: s.artist?.mbid ?? null,
    artistImageUrl: null,
    artistSpotifyUrl: null,
    venue: s.venue?.name ?? 'Unknown',
    city: s.venue?.city?.name ?? '',
    country: s.venue?.city?.country?.name ?? '',
    tour: s.tour?.name ?? null,
    setlistUrl: s.url ?? '',
  }
}

interface ArtistEnrichment {
  imageUrl: string | null
  spotifyUrl: string | null
}

async function enrichGigsWithSpotifyImages(gigs: SetlistGig[]): Promise<void> {
  const env = readSpotifyEnv()
  if (!env) {
    console.warn('[setlist] no Spotify creds; skipping artist-image enrichment')
    return
  }
  const uniqueArtists = Array.from(new Set(gigs.map((g) => g.artist).filter((n) => n && n !== 'Unknown')))
  if (uniqueArtists.length === 0) return

  let accessToken: string
  try {
    accessToken = await fetchAccessToken(env.clientId, env.clientSecret, env.refreshToken)
  } catch (err) {
    console.warn(`[setlist] spotify token refresh failed: ${(err as Error).message}`)
    return
  }

  const lookup = new Map<string, ArtistEnrichment>()
  for (const name of uniqueArtists) {
    try {
      const artist = await searchArtist(name, accessToken)
      lookup.set(name, {
        imageUrl: pickArtistImage(artist?.images),
        spotifyUrl: artist?.external_urls?.spotify ?? null,
      })
    } catch (err) {
      console.warn(`[setlist] spotify search '${name}' failed: ${(err as Error).message}`)
      lookup.set(name, { imageUrl: null, spotifyUrl: null })
    }
    await sleep(SPOTIFY_GAP_MS)
  }

  let hits = 0
  for (const g of gigs) {
    const e = lookup.get(g.artist)
    if (e) {
      g.artistImageUrl = e.imageUrl
      g.artistSpotifyUrl = e.spotifyUrl
      if (e.imageUrl) hits += 1
    }
  }
  console.log(`[setlist] spotify enrichment: ${hits}/${gigs.length} gigs got artist images (${uniqueArtists.length} unique artists)`)
}

async function main(): Promise<void> {
  logStart(SOURCE)
  const apiKey = process.env.SETLISTFM_API_KEY?.trim()
  const username = process.env.SETLISTFM_USERNAME?.trim() || 'c_m_hunt'
  const file = dataPath('setlist')

  if (!apiKey) {
    logSkipped(
      SOURCE,
      'no API key — apply at https://www.setlist.fm/settings/api'
    )
    const existing = await preserveExisting(file)
    if (existing) {
      await writeJson(file, { ...existing, generatedAt: nowIso() })
    }
    return
  }

  try {
    const gigs: SetlistGig[] = []
    let total = 0
    let itemsPerPage = 20
    let page = 1
    while (true) {
      const json = await fetchPage(username, page, apiKey)
      total = json.total ?? total
      itemsPerPage = json.itemsPerPage ?? itemsPerPage
      const list = json.setlist ?? []
      for (const s of list) gigs.push(mapGig(s))
      if (list.length < itemsPerPage || page * itemsPerPage >= total) break
      page += 1
      await sleep(REQUEST_GAP_MS)
    }

    gigs.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0))

    await enrichGigsWithSpotifyImages(gigs)

    const data: SetlistData = {
      generatedAt: nowIso(),
      username,
      totalAttended: total || gigs.length,
      gigs,
    }

    await writeJson(file, data)
    logWrote(SOURCE, gigs.length)
  } catch (err) {
    logError(SOURCE, err)
    process.exit(1)
  }
}

main()
