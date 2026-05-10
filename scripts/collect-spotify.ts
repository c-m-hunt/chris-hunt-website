// Collect Spotify listening data via the Web API and write public/data/spotify.json.
// Auth: a long-lived refresh token (one-time bootstrapped via spotify-auth.ts).
// Each run exchanges the refresh token for a short-lived access token, then
// fetches: now-playing, recently-played, top artists, top tracks.

import 'dotenv/config'

import type {
  SpotifyArtist,
  SpotifyData,
  SpotifyNowPlaying,
  SpotifyTrack,
} from '../src/types/spotify.ts'

import {
  dataPath,
  logError,
  logSkipped,
  logStart,
  logWrote,
  nowIso,
  writeJson,
} from './lib/util.ts'

const SOURCE = 'spotify'
const API = 'https://api.spotify.com/v1'
const ACCOUNTS = 'https://accounts.spotify.com'

interface ApiImage {
  url: string
  width?: number
  height?: number
}

interface ApiArtistRef {
  id: string
  name: string
  external_urls?: { spotify?: string }
}

interface ApiArtist extends ApiArtistRef {
  images?: ApiImage[]
  genres?: string[]
}

interface ApiAlbum {
  id: string
  name: string
  external_urls?: { spotify?: string }
  images?: ApiImage[]
  release_date?: string
}

interface ApiTrack {
  id: string
  name: string
  duration_ms: number
  preview_url: string | null
  external_urls?: { spotify?: string }
  artists: ApiArtistRef[]
  album: ApiAlbum
}

interface ApiCurrentlyPlaying {
  is_playing: boolean
  progress_ms: number
  item: ApiTrack | null
}

interface ApiPaged<T> {
  items: T[]
}

function pickImage(images: ApiImage[] | undefined): string | null {
  if (!images || images.length === 0) return null
  // Prefer a medium-sized image (~300px), fall back to first.
  const sorted = [...images].sort((a, b) => (a.width ?? 0) - (b.width ?? 0))
  const mid = sorted.find((i) => (i.width ?? 0) >= 200) ?? sorted[sorted.length - 1]
  return mid.url
}

function mapTrack(t: ApiTrack): SpotifyTrack {
  return {
    id: t.id,
    name: t.name,
    url: t.external_urls?.spotify ?? `https://open.spotify.com/track/${t.id}`,
    durationMs: t.duration_ms,
    previewUrl: t.preview_url,
    artists: t.artists.map((a) => ({
      name: a.name,
      url: a.external_urls?.spotify ?? `https://open.spotify.com/artist/${a.id}`,
    })),
    album: {
      name: t.album.name,
      url: t.album.external_urls?.spotify ?? `https://open.spotify.com/album/${t.album.id}`,
      imageUrl: pickImage(t.album.images),
      releaseDate: t.album.release_date ?? null,
    },
  }
}

function mapArtist(a: ApiArtist): SpotifyArtist {
  return {
    id: a.id,
    name: a.name,
    url: a.external_urls?.spotify ?? `https://open.spotify.com/artist/${a.id}`,
    imageUrl: pickImage(a.images),
    genres: a.genres ?? [],
  }
}

async function fetchAccessToken(
  clientId: string,
  clientSecret: string,
  refreshToken: string
): Promise<string> {
  const basic = Buffer.from(`${clientId}:${clientSecret}`).toString('base64')
  const body = new URLSearchParams({
    grant_type: 'refresh_token',
    refresh_token: refreshToken,
  })
  const res = await fetch(`${ACCOUNTS}/api/token`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${basic}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body,
  })
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`token refresh ${res.status}: ${text.slice(0, 200)}`)
  }
  const json = (await res.json()) as { access_token?: string }
  if (!json.access_token) throw new Error('token response missing access_token')
  return json.access_token
}

async function spotifyGet<T>(path: string, accessToken: string): Promise<T | null> {
  const res = await fetch(`${API}${path}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  })
  // 204 No Content is the canonical "nothing playing" response from /me/player/currently-playing.
  if (res.status === 204) return null
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`GET ${path} -> ${res.status}: ${text.slice(0, 200)}`)
  }
  return (await res.json()) as T
}

async function main(): Promise<void> {
  logStart(SOURCE)
  const clientId = process.env.SPOTIFY_CLIENT_ID?.trim()
  const clientSecret = process.env.SPOTIFY_CLIENT_SECRET?.trim()
  const refreshToken = process.env.SPOTIFY_REFRESH_TOKEN?.trim()

  if (!clientId || !clientSecret) {
    logError(SOURCE, 'SPOTIFY_CLIENT_ID and SPOTIFY_CLIENT_SECRET are required')
    process.exit(1)
  }
  if (!refreshToken) {
    logSkipped(SOURCE, 'SPOTIFY_REFRESH_TOKEN not set; run `npm run spotify:auth-url` then `npm run spotify:auth -- <code>`')
    return
  }

  try {
    const accessToken = await fetchAccessToken(clientId, clientSecret, refreshToken)

    const [current, topArtistsRaw, topTracksRaw] = await Promise.all([
      spotifyGet<ApiCurrentlyPlaying>('/me/player/currently-playing', accessToken),
      spotifyGet<ApiPaged<ApiArtist>>('/me/top/artists?time_range=medium_term&limit=10', accessToken),
      spotifyGet<ApiPaged<ApiTrack>>('/me/top/tracks?time_range=medium_term&limit=10', accessToken),
    ])

    const nowPlaying: SpotifyNowPlaying | null = current
      ? {
          isPlaying: current.is_playing,
          progressMs: current.progress_ms ?? 0,
          track: current.item ? mapTrack(current.item) : null,
        }
      : { isPlaying: false, progressMs: 0, track: null }

    const topArtists: SpotifyArtist[] = topArtistsRaw?.items?.map(mapArtist) ?? []
    const topTracks: SpotifyTrack[] = topTracksRaw?.items?.map(mapTrack) ?? []

    const data: SpotifyData = {
      generatedAt: nowIso(),
      nowPlaying,
      topArtists,
      topTracks,
    }
    await writeJson(dataPath('spotify'), data)
    logWrote(SOURCE, topArtists.length + topTracks.length)
  } catch (err) {
    logError(SOURCE, err)
    process.exit(1)
  }
}

main()
