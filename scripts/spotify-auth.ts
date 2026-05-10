// One-time helper to exchange a Spotify authorization code for a refresh token.
// Usage:
//   1) Build the auth URL via `npm run spotify:auth-url` (or print below) and
//      open it in a browser. Authorize the app.
//   2) Spotify redirects to http://127.0.0.1:8888/callback?code=XXXXX. The page
//      will fail to load (no server) — copy the `code` from the address bar.
//   3) Run `npx tsx scripts/spotify-auth.ts <code>`. Paste the printed
//      SPOTIFY_REFRESH_TOKEN into .env.

import 'dotenv/config'

const SCOPES = [
  'user-read-currently-playing',
  'user-read-recently-played',
  'user-top-read',
].join(' ')

function authUrl(): string {
  const id = required('SPOTIFY_CLIENT_ID')
  const redirect = process.env.SPOTIFY_REDIRECT_URI || 'http://127.0.0.1:8888/callback'
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: id,
    scope: SCOPES,
    redirect_uri: redirect,
    state: 'init',
    show_dialog: 'true',
  })
  return `https://accounts.spotify.com/authorize?${params.toString()}`
}

function required(name: string): string {
  const v = process.env[name]?.trim()
  if (!v) throw new Error(`${name} is required (set in .env)`)
  return v
}

async function exchangeCodeForTokens(code: string): Promise<void> {
  const id = required('SPOTIFY_CLIENT_ID')
  const secret = required('SPOTIFY_CLIENT_SECRET')
  const redirect = process.env.SPOTIFY_REDIRECT_URI || 'http://127.0.0.1:8888/callback'
  const basic = Buffer.from(`${id}:${secret}`).toString('base64')

  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    code,
    redirect_uri: redirect,
  })
  const res = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: {
      Authorization: `Basic ${basic}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body,
  })
  const text = await res.text()
  if (!res.ok) {
    throw new Error(`token exchange ${res.status}: ${text}`)
  }
  const json = JSON.parse(text) as {
    access_token?: string
    refresh_token?: string
    expires_in?: number
    scope?: string
    token_type?: string
  }
  if (!json.refresh_token) {
    throw new Error(`no refresh_token in response: ${text}`)
  }
  console.log('SPOTIFY_REFRESH_TOKEN=' + json.refresh_token)
  console.error('\n[ok] paste the line above into .env then run: npm run collect:spotify')
  console.error(`[scope] ${json.scope}`)
}

async function main(): Promise<void> {
  const arg = process.argv[2]
  if (!arg || arg === '--url') {
    console.log(authUrl())
    return
  }
  await exchangeCodeForTokens(arg)
}

main().catch((err) => {
  console.error('[spotify-auth] error:', (err as Error).message)
  process.exit(1)
})
