export interface TwitterMedia {
  type: 'photo' | 'video' | 'gif' | string
  url: string
  width: number
  height: number
  alt: string | null
}

export interface TwitterMetrics {
  like_count: number
  reply_count: number
  retweet_count: number
  quote_count: number
  view_count: number | null
}

export interface TwitterPost {
  id: string
  url: string
  text: string
  html: string | null
  created_at: string
  lang: string
  is_reply: boolean
  is_retweet: boolean
  is_quote: boolean
  reply_to: string | null
  quoted: string | null
  media: TwitterMedia[]
  metrics: TwitterMetrics
}

export interface TwitterData {
  user: string
  fetched_at: string
  source: string
  generatedAt: string
  posts: TwitterPost[]
}
