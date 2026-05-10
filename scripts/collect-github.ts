// Collect GitHub aggregate stats and write public/data/github.json.
// We deliberately do NOT include specific repository information — just
// profile aggregates, language byte breakdown across owned repos, and the
// contribution calendar (the "tiles") scraped from the public profile.

import 'dotenv/config'

import type {
  GitHubContributionCalendar,
  GitHubContributionDay,
  GitHubContributionLevel,
  GitHubData,
  GitHubLanguage,
} from '../src/types/github.ts'

import { colorFor } from './lib/lang-colors.ts'
import {
  dataPath,
  logError,
  logStart,
  logWrote,
  nowIso,
  writeJson,
} from './lib/util.ts'

const SOURCE = 'github'

const DEFAULT_HEADERS: Record<string, string> = {
  Accept: 'application/vnd.github+json',
  'X-GitHub-Api-Version': '2022-11-28',
  'User-Agent': 'chris-hunt-website-collector',
}

interface RestRepo {
  name: string
  language: string | null
  stargazers_count: number
  forks_count: number
  fork: boolean
  archived: boolean
  pushed_at: string
}

// Repos pushed within this window are considered "active" and contribute to
// the language byte breakdown. Older repos still count toward star/fork totals
// but their languages are excluded from the last-year mix.
const ACTIVE_WINDOW_MS = 365 * 24 * 60 * 60 * 1000
function isActive(pushedAt: string | null | undefined): boolean {
  if (!pushedAt) return false
  const t = Date.parse(pushedAt)
  if (!Number.isFinite(t)) return false
  return Date.now() - t <= ACTIVE_WINDOW_MS
}

// Languages whose byte counts are dominated by non-code content
// (`.ipynb` files inline base64-encoded chart outputs, so bytes correlate
// with figures rendered, not code written).
const EXCLUDED_LANGUAGES = new Set(['Jupyter Notebook'])

interface RestUser {
  name: string | null
  bio: string | null
  avatar_url: string
  html_url: string
  company: string | null
  location: string | null
  blog: string | null
  twitter_username: string | null
  followers: number
  following: number
  public_repos: number
  created_at: string
}

function authHeaders(token: string | undefined): Record<string, string> {
  if (!token) return DEFAULT_HEADERS
  return { ...DEFAULT_HEADERS, Authorization: `Bearer ${token}` }
}

async function fetchJson<T>(
  url: string,
  headers: Record<string, string>
): Promise<T> {
  const res = await fetch(url, { headers })
  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new Error(`GET ${url} -> ${res.status} ${res.statusText}: ${body.slice(0, 200)}`)
  }
  return (await res.json()) as T
}

function aggregatePrimaryLanguages(
  primaries: Array<string | null>,
  limit = 8
): GitHubLanguage[] {
  const counts = new Map<string, number>()
  for (const lang of primaries) {
    if (!lang || EXCLUDED_LANGUAGES.has(lang)) continue
    counts.set(lang, (counts.get(lang) ?? 0) + 1)
  }
  const grand = Array.from(counts.values()).reduce((a, b) => a + b, 0)
  if (grand === 0) return []
  return Array.from(counts.entries())
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, limit)
    .map(([name, repos]) => ({
      name,
      repos,
      percent: Math.round((repos / grand) * 1000) / 10,
      color: colorFor(name),
    }))
}

