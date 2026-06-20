"""Fetch Instagram posts for INSTAGRAM_USERNAME via instagrapi and print JSON
to stdout. The Node collector (`scripts/collect-instagram.ts`) shells out to
this script when INSTAGRAM_ENABLED=true.

Requirements:
    python3 -m pip install instagrapi

Environment (one of these auth paths is required):
    INSTAGRAM_SESSIONID           (preferred) the `sessionid` cookie from a
                                    logged-in browser session. Avoids triggering
                                    IG's IP/password challenge.
    INSTAGRAM_USERNAME / _PASSWORD (fallback) full login flow. Risky from new IPs.

Other env:
    INSTAGRAM_TARGET_USERNAME     (optional) account whose posts to fetch; defaults
                                    to INSTAGRAM_USERNAME
    INSTAGRAM_LIMIT               (optional) max posts to fetch (default 12)
    IG_SESSION_FILE               (optional) path to persisted session JSON
                                    (default: .cache/instagram/session.json)
"""

from __future__ import annotations

import json
import os
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

# Exit code meaning "couldn't fetch because Instagram is rate-limiting us, but
# nothing is actually broken". The Node collector treats this as a soft skip:
# it keeps the existing instagram.json and exits 0 so the workflow doesn't page
# on an unavoidable, transient 429 from a shared CI IP.
RATE_LIMITED_EXIT = 3

# Backoff (seconds) between in-run retries when a fetch hits a 429. Modest on
# purpose — IG rate-limits a flagged IP for minutes, so if these don't clear it
# we soft-skip rather than burn the whole step budget.
RATE_LIMIT_BACKOFFS = [20, 40]


def iso(dt) -> str:
    if dt is None:
        return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")
    if isinstance(dt, datetime):
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        return dt.isoformat().replace("+00:00", "Z")
    return str(dt)


def media_type_label(media_type: int, product_type: str | None) -> str:
    # instagrapi: 1=image, 2=video, 8=carousel
    if media_type == 8:
        return "carousel"
    if media_type == 2:
        if product_type and product_type.lower() == "clips":
            return "reel"
        return "video"
    return "image"


def media_entries(m) -> list[dict]:
    # Carousel -> walk resources; otherwise produce a single entry
    if m.media_type == 8 and getattr(m, "resources", None):
        out = []
        for r in m.resources:
            if r.media_type == 2:
                out.append(
                    {
                        "type": "video",
                        "url": str(r.video_url) if r.video_url else "",
                        "thumbnail_url": str(r.thumbnail_url)
                        if r.thumbnail_url
                        else "",
                        "duration_seconds": float(getattr(r, "video_duration", 0) or 0),
                        "width": 0,
                        "height": 0,
                    }
                )
            else:
                out.append(
                    {
                        "type": "image",
                        "url": str(r.thumbnail_url) if r.thumbnail_url else "",
                        "width": 0,
                        "height": 0,
                        "alt": None,
                    }
                )
        return out
    if m.media_type == 2:
        return [
            {
                "type": "video",
                "url": str(m.video_url) if m.video_url else "",
                "thumbnail_url": str(m.thumbnail_url) if m.thumbnail_url else "",
                "duration_seconds": float(getattr(m, "video_duration", 0) or 0),
                "width": 0,
                "height": 0,
            }
        ]
    return [
        {
            "type": "image",
            "url": str(m.thumbnail_url) if m.thumbnail_url else "",
            "width": 0,
            "height": 0,
            "alt": None,
        }
    ]


def _bootstrap(cl, sessionid, username, password) -> None:
    """Fresh auth from sessionid (preferred) or username/password."""
    if sessionid:
        cl.login_by_sessionid(sessionid)
    else:
        cl.login(username, password)


def _is_stale_session_error(exc: Exception) -> bool:
    """Detect IG telling us the cached session is no longer valid."""
    s = f"{type(exc).__name__}: {exc}".lower()
    return any(marker in s for marker in ("login_required", "loginrequired"))


def _is_rate_limited_error(exc: Exception) -> bool:
    """Detect IG throttling us (429 / "please wait"). Distinct from a stale
    session: re-logging-in under a throttle just digs the hole deeper, so the
    caller backs off and soft-skips instead of re-bootstrapping."""
    s = f"{type(exc).__name__}: {exc}".lower()
    return any(
        marker in s
        for marker in ("429", "too many requests", "rate limit", "please wait a few minutes")
    )


