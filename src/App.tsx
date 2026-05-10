import { Hero } from './sections/Hero'
import { GitHubSection } from './sections/GitHub'
import { SocialSection } from './sections/Social'
import { SpotifySection } from './sections/Spotify'
import { SetlistSection } from './sections/Setlist'
import { CricketSection } from './sections/Cricket'
import { ErrorBoundary } from './components/ErrorBoundary'
import { github } from './data/github'
import { setlist } from './data/setlist'
import { untappd } from './data/untappd'
import { spotify } from './data/spotify'

const NAV = [
  { href: '#top', label: 'Top' },
  { href: '#github', label: 'GitHub' },
  { href: '#social', label: 'Social' },
  { href: '#spotify', label: 'Music' },
  { href: '#setlist', label: 'Gigs' },
  { href: '#cricket', label: 'Cricket' },
]

function fmt(n: number | null | undefined): string {
  if (n == null) return '—'
  return n.toLocaleString()
}

function Ticker() {
  const commits = github.stats.contributionsLastYear
  const gigs = setlist.totalAttended
  const checkins = untappd.lifetime?.totalCheckins ?? null
  const uniqueBeers = untappd.lifetime?.uniqueBeers ?? null
  const topArtist = spotify.topArtists[0]?.name ?? null

  // Build phrases, repeated twice so the marquee never has dead space.
  const phrases: string[] = [
    `${fmt(commits)} commits`,
    `${fmt(gigs)} gigs`,
    `${fmt(checkins)} check-ins`,
    `${fmt(uniqueBeers)} unique beers`,
    topArtist ? `now spinning ${topArtist}` : 'spinning the wheel',
    'made in london',
  ]
  const doubled = [...phrases, ...phrases]

  return (
    <div className="zn-ticker" aria-hidden="true">
      <div className="zn-ticker-track">
        {doubled.map((p, i) => (
          <span key={i}>{p}</span>
        ))}
      </div>
    </div>
  )
}

function App() {
  const year = new Date().getFullYear()
  return (
    <>
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      <nav className="zn-nav" aria-label="Primary">
        <a href="#top" className="brand">
          chris-hunt.net
        </a>
        <ul>
          {NAV.map((item) => (
            <li key={item.href}>
              <a href={item.href}>{item.label}</a>
            </li>
          ))}
        </ul>
      </nav>
      <main id="main">
        <ErrorBoundary sectionName="Hero">
          <Hero />
        </ErrorBoundary>
        <ErrorBoundary sectionName="GitHub">
          <GitHubSection />
        </ErrorBoundary>
        <ErrorBoundary sectionName="Social">
          <SocialSection />
        </ErrorBoundary>
        <Ticker />
        <ErrorBoundary sectionName="Spotify">
          <SpotifySection />
        </ErrorBoundary>
        <ErrorBoundary sectionName="Setlist">
          <SetlistSection />
        </ErrorBoundary>
        <ErrorBoundary sectionName="Cricket">
          <CricketSection />
        </ErrorBoundary>
      </main>
      <footer className="zn-foot">
        <div className="zn-foot-grid">
          <h2>
            Chris <span>Hunt</span>
          </h2>
          <dl className="zn-foot-meta">
            <dt>elsewhere</dt>
            <dd>
              <a href="https://github.com/c-m-hunt" target="_blank" rel="noreferrer">
                github.com/c-m-hunt
              </a>
            </dd>
            <dd>
              <a href="https://x.com/c_m_hunt" target="_blank" rel="noreferrer">
                x.com/c_m_hunt
              </a>
            </dd>
            <dd>
              <a href="https://www.instagram.com/c_m_hunt/" target="_blank" rel="noreferrer">
                instagram.com/c_m_hunt
              </a>
            </dd>
            <dd>
              <a href="https://untappd.com/user/cmhunt" target="_blank" rel="noreferrer">
                untappd.com/user/cmhunt
              </a>
            </dd>
            <dt>set</dt>
            <dd>London · UK</dd>
          </dl>
        </div>
        <div className="zn-foot-credit">
          <span>© {year} Chris Hunt</span>
          <span>made with vite + a lot of pink</span>
        </div>
      </footer>
    </>
  )
}

export default App
