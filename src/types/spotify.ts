export interface SpotifyArtist {
  id: string
  name: string
  url: string
  imageUrl: string | null
  genres: string[]
}

export interface SpotifyTrack {
  id: string
  name: string
  url: string
  durationMs: number
  previewUrl: string | null
  artists: { name: string; url: string }[]
  album: {
    name: string
    url: string
    imageUrl: string | null
    releaseDate: string | null
  }
}

export interface SpotifyNowPlaying {
  isPlaying: boolean
  progressMs: number
  track: SpotifyTrack | null
}

export interface SpotifyData {
  generatedAt: string
  nowPlaying: SpotifyNowPlaying | null
  topArtists: SpotifyArtist[]
  topTracks: SpotifyTrack[]
}
