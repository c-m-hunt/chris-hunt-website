import { github } from '../data/github'
import { SectionHeader } from '../components/SectionHeader'
import { EmptyState } from '../components/EmptyState'

const LEVEL_LABELS = ['No contributions', 'Low', 'Medium', 'High', 'Very high'] as const

function dayLabel(date: string, count: number): string {
  const d = new Date(date + 'T00:00:00Z')
  const formatted = d.toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  })
  if (count === 0) return `No contributions on ${formatted}`
  return `${count} contribution${count === 1 ? '' : 's'} on ${formatted}`
}

function formatNumber(value: number | null | undefined): string {
  if (value == null) return '—'
  return value.toLocaleString()
}

export function GitHubSection() {
  const { profile, stats, languages, contributionCalendar } = github
  const sinceYear = new Date(profile.memberSince).getFullYear()
  const yearsOn = new Date().getFullYear() - sinceYear

  return (
    <section className="zn-section" id="github">
      <SectionHeader
        eyebrow="Side B · code"
        title="GitHub"
        subtitle={`@${github.username} · ${formatNumber(stats.contributionsLastYear)} commits last year · ${profile.publicRepos} public repos`}
        generatedAt={github.generatedAt}
      />

      <ul className="gh-stamps">
        <li className="gh-stamp">
          <div className="gh-stamp-label">Commits</div>
          <div className="gh-stamp-val">{formatNumber(stats.contributionsLastYear)}</div>
          <div className="gh-stamp-sub">last 12 months</div>
        </li>
        <li className="gh-stamp">
          <div className="gh-stamp-label">Repos</div>
          <div className="gh-stamp-val">{profile.publicRepos}</div>
          <div className="gh-stamp-sub">public</div>
        </li>
        <li className="gh-stamp">
          <div className="gh-stamp-label">Stars</div>
          <div className="gh-stamp-val">{stats.totalStars}</div>
          <div className="gh-stamp-sub">{stats.totalForks} forks</div>
        </li>
        <li className="gh-stamp">
          <div className="gh-stamp-label">Since</div>
          <div className="gh-stamp-val">{sinceYear}</div>
          <div className="gh-stamp-sub">{yearsOn} yrs on</div>
        </li>
      </ul>

      <div className="gh-grid">
        <article className="gh-card">
          <h3>
            Contributions
            <small>
              {formatNumber(contributionCalendar?.totalContributions ?? null)} this year
            </small>
          </h3>
          {!contributionCalendar || contributionCalendar.weeks.length === 0 ? (
            <EmptyState message="Contribution calendar unavailable." />
          ) : (
            <>
              <div
                className="gh-heatmap"
                role="img"
                aria-label={`${contributionCalendar.totalContributions} contributions in the last year`}
              >
                {contributionCalendar.weeks.map((week, wi) => (
                  <div key={wi} className="gh-heat-col">
                    {week.map((day) => (
                      <span
                        key={day.date}
                        className="gh-heat-cell"
                        data-level={day.level || undefined}
                        title={dayLabel(day.date, day.count)}
                      />
                    ))}
                  </div>
                ))}
              </div>
              <div className="gh-heat-legend" aria-hidden="true">
                <span>less</span>
                {[0, 1, 2, 3, 4].map((lvl) => (
                  <span
                    key={lvl}
                    className="gh-heat-cell"
                    data-level={lvl || undefined}
                    title={LEVEL_LABELS[lvl]}
                  />
                ))}
                <span>more</span>
              </div>
            </>
          )}
        </article>

        <article className="gh-card">
          <h3>
            Languages
            <small>by bytes</small>
          </h3>
          {languages.length === 0 ? (
            <EmptyState message="Language stats unavailable." />
          ) : (
            <div className="gh-langs">
              <div className="gh-lang-bar" role="img" aria-label="Language byte breakdown">
                {languages.map((lang) => (
                  <i
                    key={lang.name}
                    style={{
                      flexBasis: `${lang.percent}%`,
                      background: lang.color,
                    }}
                    title={`${lang.name} · ${lang.percent}%`}
                  />
                ))}
              </div>
              <ul className="gh-lang-list">
                {languages.map((lang) => (
                  <li key={lang.name}>
                    <span className="gh-lang-dot" style={{ background: lang.color }} />
                    <span>{lang.name}</span>
                    <span className="gh-lang-pct">{lang.percent.toFixed(1)}%</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </article>
      </div>

      <div className="gh-meta">
        <span>
          <strong>Member since</strong>
          {new Date(profile.memberSince).toLocaleDateString(undefined, {
            year: 'numeric',
            month: 'short',
          })}
        </span>
        <span>
          <strong>Followers</strong>
          {profile.followers} · {profile.following} following
        </span>
        {profile.location ? (
          <span>
            <strong>Location</strong>
            {profile.location}
          </span>
        ) : null}
        {profile.blog ? (
          <span>
            <strong>Blog</strong>
            <a href={profile.blog} target="_blank" rel="noreferrer">
              {profile.blog.replace(/^https?:\/\//, '')}
            </a>
          </span>
        ) : null}
      </div>
    </section>
  )
}