async function fetchContributionCalendar(
  username: string
): Promise<GitHubContributionCalendar | null> {
  const url = `https://github.com/users/${username}/contributions`
  const res = await fetch(url, {
    headers: {
      'User-Agent':
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 chris-hunt-website-collector',
      Accept: 'text/html',
    },
  })
  if (!res.ok) {
    console.warn(`[github] contributions HTML returned ${res.status}`)
    return null
  }
  const html = await res.text()

  const totalMatch = html.match(
    /id="js-contribution-activity-description"[^>]*>\s*([\d,]+)/
  )
  const totalContributions = totalMatch
    ? parseInt(totalMatch[1].replace(/,/g, ''), 10)
    : 0

  // Build a map of cell-id → count from the (sr-only) tooltips.
  const tooltipRe =
    /<tool-tip\b[^>]*for="(contribution-day-component-\d+-\d+)"[^>]*>([^<]*)<\/tool-tip>/g
  const counts = new Map<string, number>()
  let tm: RegExpExecArray | null
  while ((tm = tooltipRe.exec(html)) !== null) {
    const id = tm[1]
    const text = tm[2].trim()
    const numMatch = text.match(/^(\d+|No)\b/)
    if (numMatch) {
      counts.set(id, numMatch[1] === 'No' ? 0 : parseInt(numMatch[1], 10))
    }
  }

  // Each <td class="ContributionCalendar-day"> is one day. GitHub orders the
  // attributes inconsistently (data-date / id / data-level), so capture the
  // tag and pull each attribute out independently.
  const tdRe = /<td[^>]*class="[^"]*ContributionCalendar-day[^"]*"[^>]*>/g
  type Cell = GitHubContributionDay & { weekIdx: number; dayIdx: number }
  const cells: Cell[] = []
  let m: RegExpExecArray | null
  while ((m = tdRe.exec(html)) !== null) {
    const tag = m[0]
    const dateMatch = tag.match(/\bdata-date="(\d{4}-\d{2}-\d{2})"/)
    const levelMatch = tag.match(/\bdata-level="(\d)"/)
    // id format: contribution-day-component-<dayOfWeekRow>-<weekColumn>
    const idMatch = tag.match(/\bid="(contribution-day-component-(\d+)-(\d+))"/)
    if (!dateMatch || !levelMatch || !idMatch) continue
    cells.push({
      date: dateMatch[1],
      count: counts.get(idMatch[1]) ?? 0,
      level: parseInt(levelMatch[1], 10) as GitHubContributionLevel,
      dayIdx: parseInt(idMatch[2], 10),
      weekIdx: parseInt(idMatch[3], 10),
    })
  }

  if (cells.length === 0) {
    console.warn('[github] contributions HTML returned no day cells (markup changed?)')
    return null
  }

  // Group into weeks by weekIdx, sorted; days within a week sorted by dayIdx.
  const weeksMap = new Map<number, Cell[]>()
  for (const c of cells) {
    if (!weeksMap.has(c.weekIdx)) weeksMap.set(c.weekIdx, [])
    weeksMap.get(c.weekIdx)!.push(c)
  }
  const weeks = Array.from(weeksMap.entries())
    .sort((a, b) => a[0] - b[0])
    .map(([, ws]) =>
      ws
        .sort((a, b) => a.dayIdx - b.dayIdx)
        .map<GitHubContributionDay>(({ date, count, level }) => ({ date, count, level }))
    )

  return { totalContributions, weeks }
}

async function collectViaRest(
  username: string,
  token: string | undefined
): Promise<GitHubData> {
  const headers = authHeaders(token)

  const user = await fetchJson<RestUser>(
    `https://api.github.com/users/${username}`,
    headers
  )

  const repos = await fetchJson<RestRepo[]>(
    `https://api.github.com/users/${username}/repos?per_page=100&type=owner&sort=updated`,
    headers
  )

  const nonForkRepos = repos.filter((r) => !r.fork)
  const totalStars = nonForkRepos.reduce((s, r) => s + r.stargazers_count, 0)
  const totalForks = nonForkRepos.reduce((s, r) => s + r.forks_count, 0)
  // REST `/users/{user}/repos` excludes private repos, so r.language already
  // reflects only public primaries — no extra filter needed here.
  const activePrimaries = nonForkRepos
    .filter((r) => isActive(r.pushed_at))
    .map((r) => r.language)

  const calendar = await fetchContributionCalendar(username)

  return {
    generatedAt: nowIso(),
    username,
    profile: {
      name: user.name ?? username,
      bio: user.bio ?? '',
      avatarUrl: user.avatar_url,
      profileUrl: user.html_url,
      company: user.company,
      location: user.location,
      blog: user.blog && user.blog.length > 0 ? user.blog : null,
      twitter: user.twitter_username,
      followers: user.followers,
      following: user.following,
      publicRepos: user.public_repos,
      memberSince: user.created_at,
    },
    stats: {
      totalStars,
      totalForks,
      contributionsLastYear: calendar?.totalContributions ?? null,
      contributionsSource: calendar ? 'html' : 'unavailable',
    },
    languages: aggregatePrimaryLanguages(activePrimaries),
    contributionCalendar: calendar,
  }
}

interface GqlRepoNode {
  pushedAt: string | null
  stargazerCount: number
  forkCount: number
  isFork: boolean
  isArchived: boolean
  isPrivate: boolean
  primaryLanguage: { name: string; color: string | null } | null
}

interface GqlResponse {
  data?: {
    user: {
      name: string | null
      bio: string | null
      avatarUrl: string
      login: string
      url: string
      company: string | null
      location: string | null
      websiteUrl: string | null
      twitterUsername: string | null
      followers: { totalCount: number }
      following: { totalCount: number }
      createdAt: string
      contributionsCollection: {
        contributionCalendar: { totalContributions: number }
      }
      repositories: {
        totalCount: number
        nodes: GqlRepoNode[]
      }
    }
  }
  errors?: Array<{ message: string }>
}

