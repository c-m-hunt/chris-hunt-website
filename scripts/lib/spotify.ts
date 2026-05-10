// Shared helpers for Spotify auth + lookups. Used by collect-spotify and any
// other collector that wants to enrich its data with Spotify (e.g. setlist).

const ACCOUNTS = 'https://accounts.spotify.com'
const API = 'https://api.spotify.com/v1'

export interface SpotifyArtistImage {
  url: string
  width?: number
  height?: number
}

export interface SpotifySearchArtist {
  id: string
  name: string
  external_urls?: { spotify?: string }
  images?: SpotifyArtistImage[]
  popularity?: number
}

export async function fetchAccessToken(
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
    throw new Error(`spotify token refresh ${res.status}: ${text.slice(0, 200)}`)
  }
  const json = (await res.json()) as { access_token?: string }
  if (!json.access_token) throw new Error('spotify token response missing access_token')
  return json.access_token
}

async function searchArtistRaw(
  query: string,
  accessToken: string
): Promise<SpotifySearchArtist[]> {
  const params = new URLSearchParams({ q: query, type: 'artist', limit: '5' })
  const res = await fetch(`${API}/search?${params.toString()}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  })
  if (!res.ok) return []
  const json = (await res.json()) as {
    artists?: { items?: SpotifySearchArtist[] }
  }
  return json.artists?.items ?? []
}

function normalize(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '').trim()
}

/**
 * Search for an artist by name and return the best match. Tries the full name
 * first, then progressively simpler queries for collab names like
 * "Robert Plant, Saving Grace with Suzi Dian". Falls back to highest-popularity
 * non-exact match. Returns null if Spotify yields no results.
 */
export async function searchArtist(
  name: string,
  accessToken: string
): Promise<SpotifySearchArtist | null> {
  const queries: string[] = [name]
  // Collab names: "X with Y", "X, Y", "X & Y" — try the lead artist alone
  const lead = name.split(/\s+with\s+|,\s*|\s*&\s*/i)[0]
  if (lead && lead !== name) queries.push(lead)

  const wantedNorm = normalize(name)
  const leadNorm = normalize(lead)

  for (const q of queries) {
    const items = await searchArtistRaw(q, accessToken)
    if (items.length === 0) continue
    // Prefer an exact (normalised) name match; fall back to most popular result.
    const exact = items.find(
      (a) => normalize(a.name) === wantedNorm || normalize(a.name) === leadNorm
    )
    if (exact) return exact
    // For ambiguous short names like "Ash", popularity ordering from Spotify
    // is usually right (most popular Ash band is ranked first).
    const sorted = [...items].sort(
      (a, b) => (b.popularity ?? 0) - (a.popularity ?? 0)
    )
    return sorted[0]
  }
  return null
}

export function pickArtistImage(
  images: SpotifyArtistImage[] | undefined
): string | null {
  if (!images || images.length === 0) return null
  // Spotify returns images largest-first. We want a small-ish circular avatar
  // (~64-160px) so prefer the smallest above 100px, falling back to the smallest.
  const sorted = [...images].sort((a, b) => (a.width ?? 0) - (b.width ?? 0))
  const small = sorted.find((i) => (i.width ?? 0) >= 100)
  return (small ?? sorted[0]).url
}

export interface SpotifyAuthEnv {
  clientId: string
  clientSecret: string
  refreshToken: string
}

export function readSpotifyEnv(): SpotifyAuthEnv | null {
  const clientId = process.env.SPOTIFY_CLIENT_ID?.trim()
  const clientSecret = process.env.SPOTIFY_CLIENT_SECRET?.trim()
  const refreshToken = process.env.SPOTIFY_REFRESH_TOKEN?.trim()
  if (!clientId || !clientSecret || !refreshToken) return null
  return { clientId, clientSecret, refreshToken }
}
