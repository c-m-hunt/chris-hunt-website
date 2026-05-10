export interface CricketBestBowling {
  wickets: number
  runs: number
  matchId: number
}

export interface CricketBatting {
  matches: number
  innings: number
  notOuts: number
  runs: number
  highScore: number
  highScoreNotOut: boolean
  /** null when there are no completed innings (always not out / DNB only). */
  average: number | null
  strikeRate?: number | null
  fifties: number
  hundreds: number
  fours: number
  sixes: number
  ducks: number
}

export interface CricketBowling {
  matches: number
  innings: number
  overs: number
  maidens: number
  runs: number
  wickets: number
  /** null when no wickets taken (avg = runs / wickets is undefined). */
  average: number | null
  economy: number
  strikeRate: number
  bestBowling: CricketBestBowling
  fiveWicketHauls: number
}

export interface CricketFielding {
  catches: number
  stumpings: number
  runOuts: number
}

export interface CricketSeason {
  year: number
  batting: CricketBatting
  bowling: CricketBowling
  fielding: CricketFielding
}

export interface CricketCareer {
  batting: CricketBatting
  bowling: CricketBowling
  fielding: CricketFielding
}

export interface CricketClub {
  id: number
  name: string
}

export interface CricketData {
  generatedAt: string
  playerId: number
  playerName: string
  club: CricketClub
  career: CricketCareer
  seasons: CricketSeason[]
}
