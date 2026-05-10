# Social Feed Extraction — Twitter/X & Instagram

Research date: 2026-05-09
Target: nightly GitHub Actions cron job that produces `twitter.json` and `instagram.json` for a Vite+React SPA. Single named user. Cred risk acceptable.

---

## TL;DR

| Platform  | Primary path                                                    | Fallback                                       | Needs creds?       | Reliability  |
| --------- | --------------------------------------------------------------- | ---------------------------------------------- | ------------------ | ------------ |
| Twitter/X | `rettiwt-api` (Node) — guest auth, no login                     | `@the-convocation/twitter-scraper` w/ login    | No (guest); cookie if guest fails | Medium-low; expect breakage every few months |
| Instagram | `instagrapi` (Python, shelled out from Node) using user/pass    | `instaloader` (Python) cookie-only mode        | Yes (user/pass)    | Medium; periodic challenge / 429 / ban risk |

**Headline blockers:**
- Instagram **personal** accounts cannot be served by any official API. Graph API needs Business/Creator + Facebook Page link. Basic Display API is dead (Dec 4, 2024).
- All viable paths violate Twitter/X and Instagram ToS to some degree. User has accepted that.

---

## Twitter / X

### State of the world (May 2026)

- Free tier of official API = posting only. Read access starts at "Basic" paid tier.
- `snscrape` is effectively dead.
- Public Nitter network has collapsed; `nitter.net` and most community instances are decommissioned. `ntscraper` is unreliable. RSS-Bridge's TwitterV2 bridge requires a paid bearer token.
- Reverse-engineered scrapers using the web frontend GraphQL API still work intermittently. They break every few months when X rotates client-transaction IDs / endpoints.

### Primary recommendation: `rettiwt-api`

