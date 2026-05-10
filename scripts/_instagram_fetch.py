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
from datetime import datetime, timezone
from pathlib import Path


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
    try:
        if session_path.exists():
            # Reuse an established session if we have one cached
            cl.load_settings(str(session_path))
            if username and password:
                cl.login(username, password)
        elif sessionid:
            # First-time bootstrap from a browser-extracted sessionid
            cl.login_by_sessionid(sessionid)
        else:
            cl.login(username, password)
        cl.dump_settings(str(session_path))
    except Exception as exc:  # noqa: BLE001
        print(f"login failed: {exc}", file=sys.stderr)
        return 1

    try:
        user_id = cl.user_id_from_username(target)
        medias = cl.user_medias(user_id, amount=limit)
    except Exception as exc:  # noqa: BLE001
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
