export interface UntappdCheckin {
  id: string
  url: string
  checkedInAt: string
  beer: string
  brewery: string
  venue: string | null
  rating: number | null
  comment: string
  imageUrl: string | null
  beerLabel: string | null
  breweryLabel: string | null
}

export interface UntappdTopBrewery {
  name: string
  count: number
}

export interface UntappdStats {
  count: number
  averageRating: number
  topBreweries: UntappdTopBrewery[]
}

export interface UntappdLifetime {
  totalCheckins: number
  uniqueBeers: number
  totalBadges: number
  totalFriends: number
  daysSinceFirstCheckin: number | null
  firstCheckinAt: string | null
}

export interface UntappdBadge {
  id: string
  name: string
  description: string
  imageUrl: string | null
  earnedAt: string | null
  level: number | null
}

export interface UntappdData {
  generatedAt: string
  username: string
  profileUrl: string
  checkins: UntappdCheckin[]
  stats: UntappdStats
  lifetime: UntappdLifetime | null
  badges: UntappdBadge[]
}
