// Collect Twitter/X posts via rettiwt-api in guest mode and write
// public/data/twitter.json. Disabled by default behind TWITTER_ENABLED=true so
// runs in CI / locally are no-ops until the user opts in. Even when disabled
// we refresh `generatedAt` and preserve the existing dummy data so the SPA
// keeps rendering.
//
// See research/social-hard.md for the rationale behind opt-in gating.

import 'dotenv/config'

import { existsSync } from 'node:fs'
import { readFile } from 'node:fs/promises'

import type {
  TwitterData,
  TwitterMedia,
  TwitterPost,
} from '../src/types/twitter.ts'

import {
  dataPath,
  logError,
  logSkipped,
  logStart,
  logWrote,
  nowIso,
  writeJson,
} from './lib/util.ts'

const SOURCE = 'twitter'

interface RettiwtTweetMedia {
  type?: string
  url?: string
  media_url_https?: string
  media_url?: string
  width?: number
  height?: number
  alt?: string | null
  alt_text?: string | null
  sizes?: { large?: { w?: number; h?: number } }
}

interface RettiwtTweet {
  id?: string
  rest_id?: string
  fullText?: string
  text?: string
  createdAt?: string | Date
  created_at?: string | Date
  lang?: string
  replyTo?: string | null
  in_reply_to_status_id_str?: string | null
  quoted?: string | null
  quoted_status_id_str?: string | null
  retweetedTweet?: unknown
  isRetweet?: boolean
  isQuote?: boolean
  isReply?: boolean
  media?: RettiwtTweetMedia[] | null
  entities?: { media?: RettiwtTweetMedia[] }
  likeCount?: number
  favorite_count?: number
  replyCount?: number
  reply_count?: number
  retweetCount?: number
  retweet_count?: number
  quoteCount?: number
  quote_count?: number
  viewCount?: number
  view_count?: number | null
  tweetBy?: { userName?: string; screen_name?: string }
}

async function preserveExisting(file: string): Promise<TwitterData | null> {
  if (!existsSync(file)) return null
  try {
    const raw = await readFile(file, 'utf8')
    return JSON.parse(raw) as TwitterData
  } catch {
    return null
  }
}

function toMedia(raw: RettiwtTweetMedia[] | undefined): TwitterMedia[] {
  if (!raw) return []
  return raw.map((m) => ({
    // rettiwt 7.x returns the type uppercased (PHOTO/VIDEO/GIF); normalise to
    // lowercase so the React component can compare against 'photo' without surprises.
    type: (m.type ?? 'photo').toLowerCase() as TwitterMedia['type'],
    url: m.url ?? m.media_url_https ?? m.media_url ?? '',
    width: m.width ?? m.sizes?.large?.w ?? 0,
    height: m.height ?? m.sizes?.large?.h ?? 0,
    alt: m.alt ?? m.alt_text ?? null,
  }))
}

function toIso(value: string | Date | undefined): string {
  if (!value) return nowIso()
  if (value instanceof Date) return value.toISOString()
  const d = new Date(value)
  return Number.isNaN(d.getTime()) ? nowIso() : d.toISOString()
}

function mapTweet(raw: RettiwtTweet, username: string): TwitterPost {
  const id = raw.id ?? raw.rest_id ?? ''
  const text = raw.fullText ?? raw.text ?? ''
  const created_at = toIso(raw.createdAt ?? raw.created_at)
  const replyTo = raw.replyTo ?? raw.in_reply_to_status_id_str ?? null
  const quoted = raw.quoted ?? raw.quoted_status_id_str ?? null
  const isRetweet = raw.isRetweet ?? Boolean(raw.retweetedTweet)
  const isQuote = raw.isQuote ?? Boolean(quoted)
  const isReply = raw.isReply ?? Boolean(replyTo)
  const media = toMedia(raw.media ?? raw.entities?.media ?? undefined)
  return {
    id,
    url: `https://x.com/${username}/status/${id}`,
    text,
    html: null,
    created_at,
    lang: raw.lang ?? 'en',
    is_reply: isReply,
    is_retweet: isRetweet,
    is_quote: isQuote,
    reply_to: replyTo,
    quoted,
    media,
    metrics: {
      like_count: raw.likeCount ?? raw.favorite_count ?? 0,
      reply_count: raw.replyCount ?? raw.reply_count ?? 0,
      retweet_count: raw.retweetCount ?? raw.retweet_count ?? 0,
      quote_count: raw.quoteCount ?? raw.quote_count ?? 0,
      view_count: raw.viewCount ?? raw.view_count ?? null,
    },
  }
}

async function fetchViaRettiwt(username: string, limit = 20): Promise<TwitterPost[]> {
  // Lazy import so the dep cost stays out of the disabled path.
  const mod = (await import('rettiwt-api')) as unknown as {
    Rettiwt: new (config?: { apiKey?: string }) => {
      tweet: {
        search: (filter: { fromUsers: string[] }, count: number) => Promise<{
          list: RettiwtTweet[]
        }>
      }
    }
  }
  const apiKey = process.env.TWITTER_API_KEY?.trim()
  const client = new mod.Rettiwt(apiKey ? { apiKey } : undefined)
  const res = await client.tweet.search({ fromUsers: [username] }, limit)
  return (res.list ?? []).map((t) => mapTweet(t, username))
}

async function main(): Promise<void> {
  logStart(SOURCE)
  const username = process.env.TWITTER_USERNAME?.trim() || 'c_m_hunt'
  const enabled = process.env.TWITTER_ENABLED?.trim().toLowerCase() === 'true'
  const file = dataPath('twitter')

  if (!enabled) {
    logSkipped(SOURCE, 'TWITTER_ENABLED not true')
    const existing = await preserveExisting(file)
    if (existing) {
      const refreshed: TwitterData = { ...existing, generatedAt: nowIso() }
      await writeJson(file, refreshed)
    }
    return
  }

  try {
    const posts = await fetchViaRettiwt(username)
    const data: TwitterData = {
      user: username,
      fetched_at: nowIso(),
      source: 'rettiwt-api',
      generatedAt: nowIso(),
      posts,
    }
    await writeJson(file, data)
    logWrote(SOURCE, posts.length)
  } catch (err) {
    logError(SOURCE, err)
    process.exit(1)
  }
}

main()
