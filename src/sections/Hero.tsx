import { Github, Twitter, Instagram, Beer, Music } from 'lucide-react'
import { github } from '../data/github'
import { setlist } from '../data/setlist'
import { spotify } from '../data/spotify'
import { untappd } from '../data/untappd'

const TWITTER_HANDLE = 'c_m_hunt'
const INSTAGRAM_HANDLE = 'c_m_hunt'
const SETLIST_PROFILE = 'https://www.setlist.fm/user/cmhunt'

function formatNumber(value: number | null | undefined): string {
  if (value == null) return '—'
  return value.toLocaleString()
}

export function Hero() {
  const { profile, stats } = github

  // Derive a punchy two-line tagline from bio + location.
  // The bio in the data has \r\n chars; collapse and trim.
  const bio = profile.bio.replace(/\r?\n+/g, ' ').trim()

  const commits = stats.contributionsLastYear
  const gigs = setlist.totalAttended
  const beers = untappd.lifetime?.totalCheckins ?? null
  const topArtist = spotify.topArtists[0]?.name ?? '—'

  return (
    <section className="zn-section hero" id="top">
      <div className="hero-text">
        <h1 className="hero-name">
          Chris <span>Hunt</span>
        </h1>
        <p className="hero-tagline">
          engineer at <mark>Hudl</mark>, applied ML.
          <br />
          based in <strong>{profile.location ?? 'the UK'}</strong>.
        </p>
        <p className="hero-tagline" style={{ marginTop: 12 }}>
          {bio}
        </p>

        <ul className="hero-stickers" aria-label="Social links">
          <li>
            <a className="hs" href={profile.profileUrl} target="_blank" rel="noreferrer">
              <Github size={16} /> GitHub
            </a>
          </li>
          <li>
            <a
              className="hs"
              href={`https://x.com/${TWITTER_HANDLE}`}
              target="_blank"
              rel="noreferrer"
            >
              <Twitter size={16} /> X
            </a>
          </li>
          <li>
            <a
              className="hs"
              href={`https://www.instagram.com/${INSTAGRAM_HANDLE}/`}
              target="_blank"
              rel="noreferrer"
            >
              <Instagram size={16} /> Instagram
            </a>
          </li>
          <li>
            <a className="hs" href={untappd.profileUrl} target="_blank" rel="noreferrer">
              <Beer size={16} /> Untappd
            </a>
          </li>
          <li>
            <a className="hs" href={SETLIST_PROFILE} target="_blank" rel="noreferrer">
              <Music size={16} /> Setlists
            </a>
          </li>
        </ul>

        <ul className="hero-strip" aria-label="Stats at a glance">
          <li className="hero-strip-cell">
            <div className="hero-strip-label">Commits / yr</div>
            <div className="hero-strip-val">{formatNumber(commits)}</div>
            <div className="hero-strip-sub">last 12 months</div>
          </li>
          <li className="hero-strip-cell">
            <div className="hero-strip-label">Gigs</div>
            <div className="hero-strip-val">{formatNumber(gigs)}</div>
            <div className="hero-strip-sub">attended</div>
          </li>
          <li className="hero-strip-cell">
            <div className="hero-strip-label">Check-ins</div>
            <div className="hero-strip-val">{formatNumber(beers)}</div>
            <div className="hero-strip-sub">lifetime untappd</div>
          </li>
          <li className="hero-strip-cell">
            <div className="hero-strip-label">Top artist</div>
            <div
              className="hero-strip-val"
              style={{ fontSize: 'clamp(22px, 3vw, 32px)', lineHeight: 1.05 }}
            >
              {topArtist}
            </div>
            <div className="hero-strip-sub">on rotation</div>
          </li>
        </ul>
      </div>

      <figure className="hero-photo">
        <span className="hero-photo-tape" aria-hidden="true" />
        <img src={profile.avatarUrl} alt={`${profile.name} avatar`} loading="eager" />
        <figcaption className="hero-photo-cap">
          @{github.username} · {new Date(profile.memberSince).getFullYear()}→
        </figcaption>
      </figure>
    </section>
  )
}