- npm: `rettiwt-api`
- GitHub: https://github.com/Rishikant181/Rettiwt-API
- Stars: ~830, last release `7.0.3` on **2026-05-02** (one week ago). Active.
- Pure TypeScript, runs in Node — fits the project stack.
- Supports **guest authentication by default** (no login needed for public user timelines). Falls back to a cookie-based `API_KEY` for higher rate limits or if guest auth is rate-limited.
- Surface: `User Timeline` by username works in both guest and authed modes. We need exactly that.
- Recent issues (#867 on 2026-04-24, #862 on 2026-04-17) show active API breakage and active fixes — consistent with "this works but you'll need to bump the version sometimes."

**Pin the version** in `package.json` and rely on Renovate/Dependabot to nudge upgrades; don't `^`-pin loosely because every minor often contains an emergency fix.

### Fallback: `@the-convocation/twitter-scraper`

- npm: `@the-convocation/twitter-scraper`, GitHub: https://github.com/the-convocation/twitter-scraper
- Stars: ~613, last release `0.22.3` on **2026-04-01**.
- Port of the archived `n0madic/twitter-scraper`. Requires `scraper.login(user, pass, email)` for many operations. Issue #192 (2026-04-10) reports 403 Cloudflare on login; #190 (2026-03-28) reports 401s. Login flow is the fragile part.
- Useful as a backup if guest auth on rettiwt is blocked region-wide.

### Cred / infra requirements

- Primary path: **no creds**. Guest tokens are obtained automatically.
- If guest is blocked: a single throwaway X account + a cookie extractor (browser extension → `auth_token`/`ct0`). Store as `TWITTER_API_KEY` GitHub secret.
- Username is `c_m_hunt`. We don't need creds for that account.
- No headless browser needed for either library — both speak the X internal API directly.

### Reliability signal

- Expect breakage **roughly quarterly**. Treat the cron job as best-effort: catch errors, keep last-known-good `twitter.json` on disk, surface a "last updated" timestamp in the SPA.
- X is increasingly aggressive with Cloudflare interstitials on datacenter IPs. GitHub Actions runners *do* hit Cloudflare blocks sometimes — if it becomes constant, a residential-proxy step would be needed (out of scope for a personal site).

### Sample `twitter.json`

```json
{
  "user": "c_m_hunt",
  "fetched_at": "2026-05-09T03:14:00Z",
  "source": "rettiwt-api@7.0.3",
  "posts": [
    {
      "id": "1789042938472938472",
      "url": "https://x.com/c_m_hunt/status/1789042938472938472",
      "text": "Tweet body with full text, links unshortened.",
      "html": null,
      "created_at": "2026-05-08T19:42:11Z",
      "lang": "en",
      "is_reply": false,
      "is_retweet": false,
      "is_quote": false,
      "reply_to": null,
      "quoted": null,
      "media": [
        {
          "type": "photo",
          "url": "https://pbs.twimg.com/media/abc123.jpg",
          "width": 1200,
          "height": 800,
          "alt": null
        }
      ],
      "metrics": {
        "like_count": 12,
        "reply_count": 2,
        "retweet_count": 1,
        "quote_count": 0,
        "view_count": 482
      }
    }
  ]
}
```

### Legal / ToS

- X ToS prohibits scraping without permission. Risk is the throwaway account being suspended; site is not exposed because rettiwt's guest mode uses anonymous tokens. Personal site, low volume — practical risk to user is low. Document the source and link back to original tweets to stay on the right side of "transformative display."

---

## Instagram

### State of the world (May 2026)

- **Basic Display API: dead.** EOL on 2024-12-04.
- **Graph API:** only works for Business/Creator accounts linked to a Facebook Page. To use it for `c_m_hunt`'s personal IG, the account must be (a) switched to Creator, (b) linked to a FB Page, (c) enrolled in a Meta developer app, (d) approved for `instagram_basic` scope. Long-lived tokens last 60 days and need refresh. Doable but heavyweight for a personal site, and *converting an account to Creator changes its public appearance*.
- Unauthenticated oEmbed is gone (since 2020) and embed widgets need an app access token.
- Therefore, for a personal account that does NOT want to be converted to Creator, the only real options are reverse-engineered private-API libraries.

### Primary recommendation: `instagrapi` (Python)

- GitHub: https://github.com/subzeroid/instagrapi
- Stars: ~6.2k, latest release `2.5.14` on **2026-05-09** (today). Highly active.
- Combines public-web + private-mobile API flows. Best in class for "log in as a real user, fetch own / public-user media."
- Shell out from Node — write a small `scripts/fetch-instagram.py`, call it from a Node task or directly from the GitHub Actions job. Output JSON to stdout, Node redirects to `instagram.json`.
- Maintainer's own warning: "better suited for testing and research than for running a production business." For a low-volume cron on a single account, that caveat is fine — production-grade reliability is not the goal.

```python
# scripts/fetch-instagram.py (sketch)
from instagrapi import Client
import json, os, sys

cl = Client()
session_path = os.environ.get("IG_SESSION_FILE", "ig_session.json")

if os.path.exists(session_path):
    cl.load_settings(session_path)
    cl.login(os.environ["INSTAGRAM_USERNAME"], os.environ["INSTAGRAM_PASSWORD"])
else:
    cl.login(os.environ["INSTAGRAM_USERNAME"], os.environ["INSTAGRAM_PASSWORD"])
    cl.dump_settings(session_path)

target = os.environ.get("INSTAGRAM_TARGET_USERNAME", os.environ["INSTAGRAM_USERNAME"])
user_id = cl.user_id_from_username(target)
medias = cl.user_medias(user_id, amount=12)

out = {"user": target, "posts": [m.dict() for m in medias]}
json.dump(out, sys.stdout, default=str)
```

**Critical operational note:** persist and **cache the session JSON between runs** (commit it encrypted, or store as GHA cache). Repeatedly logging in fresh from new GitHub Actions IPs is the single biggest trigger for IG challenges and bans.

### Fallback: `instaloader` (Python)

- GitHub: https://github.com/instaloader/instaloader
- Stars: ~12.3k, latest release `4.15.1` on **2026-03-21**.
- Recent issue traffic (#2680 "Account PermaBanned", #2684 "429 Too Many Requests", #2691 "failing downloads logged in or not") makes it clear: anonymous/no-login mode is largely cooked in 2026. Authenticated still works but with the same ban risk as instagrapi.
- Useful purely as a "if instagrapi breaks, swap in" backup. Same login env vars.

### Cred / infra requirements

- **User/pass required** (`INSTAGRAM_USERNAME`, `INSTAGRAM_PASSWORD` already supplied). Strongly recommend a **dedicated burner account** that follows `c_m_hunt`, rather than using the real account — if anything gets banned, only the burner does. The burner only needs to follow the public account; if the target is private, the burner needs to be an accepted follower.
- **Persisted session file** to avoid re-login every run. Encrypt it with `openssl enc` and a `IG_SESSION_KEY` GHA secret, or store via `actions/cache` keyed on a stable name. Without persistence: expect challenge emails / 2FA prompts within days.
- No headless browser required for instagrapi. Pure HTTPS to IG's mobile/web APIs.
- 2FA: instagrapi supports `cl.login(..., verification_code=...)` but you can't automate TOTP from a cron without storing the seed. Recommend disabling 2FA on the burner.

### Reliability signal

- Expect challenges roughly every few weeks on a fresh-IP cron. Mitigations: session reuse, low frequency (once per day, not hourly), single retry with backoff, jittered run time.
- Instagram occasionally rolls a feature flag that changes media response shape — instagrapi usually patches within days. Pin a version, watch releases.
- Consider a residential-proxy SaaS only if breakage becomes constant — for a personal site, accept eventual outages and serve stale JSON.

### Sample `instagram.json`

```json
{
  "user": "c_m_hunt",
  "fetched_at": "2026-05-09T03:14:00Z",
  "source": "instagrapi@2.5.14",
  "posts": [
    {
      "id": "3201234567890123456_1234567",
      "shortcode": "C_abc123XYZ",
      "url": "https://www.instagram.com/p/C_abc123XYZ/",
      "caption": "Caption text including #hashtags and @mentions",
      "taken_at": "2026-05-07T18:22:14Z",
      "media_type": "carousel",
      "location": {
        "name": "Lord's Cricket Ground",
        "lat": 51.5295,
        "lng": -0.1727
      },
      "media": [
        {
          "type": "image",
          "url": "https://scontent.cdninstagram.com/...jpg",
          "width": 1080,
          "height": 1350,
          "alt": "Auto-generated alt text"
        },
        {
          "type": "video",
          "url": "https://scontent.cdninstagram.com/...mp4",
          "thumbnail_url": "https://scontent.cdninstagram.com/...jpg",
          "duration_seconds": 14.2,
          "width": 1080,
          "height": 1920
        }
      ],
      "metrics": {
        "like_count": 87,
        "comment_count": 4,
        "view_count": null
      }
    }
  ]
}
```

`media_type` enum: `image` | `video` | `carousel` | `reel`. For carousels, `media[]` holds children; for single-image posts, `media[]` has one entry.

### Legal / ToS

- IG ToS forbids automated/unauthorized access. Risk: account ban (mitigated by burner). Republishing media on a personal site is generally low-risk for one's own content but is still technically derivative — link back to the original `https://www.instagram.com/p/...` URL.
- GDPR-ish: no third-party PII is being scraped beyond the named user, so this is fine.

---

## Recommended pipeline shape

```
.github/workflows/social.yml
  - cron: "17 4 * * *"   # daily, jittered minute
  - actions/cache: ig_session.json (key: "ig-session-v1")
  - node scripts/fetch-twitter.ts   --> public/data/twitter.json
  - python scripts/fetch-instagram.py > public/data/instagram.json
  - if either step fails, keep previous JSON and emit `_meta.error`
  - commit changes to data branch / deploy
```

In the SPA: read both JSON via fetch at boot, render with a "last updated X ago" badge and a fallback to the static `_meta.error` message if stale.

## Dependencies summary

| Package           | Type   | Version     | Last released | Notes                                |
| ----------------- | ------ | ----------- | ------------- | ------------------------------------ |
| rettiwt-api       | npm    | 7.0.3       | 2026-05-02    | Primary Twitter, guest mode default  |
| @the-convocation/twitter-scraper | npm | 0.22.3 | 2026-04-01 | Fallback Twitter, needs login        |
| instagrapi        | PyPI   | 2.5.14      | 2026-05-09    | Primary Instagram, shelled out       |
| instaloader       | PyPI   | 4.15.1      | 2026-03-21    | Fallback Instagram                   |

## Open questions for the user

1. Do you have (or can you create) a **burner Instagram account** that follows `c_m_hunt`? Strongly recommended over using the supplied creds directly.
2. Is 2FA enabled on the IG account whose creds were supplied? If yes, automation will be painful — consider switching to a burner without 2FA.
3. Acceptable failure mode when scraping breaks: stale-but-served JSON, or hide the section entirely? (Recommend stale-served with a "last updated" label.)
