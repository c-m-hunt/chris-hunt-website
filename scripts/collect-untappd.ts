// Collect Untappd check-ins via the v4 API and write public/data/untappd.json.
// Auth uses client_id+client_secret query params (works for read-only public
// data without OAuth). The public RSS feed is gated behind Cloudflare which
// challenges Node user-agents, so we use the API instead.

import 'dotenv/config'

import type {
  UntappdBadge,
  UntappdCheckin,
  UntappdData,
  UntappdFavourite,
  UntappdLifetime,
  UntappdTopBrewery,
} from '../src/types/untappd.ts'

import {
  dataPath,
  logError,
  logStart,
  logWrote,
  nowIso,
  writeJson,
} from './lib/util.ts'

const SOURCE = 'untappd'
const API_BASE = 'https://api.untappd.com/v4'
const PAGE_LIMIT = 50 // Untappd allows up to 50 per page
const MAX_CHECKINS = 50 // total to keep in JSON

interface ApiBeer {
  beer_name?: string
  beer_label?: string
}

interface ApiBrewery {
  brewery_name?: string
  brewery_label?: string
}

interface ApiVenueObj {
  venue_name?: string
}

interface ApiPhoto {
  photo_img_lg?: string
  photo_img_md?: string
  photo_img_sm?: string
  photo_img_og?: string
}

interface ApiMediaItem {
  photo?: ApiPhoto
}

interface ApiMedia {
  count?: number
  items?: ApiMediaItem[]
}

interface ApiCheckin {
  checkin_id: number
  created_at: string
  checkin_comment?: string
  rating_score?: number
  beer?: ApiBeer
  brewery?: ApiBrewery
  venue?: ApiVenueObj | unknown[]
  media?: ApiMedia
}

interface ApiResponse {
  meta: { code: number; error_detail?: string; error_type?: string }
  response: {
    checkins?: {
      count?: number
      items?: ApiCheckin[]
    }
    pagination?: {
      max_id?: number
      next_url?: string
    }
  }
}

interface ApiUserInfoResponse {
  meta: { code: number; error_detail?: string; error_type?: string }
  response: {
    user?: {
      stats?: {
        total_checkins?: number
        total_beers?: number
        total_badges?: number
        total_friends?: number
        total_photos?: number
      }
    }
  }
}

interface ApiBadgeMedia {
  badge_image_sm?: string
  badge_image_md?: string
  badge_image_lg?: string
}

interface ApiBadgeItem {
  badge_id?: number
  user_badge_id?: number
  badge_name?: string
  badge_description?: string
  media?: ApiBadgeMedia
  earned_at?: string
  created_at?: string
  levels?: { count?: number }
}

interface ApiBadgesResponse {
  meta: { code: number; error_detail?: string; error_type?: string }
  response: {
    items?: ApiBadgeItem[]
  }
}

interface ApiBeerInBeers {
  bid?: number
  beer_name?: string
  beer_label?: string
  beer_style?: string
  beer_abv?: number
}

interface ApiBeersItem {
  rating_score?: number
  count?: number
  first_created_at?: string
  recent_created_at?: string
  recent_checkin_id?: number
  beer?: ApiBeerInBeers
  brewery?: ApiBrewery
}

interface ApiBeersResponse {
  meta: { code: number; error_detail?: string; error_type?: string }
  response: {
    beers?: { items?: ApiBeersItem[] }
  }
}

function venueName(v: ApiCheckin['venue']): string | null {
  if (!v) return null
  if (Array.isArray(v)) return null // empty venue comes back as []
  return (v as ApiVenueObj).venue_name?.trim() || null
}

function photoUrl(media: ApiMedia | undefined): string | null {
  const first = media?.items?.[0]?.photo
  if (!first) return null
  return (
    first.photo_img_lg ||
    first.photo_img_md ||
    first.photo_img_sm ||
    first.photo_img_og ||
    null
  )
}

