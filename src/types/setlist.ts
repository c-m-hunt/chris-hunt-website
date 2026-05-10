export interface SetlistGig {
  id: string
  date: string
  artist: string
  artistMbid: string | null
  artistImageUrl: string | null
  artistSpotifyUrl: string | null
  venue: string
  city: string
  country: string
  tour: string | null
  setlistUrl: string
}

export interface SetlistMeta {
  status: string
  message: string
}

export interface SetlistData {
  generatedAt: string
  username: string
  totalAttended: number
  gigs: SetlistGig[]
  _meta?: SetlistMeta
}
