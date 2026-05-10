# chris-hunt.net

Personal SPA built with Vite + React + TypeScript. The site reads typed JSON files from `public/data/` and renders them as a vertical, single-page resume of code, social posts, gigs, and cricket.

This commit is the **scaffold-only** phase. The JSON files in `public/data/` are realistic seed data that match the schemas in `research/`. Real data collectors that overwrite those files (cron job + GitHub Actions) land in the next phase.

## Stack

- [Vite](https://vite.dev/) + React 19 + TypeScript (strict, bundler resolution)
- [lucide-react](https://lucide.dev/) for icons
- ESLint (typescript-eslint, react-hooks, react-refresh) + Prettier
- Vanilla CSS in `src/index.css`. No CSS framework yet - designer will style later. Dark mode via `prefers-color-scheme`.

## Commands

```bash
npm install          # install deps
npm run dev          # start Vite dev server
npm run build        # type-check (tsc -b) + production build
npm run preview      # preview production build
npm run lint         # ESLint
npm run format       # Prettier write
npm run format:check # Prettier check
```

## Layout

```
src/
  components/     # Card, SectionHeader, Loader, EmptyState, ErrorBoundary
  sections/      # Hero, GitHub, Social, Setlist, Cricket
  data/          # typed loaders that import JSON from public/data
  types/         # one type module per source mirroring research schemas
  App.tsx        # composes sections vertically
  main.tsx
  index.css      # all styles, vanilla, dark-mode aware
public/
  data/          # SEED JSON - github, untappd, twitter, instagram, setlist, cricket
  favicon.svg
scripts/         # empty - data collectors live here in the next phase
research/        # API research; schemas in here are authoritative
```

Each section reads its data synchronously via a typed loader in `src/data/`. Loaders cast the imported JSON to the matching type from `src/types/` (relies on `resolveJsonModule: true`). Sections show `Last updated: <date>` from the JSON's `generatedAt` field, and surface an empty state when items are missing (e.g. setlist before the API key arrives).

## Secrets

Real values live in `.env` (gitignored). The collectors read these. Keys come from `.env.example`:

| Variable                                | Source                   | Used by                                                         |
| --------------------------------------- | ------------------------ | --------------------------------------------------------------- |
| `GH_PAT` / `GITHUB_TOKEN`               | GitHub PAT               | lifts rate limit + unlocks GraphQL contribution count           |
| `GITHUB_USERNAME`                       | hard-coded               | `c-m-hunt`                                                      |
| `UNTAPPD_USERNAME`                      | hard-coded               | `cmhunt`                                                        |
| `UNTAPPD_CLIENT_ID` / `_CLIENT_SECRET`  | Untappd API app          | required — public RSS is Cloudflare-blocked, so we use the API  |
| `TWITTER_USERNAME`                      | hard-coded               | `c_m_hunt`                                                      |
| `TWITTER_API_KEY`                       | rettiwt cookie bootstrap | base64-encoded session cookies; see Auth bootstrap below        |
| `TWITTER_ENABLED`                       | flag                     | set `true` to actually fetch                                    |
| `INSTAGRAM_USERNAME` / `_PASSWORD`      | account login            | fallback path; usually unused once `INSTAGRAM_SESSIONID` is set |
| `INSTAGRAM_SESSIONID`                   | browser session cookie   | preferred bootstrap; see Auth bootstrap below                   |
| `INSTAGRAM_ENABLED`                     | flag                     | set `true` to actually fetch                                    |
| `SETLISTFM_API_KEY` / `_USERNAME`       | apply at setlist.fm      | gigs feed                                                       |
| `PLAY_CRICKET_API_TOKEN` / `_PLAYER_ID` | ECB Play-Cricket         | match-detail aggregation                                        |
| `SPOTIFY_CLIENT_ID` / `_CLIENT_SECRET`  | Spotify dev dashboard    | OAuth client                                                    |
| `SPOTIFY_REFRESH_TOKEN`                 | one-time OAuth bootstrap | see Auth bootstrap below                                        |
| `SPOTIFY_REDIRECT_URI`                  | hard-coded               | `http://127.0.0.1:8888/callback` — must match the Spotify app   |

See `.env.example` for the canonical list. Cross-reference `research/easy-apis.md`, `research/niche-apis.md`, and `research/social-hard.md` for fetch strategy per source. CI configuration lives in [Deployment & secrets](#deployment--secrets) below.

## Data collectors

The scripts under `scripts/` regenerate the JSON files in `public/data/`. They use `tsx` to execute TypeScript directly and load `.env` via `dotenv`. Every collector logs `[<source>] starting...` and either `[<source>] wrote N items` or `[<source>] skipped (reason)`. Failures in a single collector log + exit 1, but `collect:all` keeps the others running.

| Command                     | Source       | Required env                                                                                   | Notes                                                                                                                                         |
| --------------------------- | ------------ | ---------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| `npm run collect:github`    | GitHub       | `GITHUB_USERNAME` (default `c-m-hunt`); `GH_PAT` recommended                                   | REST fan-out without a token; one GraphQL call when token is set. Always scrapes the public contribution calendar HTML for the heatmap data.  |
| `npm run collect:untappd`   | Untappd      | `UNTAPPD_CLIENT_ID`, `UNTAPPD_CLIENT_SECRET`, `UNTAPPD_USERNAME`                               | Untappd v4 API. Pulls 50 recent check-ins, lifetime totals, and recent badges in three calls.                                                 |
| `npm run collect:cricket`   | Play-Cricket | `PLAY_CRICKET_API_TOKEN`, `PLAY_CRICKET_PLAYER_ID`                                             | Heaviest collector. Caches `match_detail` per match in `.cache/cricket/`. Self-throttles 2 req/s.                                             |
| `npm run collect:twitter`   | Twitter/X    | `TWITTER_USERNAME`; `TWITTER_API_KEY`; `TWITTER_ENABLED=true`                                  | rettiwt-api 7.x with a cookie-based key. Guest mode is currently blocked by X. Skip path preserves existing JSON and refreshes `generatedAt`. |
| `npm run collect:instagram` | Instagram    | `INSTAGRAM_SESSIONID` _or_ `INSTAGRAM_USERNAME`+`INSTAGRAM_PASSWORD`; `INSTAGRAM_ENABLED=true` | Shells out to `scripts/_instagram_fetch.py` (instagrapi). Persists session to `.cache/instagram/session.json` for future runs.                |
| `npm run collect:setlist`   | setlist.fm   | `SETLISTFM_API_KEY`, `SETLISTFM_USERNAME`                                                      | Skips with a friendly message if the key is missing.                                                                                          |
| `npm run collect:spotify`   | Spotify      | `SPOTIFY_CLIENT_ID`, `SPOTIFY_CLIENT_SECRET`, `SPOTIFY_REFRESH_TOKEN`                          | Refresh token bootstrapped once via `npm run spotify:auth-url` → `npm run spotify:auth -- <code>`. Exchanges refresh→access on every run.     |
| `npm run collect:all`       | _all_        | union of the above                                                                             | Runs each collector sequentially. One failure does NOT block the rest; exits non-zero only if every collector fails.                          |

### CLI flags

`collect:cricket` accepts:

- `--no-cache` &mdash; ignore `.cache/cricket/*.json` and force-refetch every match.
- `--seasons 2019,2024` &mdash; restrict to one or more comma-separated seasons. Default range is `2010..currentYear`.

Example: `npx tsx scripts/collect-cricket.ts --seasons 2024` runs a one-season smoke test.

### Python requirement (Instagram)

`scripts/_instagram_fetch.py` uses [instagrapi](https://github.com/subzeroid/instagrapi). Install it once on the host that runs the collector:

```bash
python3 -m pip install instagrapi
```

The Node wrapper invokes `python3 scripts/_instagram_fetch.py` and reads JSON from stdout. Auth comes from `INSTAGRAM_SESSIONID` if set (preferred — see Auth bootstrap below), otherwise falls back to `INSTAGRAM_USERNAME`+`INSTAGRAM_PASSWORD`.

### Auth bootstrap

Three sources can't be unlocked with a static client key — they need a one-time interactive login that produces a long-lived token. Do these once locally, paste the resulting value into `.env`, then commit only the `.env.example` placeholder.

**Spotify (≈ 1 min):**

1. Register an app at [developer.spotify.com/dashboard](https://developer.spotify.com/dashboard) with redirect URI `http://127.0.0.1:8888/callback`.
2. Put the resulting `Client ID` and `Client Secret` in `.env`.
3. `npm run spotify:auth-url` — open the printed URL, click **Agree**.
4. Spotify redirects to `127.0.0.1:8888/callback?code=…`. The page won't load (no server) — copy the `code` param from the address bar.
5. `npm run spotify:auth -- <code>` → prints `SPOTIFY_REFRESH_TOKEN=…`. Paste into `.env`.

Refresh tokens last indefinitely (until revoked). Each `collect:spotify` run swaps the refresh token for a short-lived access token automatically.

**Twitter cookie API_KEY:**

Guest auth is blocked by X. Generate a cookie-backed `API_KEY` once:

1. Log into [x.com](https://x.com) in a browser.
2. Open DevTools → Application → Cookies → x.com. Copy `auth_token`, `ct0`, `kdt`, `twid` cookie values.
3. Build the string `kdt=<kdt>;twid=<twid>;ct0=<ct0>;auth_token=<auth_token>;`
4. `echo -n '<that string>' | base64` → that's your `TWITTER_API_KEY`. Paste into `.env`.

Lasts as long as you stay logged in to X (months in practice). Logging out invalidates it. rettiwt-api itself breaks ~quarterly when X rotates internal endpoints — pin the version tight (`^7.0.3` currently).

**Instagram session:**

instagrapi's full login flow trips IG's IP-blacklist almost immediately from a non-mobile IP. Bootstrap from a browser session instead:

1. Log into [instagram.com](https://www.instagram.com/) in a browser; complete any 2FA challenge.
2. DevTools → Application → Cookies → instagram.com. Copy the `sessionid` cookie value.
3. Paste it into `.env` as `INSTAGRAM_SESSIONID=…`.
4. First `npm run collect:instagram` run uses `login_by_sessionid()` and dumps a full instagrapi `session.json` to `.cache/instagram/`. Subsequent runs reuse the cached session and don't need the bootstrap.

IG sessions last 1–3 months. When it expires, the collector errors out and you redo step 1–3.

### Caches

Both `.cache/cricket/` and `.cache/instagram/` are gitignored. The CI workflow persists them between runs via `actions/cache@v4` (see [Deployment & secrets](#deployment--secrets) below) to keep the cricket collector fast and to avoid re-logging in to Instagram.

## Deployment & secrets

The repo ships two GitHub Actions workflows under `.github/workflows/`:

- **`refresh-data.yml`** &mdash; runs every collector daily at 04:00 UTC (and on demand), commits any changes under `public/data/` back to `main`.
- **`deploy.yml`** &mdash; builds the Vite SPA and deploys to GitHub Pages. Triggered on push to `main`, on demand, and when `refresh-data.yml` finishes successfully. So a successful refresh auto-deploys.

### Secrets and variables

Configure these under **Settings → Secrets and variables → Actions** on the repo. Secrets are encrypted and surfaced as `${{ secrets.NAME }}`; variables are plaintext and surfaced as `${{ vars.NAME }}` &mdash; use variables for non-sensitive config (usernames, feature flags, custom domain) so the workflow YAML can reference them without obfuscation.

| Name                     | Type     | Used by | Purpose                                                                                   |
| ------------------------ | -------- | ------- | ----------------------------------------------------------------------------------------- |
| `GITHUB_TOKEN`           | (auto)   | both    | provided by Actions; the collector reads `GH_PAT` first &mdash; see note below            |
| `GH_PAT`                 | secret   | refresh | fine-grained PAT, **public-repo read** scope; lifts rate limit, unlocks GraphQL           |
| `PLAY_CRICKET_API_TOKEN` | secret   | refresh | cricket collector                                                                         |
| `UNTAPPD_CLIENT_ID`      | secret   | refresh | Untappd v4 API                                                                            |
| `UNTAPPD_CLIENT_SECRET`  | secret   | refresh | Untappd v4 API                                                                            |
| `INSTAGRAM_SESSIONID`    | secret   | refresh | bootstrap session for instagrapi (preferred over user/pass)                               |
| `INSTAGRAM_USERNAME`     | secret   | refresh | fallback login                                                                            |
| `INSTAGRAM_PASSWORD`     | secret   | refresh | fallback login                                                                            |
| `TWITTER_API_KEY`        | secret   | refresh | base64-encoded session cookies; see Auth bootstrap                                        |
| `SETLISTFM_API_KEY`      | secret   | refresh | gigs collector                                                                            |
| `SPOTIFY_CLIENT_ID`      | secret   | refresh | Spotify dev app                                                                           |
| `SPOTIFY_CLIENT_SECRET`  | secret   | refresh | Spotify dev app                                                                           |
| `SPOTIFY_REFRESH_TOKEN`  | secret   | refresh | OAuth refresh token; bootstrapped via `npm run spotify:auth`                              |
| `INSTAGRAM_ENABLED`      | variable | refresh | feature flag (`true` to actually scrape Instagram)                                        |
| `TWITTER_ENABLED`        | variable | refresh | feature flag (`true` to actually scrape Twitter)                                          |
| `GITHUB_USERNAME`        | variable | refresh | defaults to `c-m-hunt`                                                                    |
| `UNTAPPD_USERNAME`       | variable | refresh | defaults to `cmhunt`                                                                      |
| `TWITTER_USERNAME`       | variable | refresh | defaults to `c_m_hunt`                                                                    |
| `SETLISTFM_USERNAME`     | variable | refresh | defaults to `cmhunt`                                                                      |
| `PLAY_CRICKET_PLAYER_ID` | variable | refresh | defaults to `12761`                                                                       |
| `CUSTOM_DOMAIN`          | variable | deploy  | optional. If set (e.g. `chris-hunt.net`), the workflow writes a `CNAME` and serves at `/` |

> **About `GITHUB_TOKEN` vs `GH_PAT`**: GitHub Actions auto-injects `secrets.GITHUB_TOKEN`, but it has effectively zero quota for public-API calls outside the repo it's running in &mdash; useless for hitting `api.github.com/users/<other-user>/...`. The collector reads `GH_PAT` first (a fine-grained PAT you create with **public-repo read** access), then falls back to `GITHUB_TOKEN`. Without `GH_PAT` the GraphQL path is unavailable and you'll get the slower REST fan-out at the unauthenticated 60/hr limit.

### First-time setup

1. **Enable GitHub Pages.** Settings → Pages → **Build and deployment → Source: GitHub Actions**. (Don't pick a branch &mdash; that's the legacy mode.)
2. **Add secrets.** Settings → Secrets and variables → Actions → **New repository secret**, one per row above marked `secret`. Anything you skip simply disables that collector (instagram/twitter stay opt-in via the `*_ENABLED` flags).
3. **Add variables.** Same page → **Variables** tab → **New repository variable**, one per row marked `variable`. Defaults work for the existing site &mdash; you only need to set these if you fork.
4. **Push to `main`.** The `deploy` workflow runs automatically and your site appears at `https://<user>.github.io/chris-hunt-website/`.
5. **Wait for the first scheduled refresh** (or trigger it manually &mdash; see below). Once it commits new data, `deploy` re-runs and republishes.

### Manual run

To trigger `refresh-data` on demand:

1. Open the repo's **Actions** tab.
2. Pick **refresh-data** from the left sidebar.
3. Click **Run workflow** → choose `main` → **Run workflow**.

The same flow works for `deploy` if you ever need to redeploy without a code or data change.

### Custom domain

The deploy workflow assumes project-pages URLs by default (`<user>.github.io/chris-hunt-website/`), which is why `vite.config.ts` reads a `BASE_PATH` env var and the workflow sets it to `/chris-hunt-website/`. If you want to serve from a custom domain or from a `<user>.github.io` repo, set the `CUSTOM_DOMAIN` repo variable. The workflow will:

- Set `BASE_PATH=/` for the build (assets resolve from the domain root).
- Write the value into `dist/CNAME` so Pages picks it up.

Don't commit a `CNAME` file directly &mdash; the variable is the source of truth so toggling between project-pages and a domain is a one-click change. After setting the variable, also configure the DNS records and turn on **Enforce HTTPS** in Pages settings.