def main() -> int:
    try:
        from instagrapi import Client  # type: ignore[import-not-found]
    except ImportError:
        print(
            "instagrapi is not installed. Run: python3 -m pip install instagrapi",
            file=sys.stderr,
        )
        return 2

    sessionid = os.environ.get("INSTAGRAM_SESSIONID")
    username = os.environ.get("INSTAGRAM_USERNAME")
    password = os.environ.get("INSTAGRAM_PASSWORD")
    if not sessionid and (not username or not password):
        print(
            "Need INSTAGRAM_SESSIONID, or both INSTAGRAM_USERNAME and INSTAGRAM_PASSWORD",
            file=sys.stderr,
        )
        return 2

    target = os.environ.get("INSTAGRAM_TARGET_USERNAME") or username
    if not target:
        print("INSTAGRAM_TARGET_USERNAME is required when using sessionid auth", file=sys.stderr)
        return 2
    limit = int(os.environ.get("INSTAGRAM_LIMIT", "12"))
    session_path = Path(
        os.environ.get("IG_SESSION_FILE", ".cache/instagram/session.json")
    )
    session_path.parent.mkdir(parents=True, exist_ok=True)

    cl = Client()
    # Space out requests a little so we look less like a bot and trip IG's 429
    # throttle less often.
    cl.delay_range = [1, 3]
    used_fresh_login = False
    try:
        if session_path.exists():
            cl.load_settings(str(session_path))
        else:
            _bootstrap(cl, sessionid, username, password)
            used_fresh_login = True
        cl.dump_settings(str(session_path))
    except Exception as exc:  # noqa: BLE001
        print(f"login failed: {exc}", file=sys.stderr)
        return 1

    def fetch():
        user_id = cl.user_id_from_username(target)
        return cl.user_medias(user_id, amount=limit)

    def fetch_with_retry():
        """Fetch, retrying transient 429s with backoff. Raises the last error
        if it isn't a rate-limit, or after the backoffs are exhausted."""
        for attempt in range(len(RATE_LIMIT_BACKOFFS) + 1):
            try:
                return fetch()
            except Exception as exc:  # noqa: BLE001
                if _is_rate_limited_error(exc) and attempt < len(RATE_LIMIT_BACKOFFS):
                    wait = RATE_LIMIT_BACKOFFS[attempt]
                    print(
                        f"instagram rate limited ({exc}); "
                        f"retry {attempt + 1}/{len(RATE_LIMIT_BACKOFFS)} in {wait}s",
                        file=sys.stderr,
                    )
                    time.sleep(wait)
                    continue
                raise

    try:
        medias = fetch_with_retry()
    except Exception as exc:  # noqa: BLE001
        # Cached session is stale (sessionid was rotated or IG invalidated it).
        # Burn the cache, re-bootstrap from the configured sessionid, and retry
        # once. Without this the workflow stays broken until the cache key bumps
        # even after the user updates INSTAGRAM_SESSIONID.
        if _is_stale_session_error(exc) and not used_fresh_login and (sessionid or (username and password)):
            print(f"cached session invalid ({exc}); re-bootstrapping", file=sys.stderr)
            try:
                session_path.unlink(missing_ok=True)
            except OSError:
                pass
            cl = Client()
            cl.delay_range = [1, 3]
            try:
                _bootstrap(cl, sessionid, username, password)
                cl.dump_settings(str(session_path))
                medias = fetch_with_retry()
            except Exception as exc2:  # noqa: BLE001
                if _is_rate_limited_error(exc2):
                    print(
                        f"instagram rate limited after re-bootstrap ({exc2}); "
                        "preserving existing data",
                        file=sys.stderr,
                    )
                    return RATE_LIMITED_EXIT
                print(f"fetch failed after re-bootstrap: {exc2}", file=sys.stderr)
                return 1
        elif _is_rate_limited_error(exc):
            # Unavoidable transient throttle (usually a shared CI IP). Don't fail
            # the job — let the Node collector keep the existing posts.
            print(
                f"instagram rate limited after retries ({exc}); preserving existing data",
                file=sys.stderr,
            )
            return RATE_LIMITED_EXIT
        else:
            print(f"fetch failed: {exc}", file=sys.stderr)
            return 1

    posts = []
    for m in medias:
        location = None
        loc = getattr(m, "location", None)
        if loc:
            location = {
                "name": getattr(loc, "name", "") or "",
                "lat": float(getattr(loc, "lat", 0) or 0),
                "lng": float(getattr(loc, "lng", 0) or 0),
            }
        view_count = getattr(m, "view_count", None) or getattr(m, "play_count", None)
        posts.append(
            {
                "id": str(m.pk),
                "shortcode": str(m.code),
                "url": f"https://www.instagram.com/p/{m.code}/",
                "caption": (m.caption_text or "").strip(),
                "taken_at": iso(getattr(m, "taken_at", None)),
                "media_type": media_type_label(m.media_type, getattr(m, "product_type", None)),
                "location": location,
                "media": media_entries(m),
                "metrics": {
                    "like_count": int(m.like_count or 0),
                    "comment_count": int(m.comment_count or 0),
                    "view_count": int(view_count) if view_count else None,
                },
            }
        )

    out = {
        "user": target,
        "fetched_at": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
        "source": "instagrapi",
        "generatedAt": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
        "posts": posts,
    }
    json.dump(out, sys.stdout, default=str)
    return 0


if __name__ == "__main__":
    sys.exit(main())
