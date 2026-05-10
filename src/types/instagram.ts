export type InstagramMediaType = 'image' | 'video' | 'carousel' | 'reel'

export interface InstagramMediaImage {
  type: 'image'
  url: string
  width: number
  height: number
  alt: string | null
}

export interface InstagramMediaVideo {
  type: 'video'
  url: string
  thumbnail_url: string
  duration_seconds: number
  width: number
  height: number
}

export type InstagramMedia = InstagramMediaImage | InstagramMediaVideo

export interface InstagramLocation {
  name: string
  lat: number
  lng: number
}

export interface InstagramMetrics {
  like_count: number
  comment_count: number
  view_count: number | null
}

export interface InstagramPost {
  id: string
  shortcode: string
  url: string
  caption: string
  taken_at: string
  media_type: InstagramMediaType
  location: InstagramLocation | null
  media: InstagramMedia[]
  metrics: InstagramMetrics
}

export interface InstagramData {
  user: string
  fetched_at: string
  source: string
  generatedAt: string
  posts: InstagramPost[]
}