const GQL_QUERY = `
query AggregateStats($login: String!) {
  user(login: $login) {
    name
    bio
    avatarUrl
    login
    url
    company
    location
    websiteUrl
    twitterUsername
    followers { totalCount }
    following { totalCount }
    createdAt
    contributionsCollection {
      contributionCalendar { totalContributions }
    }
    repositories(
      first: 100
      ownerAffiliations: OWNER
      isFork: false
      isArchived: false
      privacy: PUBLIC
    ) {
      totalCount
      nodes {
        pushedAt
        stargazerCount
        forkCount
        isFork
        isArchived
        isPrivate
        primaryLanguage { name color }
      }
    }
  }
}`

async function collectViaGraphql(
  username: string,
  token: string
): Promise<GitHubData> {
  const headers = {
    ...authHeaders(token),
    'Content-Type': 'application/json',
  }
  const res = await fetch('https://api.github.com/graphql', {
    method: 'POST',
    headers,
    body: JSON.stringify({ query: GQL_QUERY, variables: { login: username } }),
  })
  if (!res.ok) {
    throw new Error(`GraphQL ${res.status} ${res.statusText}`)
  }
  const json = (await res.json()) as GqlResponse
  if (json.errors && json.errors.length > 0) {
    throw new Error(`GraphQL errors: ${json.errors.map((e) => e.message).join('; ')}`)
  }
  if (!json.data) throw new Error('GraphQL response missing data')
  const u = json.data.user

  const repoNodes = u.repositories.nodes
  const totalStars = repoNodes.reduce((s, r) => s + r.stargazerCount, 0)
  const totalForks = repoNodes.reduce((s, r) => s + r.forkCount, 0)

  // Count primary languages across active public repos. We capture the
  // GraphQL-supplied colour the first time we see each language so the bar
  // matches GitHub's palette without needing colorFor() to know the rare ones.
  const counts = new Map<string, { count: number; color: string | null }>()
  for (const r of repoNodes) {
    if (r.isPrivate) continue
    if (!isActive(r.pushedAt)) continue
    const lang = r.primaryLanguage?.name
    if (!lang || EXCLUDED_LANGUAGES.has(lang)) continue
    const existing = counts.get(lang) ?? { count: 0, color: null }
    existing.count += 1
    if (!existing.color && r.primaryLanguage?.color) {
      existing.color = r.primaryLanguage.color
    }
    counts.set(lang, existing)
  }
  const grand = Array.from(counts.values()).reduce((a, b) => a + b.count, 0)
  const languages: GitHubLanguage[] =
    grand === 0
      ? []
      : Array.from(counts.entries())
          .sort((a, b) => b[1].count - a[1].count || a[0].localeCompare(b[0]))
          .slice(0, 8)
          .map(([name, v]) => ({
            name,
            repos: v.count,
            percent: Math.round((v.count / grand) * 1000) / 10,
            color: v.color ?? colorFor(name),
          }))

  const calendar = await fetchContributionCalendar(username)

  return {
    generatedAt: nowIso(),
    username,
    profile: {
      name: u.name ?? username,
      bio: u.bio ?? '',
      avatarUrl: u.avatarUrl,
      profileUrl: u.url,
      company: u.company,
      location: u.location,
      blog: u.websiteUrl && u.websiteUrl.length > 0 ? u.websiteUrl : null,
      twitter: u.twitterUsername,
      followers: u.followers.totalCount,
      following: u.following.totalCount,
      publicRepos: u.repositories.totalCount,
      memberSince: u.createdAt,
    },
    stats: {
      totalStars,
      totalForks,
      contributionsLastYear:
        calendar?.totalContributions ??
        u.contributionsCollection.contributionCalendar.totalContributions,
      contributionsSource: calendar ? 'html' : 'graphql',
    },
    languages,
    contributionCalendar: calendar,
  }
}

async function main(): Promise<void> {
  logStart(SOURCE)
  const username = process.env.GITHUB_USERNAME?.trim() || 'c-m-hunt'
  const token =
    process.env.GH_PAT?.trim() ||
    process.env.GITHUB_TOKEN?.trim() ||
    undefined

  try {
    const data = token
      ? await collectViaGraphql(username, token)
      : await collectViaRest(username, undefined)
    await writeJson(dataPath('github'), data)
    const days = data.contributionCalendar
      ? data.contributionCalendar.weeks.reduce((s, w) => s + w.length, 0)
      : 0
    logWrote(SOURCE, days)
  } catch (err) {
    logError(SOURCE, err)
    process.exit(1)
  }
}

main()
