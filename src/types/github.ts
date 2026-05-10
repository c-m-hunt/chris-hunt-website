export interface GitHubProfile {
  name: string
  bio: string
  avatarUrl: string
  profileUrl: string
  company: string | null
  location: string | null
  blog: string | null
  twitter: string | null
  followers: number
  following: number
  publicRepos: number
  memberSince: string
}

export interface GitHubStats {
  totalStars: number
  totalForks: number
  contributionsLastYear: number | null
  contributionsSource: 'graphql' | 'html' | 'unavailable'
}

export interface GitHubLanguage {
  name: string
  /** Number of public repos with this as their primary language (active in the last year). */
  repos: number
  percent: number
  color: string
}

export type GitHubContributionLevel = 0 | 1 | 2 | 3 | 4

export interface GitHubContributionDay {
  date: string
  count: number
  level: GitHubContributionLevel
}

export interface GitHubContributionCalendar {
  totalContributions: number
  weeks: GitHubContributionDay[][]
}

export interface GitHubData {
  generatedAt: string
  username: string
  profile: GitHubProfile
  stats: GitHubStats
  languages: GitHubLanguage[]
  contributionCalendar: GitHubContributionCalendar | null
}