function aggregateTopBreweries(
  checkins: UntappdCheckin[],
  limit = 5
): UntappdTopBrewery[] {
  const counts = new Map<string, number>()
  for (const c of checkins) {
    counts.set(c.brewery, (counts.get(c.brewery) ?? 0) + 1)
  }
  return Array.from(counts.entries())
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, limit)
    .map(([name, count]) => ({ name, count }))
}

function stripHtml(html: string): string {
  return html
    .replace(/<[^>]+>/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

async function fetchUserInfo(
  username: string,
  clientId: string,
  clientSecret: string
): Promise<UntappdLifetime | null> {
  const params = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
  })
  const url = `${API_BASE}/user/info/${username}?${params.toString()}`
  const res = await fetch(url)
  if (!res.ok) {
    console.warn(`[untappd] /user/info -> HTTP ${res.status}`)
    return null
  }
  const data = (await res.json()) as ApiUserInfoResponse
  if (data.meta?.code !== 200) {
    console.warn(`[untappd] /user/info API code ${data.meta?.code}`)
    return null
  }
  const stats = data.response?.user?.stats
  if (!stats) return null
  return {
    totalCheckins: stats.total_checkins ?? 0,
    uniqueBeers: stats.total_beers ?? 0,
    totalBadges: stats.total_badges ?? 0,
    totalFriends: stats.total_friends ?? 0,
    daysSinceFirstCheckin: null,
    firstCheckinAt: null,
  }
}

async function fetchBadges(
  username: string,
  clientId: string,
  clientSecret: string,
  limit = 12
): Promise<UntappdBadge[]> {
  const params = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    limit: String(limit),
  })
  const url = `${API_BASE}/user/badges/${username}?${params.toString()}`
  const res = await fetch(url)
  if (!res.ok) {
    console.warn(`[untappd] /user/badges -> HTTP ${res.status}`)
    return []
  }
  const data = (await res.json()) as ApiBadgesResponse
  if (data.meta?.code !== 200) {
    console.warn(`[untappd] /user/badges API code ${data.meta?.code}`)
    return []
  }
  const items = data.response?.items ?? []
  return items.map((b) => {
    const earned = b.earned_at ?? b.created_at
    return {
      id: String(b.user_badge_id ?? b.badge_id ?? ''),
      name: b.badge_name?.trim() || 'Unknown badge',
      description: stripHtml(b.badge_description ?? ''),
      imageUrl:
        b.media?.badge_image_lg ||
        b.media?.badge_image_md ||
        b.media?.badge_image_sm ||
        null,
      earnedAt: earned ? new Date(earned).toISOString() : null,
      level: b.levels?.count ?? null,
    }
  })
}

async function fetchFavourites(
  username: string,
  clientId: string,
  clientSecret: string,
  limit = 5
): Promise<UntappdFavourite[]> {
  const params = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    sort: 'highest_rated_you',
    limit: String(Math.max(limit, 5)),
  })
  const url = `${API_BASE}/user/beers/${username}?${params.toString()}`
  const res = await fetch(url)
  if (!res.ok) {
    console.warn(`[untappd] /user/beers -> HTTP ${res.status}`)
    return []
  }
  const data = (await res.json()) as ApiBeersResponse
  if (data.meta?.code !== 200) {
    console.warn(`[untappd] /user/beers API code ${data.meta?.code}`)
    return []
  }
  const items = data.response.beers?.items ?? []
  return items.slice(0, limit).map((item) => {
    const recentId = item.recent_checkin_id
    return {
      id: String(item.beer?.bid ?? ''),
      beer: item.beer?.beer_name?.trim() || 'Unknown beer',
      brewery: item.brewery?.brewery_name?.trim() || 'Unknown brewery',
      beerStyle: item.beer?.beer_style?.trim() || null,
      beerAbv: typeof item.beer?.beer_abv === 'number' ? item.beer.beer_abv : null,
      beerLabel: item.beer?.beer_label?.trim() || null,
      rating: typeof item.rating_score === 'number' ? item.rating_score : 0,
      count: typeof item.count === 'number' ? item.count : 0,
      firstCheckedInAt: item.first_created_at
        ? new Date(item.first_created_at).toISOString()
        : null,
      recentCheckedInAt: item.recent_created_at
        ? new Date(item.recent_created_at).toISOString()
        : null,
      recentCheckinUrl: recentId
        ? `https://untappd.com/user/${username}/checkin/${recentId}`
        : null,
    }
  })
}

