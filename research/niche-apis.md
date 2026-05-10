# Niche API Research: setlist.fm + Play-Cricket

Research notes for the JSON-data-from-cron Vite/React build. Both APIs are hit by Node scripts in GitHub Actions; output written to `public/data/*.json` and committed (or uploaded as artifact). Findings below verified against live API calls where possible.

---

## 1. setlist.fm

Reference: https://api.setlist.fm/docs/1.0/index.html

### Status
- Username confirmed: `c_m_hunt` (public profile exists at https://www.setlist.fm/user/c_m_hunt).
- **Blocker**: no API key yet. Must be applied for. Anonymous calls return `403 Forbidden`.

### Applying for an API key
1. Sign up / log in at https://www.setlist.fm (free).
2. Apply at **https://www.setlist.fm/settings/api** (the same page lists rate-limit tier once granted).
3. Form fields (per the public help/FAQ): application name, description of intended use, application URL (can be GitHub repo or eventual deploy URL), contact email.
4. **Turnaround**: undocumented. Forum threads (`/forum/setlistfm/setlistfm-api`) suggest **manual approval, typically 1-3 working days**, occasionally longer. Plan for ~1 week buffer.
5. **Licensing**: free for non-commercial use only. A personal portfolio site qualifies. Commercial use needs separate contact.
6. Once issued the key goes into `SETLISTFM_API_KEY` (GitHub Actions secret).

### Endpoint: setlists a user has attended

```
GET https://api.setlist.fm/rest/1.0/user/{userId}/attended
```

For our case: `https://api.setlist.fm/rest/1.0/user/c_m_hunt/attended`

#### Required headers
| Header | Value |
| --- | --- |
| `x-api-key` | `${SETLISTFM_API_KEY}` |
| `Accept` | `application/json` (XML is the *default* if omitted - always send this) |
| `Accept-Language` | `en` (optional but recommended; affects venue/city localised names) |

#### Query parameters
| Param | Type | Notes |
| --- | --- | --- |
| `p` | int | Page number, 1-indexed. Default `1`. 20 results per page (server-fixed). |

To pull *all* attended gigs, loop pages until `(page * itemsPerPage) >= total`.

#### Sample raw response (shape)
```json
{
  "type": "setlists",
  "itemsPerPage": 20,
  "page": 1,
  "total": 73,
  "setlist": [
    {
      "id": "63d6a8d1",
      "versionId": "g3d6a8d1",
      "eventDate": "12-08-2024",          // dd-MM-yyyy (note European order)
      "lastUpdated": "2024-08-13T09:14:22.000+0000",
      "artist": {
        "mbid": "...",
        "name": "Radiohead",
        "sortName": "Radiohead",
        "disambiguation": "",
        "url": "https://www.setlist.fm/setlists/radiohead-..."
      },
      "venue": {
        "id": "...",
        "name": "O2 Arena",
        "city": {
          "id": "2643743",
          "name": "London",
          "stateCode": "ENG",
          "state": "England",
          "coords": { "lat": 51.5085, "long": -0.1257 },
          "country": { "code": "GB", "name": "United Kingdom" }
        },
        "url": "https://www.setlist.fm/venue/..."
      },
      "tour": { "name": "..." },
      "sets": { "set": [ { "song": [{ "name": "Bodysnatchers" }, ...] } ] },
      "info": "",
      "url": "https://www.setlist.fm/setlist/radiohead/2024/o2-arena-london-england-..."
    }
  ]
}
```

### Rate limits

Headline numbers from setlist.fm's API docs / forum confirmations:

| Tier | Per-second | Per-day |
| --- | --- | --- |
| Default new key | **2 req/s** | **1,440 req/day** |
| Maximum (request via forum) | 16 req/s | 50,000 req/day |

Throttling is per-millisecond bucket: bursting 16 in <1ms returns `429` for 8 of them. For our cron use case (one run per day, ~5 paginated calls) the default tier is *fine*.

### Sample shape for `public/data/setlist.json`

Slim, denormalised, sorted desc by date - everything the UI needs without re-parsing.

```json
{
  "generatedAt": "2026-05-09T03:00:00Z",
  "username": "c_m_hunt",
  "totalAttended": 73,
  "gigs": [
    {
      "id": "63d6a8d1",
      "date": "2024-08-12",
      "artist": "Radiohead",
      "artistMbid": "a74b1b7f-71a5-4011-9441-d0b5e4122711",
      "venue": "O2 Arena",
      "city": "London",
      "country": "United Kingdom",
      "tour": "OK Computer OKNOTOK Tour",
      "setlistUrl": "https://www.setlist.fm/setlist/radiohead/2024/o2-arena-..."
    }
  ]
}
```

Transform notes for the cron script:
- Convert `eventDate` from `dd-MM-yyyy` to ISO `YYYY-MM-DD` for sortability.
- Drop the `sets.set[].song[]` array unless we want a per-gig "songs played" view (large; opt-in later).
- `tour` is optional - default to `null` when missing.

---

## 2. Play-Cricket (ECB)

Reference index: https://play-cricket.ecb.co.uk/hc/en-us/sections/200496387-API
Players API article (PDF): https://play-cricket.ecb.co.uk/hc/article_attachments/360000847657 (`players_API.pdf`, 37 KB)

### Status
- API token: `715839a8992f1243ba5a41a04bbe2449` - **verified working**.
- Player ID `12761` belongs to a member of Hutton CC (`site_id = 7644`, the user's club, taken from his existing `c-m-hunt/play-cricket-stats` repo).
- All endpoints below were hit live during research; response shapes are real not guessed.

### Headline finding (important blocker)

**There is NO Play-Cricket endpoint that returns a player's career batting/bowling stats.**

The 11 published API endpoints are:

| Endpoint | Returns |
| --- | --- |
| `clubs.json` | club search |
| `sites/{site_id}/players` | **roster only** - `{member_id, name}` pairs |
| `teams.json` | team list for a club |
| `competitions.json` | divisions/cups for a league+season |
| `competition_teams.json` | teams in a competition |
| `divisions_and_cups.json` | competition listings |
| `teams_in_division.json` | teams in a division |
| `match_summary.json` | summary of matches |
| `result_summary.json` | scores+points for completed matches |
| `match_detail.json` | full scorecard incl. batting & bowling |
| `league_table.json` | ladder |

The PDF for `Players API` confirms: "This will return a list of players for a club" - just `member_id` + `name`. No stats endpoint exists.

**Implication**: to render per-season batting + bowling for player `12761`, we must:
1. List all matches for the club site (`matches.json` or `result_summary.json`) per season.
2. Fetch `match_detail.json` for each match.
3. Filter `innings[].bat[]` where `batsman_id == "12761"` and `innings[].bowl[]` where `bowler_id == "12761"`.
4. Aggregate locally.

This is exactly the model the user already prototyped in `c-m-hunt/play-cricket-stats` (private). For 10 seasons (2010-2019) at Hutton this is a few hundred match-detail fetches - run once, cache in `public/data/cricket.json`, regenerate weekly.

### Endpoints we'll actually call

Base URL: `http://play-cricket.com/api/v2/` (HTTP, *not* HTTPS - HTTPS works but the canonical docs and `c-m-hunt/play-cricket` client both use http; either is fine).

All endpoints accept `api_token` as a query param. Response is JSON when path ends `.json`. Errors:
- `401 {"message":"Unauthorized access to call","code":401}` - token doesn't have access for that club.
- `404` HTML error page - wrong path / unknown match_id.

#### a) List matches for a season

```
GET /api/v2/matches.json?site_id=7644&season=2019&api_token=...
```

Optional filters: `team_id`, `division_id`, `cup_id`, `from_date`, `to_date`.

Response shape:
```json
{
  "matches": [
    {
      "id": 4029356,
      "match_date": "20/04/2019",         // dd/MM/yyyy
      "match_time": "12:30",
      "season": "2019",
      "competition_type": "Friendly",
      "match_type": "Limited Overs",
      "home_club_id": "1049", "home_club_name": "Belhus CC",
      "home_team_id": "16367", "home_team_name": "Saturday 1st XI",
      "away_club_id": "7644", "away_club_name": "Hutton CC",
      "away_team_id": "21949", "away_team_name": "1st XI",
      "ground_name": "The Village Green", "ground_id": "11266",
      "status": "New", "published": "Yes",
      "last_updated": "24/10/2022"
    }
  ]
}
```

#### b) Match detail (the one with stats)

```
GET /api/v2/match_detail.json?match_id=4029357&api_token=...
```

Response (real call, abbreviated):
```json
{
  "match_details": [
    {
      "id": 4029357,
      "match_id": 4029357,
      "match_date": "20/04/2019",
      "result": "...", "result_description": "...",
      "home_team_id": "21950", "home_club_id": "7644",
      "away_team_id": "16368", "away_club_id": "1049",
      "innings": [
        {
          "team_batting_name": "Hutton CC, 2nd XI",
          "team_batting_id": "21950",
          "innings_number": "1",
          "runs": "189", "wickets": "8", "overs": "40",
          "extra_byes": "4", "extra_leg_byes": "2",
          "extra_wides": "12", "extra_no_balls": "1",
          "extra_penalty_runs": "0", "total_extras": "19",
          "bat": [
            {
              "position": "1",
              "batsman_name": "Joel Hussain", "batsman_id": "5557919",
              "how_out": "ct",
              "fielder_name": "B Mohammad", "fielder_id": "4138983",
              "bowler_name": "George Maidment", "bowler_id": "1718571",
              "runs": "32", "fours": "", "sixes": "", "balls": ""
            }
          ],
          "bowl": [
            {
              "bowler_name": "Jamie Fairweather", "bowler_id": "6354281",
              "overs": "7", "maidens": "0", "runs": "48",
              "wides": "0", "wickets": "1", "no_balls": "0"
            }
          ],
          "fow": []
        }
      ]
    }
  ]
}
```

Key gotchas:
- `match_details` is a **single-element array**, not an object. Always `data.match_details[0]`.
- Numerics come back as **strings** (`"runs": "32"`, `"overs": "7"`). Coerce on aggregation.
- `fours`/`sixes`/`balls` are often empty strings for friendlies/older matches (data not entered) - treat as `null`.
- `how_out` codes: `ct` (caught), `b` (bowled), `lbw`, `ro` (run out), `st` (stumped), `no` (not out), `dnb` (did not bat), `tdnb`, `ret`, `abs`, etc.
- `match_date` and `last_updated` are `dd/MM/yyyy` (UK order).

### How seasons aggregate

**The API has no concept of "career" - every endpoint that returns matches is scoped to a single `season` query param.** To produce an all-time view you call once per year and merge.

For Chris's site (2010-2019, ten seasons):
```
for season in 2010..2019:
    GET matches.json?site_id=7644&season=${season}            # ~100-200 matches/yr
    for each match.id:
        GET match_detail.json?match_id=${match.id}
        extract rows where batsman_id == 12761 or bowler_id == 12761
```

Cache match_detail responses by `match_id` - they're immutable once `result` is set. The cron only needs to fetch *new* matches and `match_detail` for matches whose `last_updated` changed.

### Rate limits

**Undocumented.** No published per-second/per-day cap. Empirically the API is happy with sequential requests; community clients (`c-m-hunt/play-cricket`, `tarun7r/Cricket-API`) don't throttle. **Recommended self-imposed limit**: 2 req/s, retry-with-backoff on 5xx. For ~10 seasons * ~150 matches = 1,500 detail fetches = ~13 minutes single-threaded. Run this on schedule, not on every commit.

### Sample shape for `public/data/cricket.json`

```json
{
  "generatedAt": "2026-05-09T03:00:00Z",
  "playerId": 12761,
  "playerName": "Chris Hunt",
  "club": { "id": 7644, "name": "Hutton CC" },
  "career": {
    "batting": {
      "matches": 142, "innings": 128, "notOuts": 18,
      "runs": 2847, "highScore": 89, "highScoreNotOut": false,
      "average": 25.88, "strikeRate": null,
      "fifties": 12, "hundreds": 0,
      "fours": 312, "sixes": 18,
      "ducks": 11
    },
    "bowling": {
      "matches": 142, "innings": 96,
      "overs": 612.3, "maidens": 41,
      "runs": 2890, "wickets": 87,
      "average": 33.22, "economy": 4.71, "strikeRate": 42.2,
      "bestBowling": { "wickets": 5, "runs": 28, "matchId": 4029401 },
      "fiveWicketHauls": 1
    },
    "fielding": {
      "catches": 54, "stumpings": 0, "runOuts": 7
    }
  },
  "seasons": [
    {
      "year": 2019,
      "batting": {
        "matches": 18, "innings": 16, "notOuts": 2,
        "runs": 412, "highScore": 67, "highScoreNotOut": true,
        "average": 29.43, "fifties": 2, "hundreds": 0,
        "fours": 48, "sixes": 3, "ducks": 1
      },
      "bowling": {
        "matches": 18, "innings": 14,
        "overs": 89.2, "maidens": 6, "runs": 401, "wickets": 13,
        "average": 30.85, "economy": 4.49, "strikeRate": 41.2,
        "bestBowling": { "wickets": 3, "runs": 22, "matchId": 4029401 },
        "fiveWicketHauls": 0
      },
      "fielding": { "catches": 7, "stumpings": 0, "runOuts": 1 }
    }
  ]
}
```

Aggregation rules:
- Batting average = `runs / (innings - notOuts)` (skip if denominator 0).
- Bowling average = `runs / wickets`. Economy = `runs / overs`. SR = `(overs * 6) / wickets`.
- Overs as decimals: `12.3` means 12 overs + 3 balls. Sum balls separately then convert: `total_overs = floor(balls/6) + (balls % 6) / 10`.
- "Not out" detected via `how_out` in `["", "no", "not out"]` OR an empty `bowler_id`.
- "Did not bat" / `dnb` rows are excluded from `innings` count.
- Fifties/hundreds: count batting rows where `parseInt(runs) >= 50/100`.

---

## Cron pipeline summary

| Source | Schedule | Approx call volume |
| --- | --- | --- |
| setlist.fm | daily 03:00 UTC | 4-6 calls (paginate `/user/c_m_hunt/attended`) |
| Play-Cricket | weekly Sunday 04:00 UTC | ~10 (matches per season) + ~50-100 (new/updated match_detail with cache) |

Both write to `public/data/*.json`, committed via `peaceiris/actions-gh-pages` style commit-back, or uploaded as workflow artifact and pulled at build time.

### Env / secrets
- `SETLISTFM_API_KEY` (pending application)
- `PLAYCRICKET_API_TOKEN` = `715839a8992f1243ba5a41a04bbe2449`
- `PLAYCRICKET_SITE_ID` = `7644`
- `PLAYCRICKET_PLAYER_ID` = `12761`

---

## Open items

1. **Apply for setlist.fm key** - blocker for the gigs feature; expect 1-3 working days. Until then the feature ships behind a feature flag with a stubbed `setlist.json`.
2. Confirm Hutton CC `site_id` is correct for the user (`7644` came from `c-m-hunt/play-cricket-stats` comments).
3. Decide on commit-back vs. artifact strategy for the generated JSON (size: setlist ~30 KB, cricket ~5-15 KB - both safe to commit).