async function fetchPage(
  username: string,
  clientId: string,
  clientSecret: string,
  maxId: number | null
): Promise<ApiResponse> {
  const params = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    limit: String(PAGE_LIMIT),
  })
  if (maxId !== null) params.set('max_id', String(maxId))
  const url = `${API_BASE}/user/checkins/${username}?${params.toString()}`
  const res = await fetch(url)
  if (!res.ok) {
    throw new Error(`HTTP ${res.status} fetching ${url}`)
  }
  const data = (await res.json()) as ApiResponse
  if (data.meta?.code !== 200) {
    throw new Error(
      `API error ${data.meta?.code}: ${
        data.meta?.error_detail || data.meta?.error_type || 'unknown'
      }`
    )
  }
  return data
}

async function main(): Promise<void> {
  logStart(SOURCE)
  const username = process.env.UNTAPPD_USERNAME?.trim() || 'cmhunt'
  const clientId = process.env.UNTAPPD_CLIENT_ID?.trim()
  const clientSecret = process.env.UNTAPPD_CLIENT_SECRET?.trim()

  if (!clientId || !clientSecret) {
    logError(
      SOURCE,
      'UNTAPPD_CLIENT_ID and UNTAPPD_CLIENT_SECRET are required (set them in .env)'
    )
    process.exit(1)
  }

  try {
    const collected: ApiCheckin[] = []
    let maxId: number | null = null

    while (collected.length < MAX_CHECKINS) {
      const page = await fetchPage(username, clientId, clientSecret, maxId)
      const items = page.response.checkins?.items ?? []
      if (items.length === 0) break
      collected.push(...items)
      const nextMax = page.response.pagination?.max_id
      if (!nextMax || nextMax === maxId) break
      maxId = nextMax
    }

    const trimmed = collected.slice(0, MAX_CHECKINS)
    const checkins: UntappdCheckin[] = trimmed.map((item) => ({
      id: String(item.checkin_id),
      url: `https://untappd.com/user/${username}/checkin/${item.checkin_id}`,
      checkedInAt: new Date(item.created_at).toISOString(),
      beer: item.beer?.beer_name?.trim() || 'Unknown beer',
      brewery: item.brewery?.brewery_name?.trim() || 'Unknown brewery',
      venue: venueName(item.venue),
      rating:
        typeof item.rating_score === 'number' && item.rating_score > 0
          ? item.rating_score
          : null,
      comment: item.checkin_comment?.trim() || '',
      imageUrl: photoUrl(item.media),
      beerLabel: item.beer?.beer_label?.trim() || null,
      breweryLabel: item.brewery?.brewery_label?.trim() || null,
    }))

    const rated = checkins.filter((c) => typeof c.rating === 'number') as Array<
      UntappdCheckin & { rating: number }
    >
    const averageRating =
      rated.length === 0
        ? 0
        : Math.round(
            (rated.reduce((s, c) => s + c.rating, 0) / rated.length) * 100
          ) / 100

    const [lifetime, badges, favourites] = await Promise.all([
      fetchUserInfo(username, clientId, clientSecret),
      fetchBadges(username, clientId, clientSecret),
      fetchFavourites(username, clientId, clientSecret),
    ])

    const data: UntappdData = {
      generatedAt: nowIso(),
      username,
      profileUrl: `https://untappd.com/user/${username}`,
      checkins,
      stats: {
        count: checkins.length,
        averageRating,
        topBreweries: aggregateTopBreweries(checkins),
      },
      lifetime,
      badges,
      favourites,
    }

    await writeJson(dataPath('untappd'), data)
    logWrote(SOURCE, checkins.length)
  } catch (err) {
    logError(SOURCE, err)
    process.exit(1)
  }
}

main()
