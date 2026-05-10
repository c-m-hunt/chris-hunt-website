import { Music } from 'lucide-react'
import { useMemo, useState } from 'react'
import { setlist } from '../data/setlist'
import { SectionHeader } from '../components/SectionHeader'
import { EmptyState } from '../components/EmptyState'

const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC']

const ALL = 'ALL' as const
type YearFilter = number | typeof ALL

function defaultYear(years: number[]): YearFilter {
  if (years.length === 0) return ALL
  const currentYear = new Date().getFullYear()
  return years.includes(currentYear) ? currentYear : years[0]
}

function formatGigDate(iso: string): string {
  // dates are 'YYYY-MM-DD' — parse manually to avoid TZ shifts
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso)
  if (!m) return iso
  const month = MONTHS[Number(m[2]) - 1] ?? '???'
  return `${Number(m[3])} ${month}`
}

function getYear(iso: string): number {
  const m = /^(\d{4})-/.exec(iso)
  return m ? Number(m[1]) : 0
}

export function SetlistSection() {
  const { years, yearCounts, sortedYears } = useMemo(() => {
    const counts = new Map<number, number>()
    for (const g of setlist.gigs) {
      const y = getYear(g.date)
      counts.set(y, (counts.get(y) ?? 0) + 1)
    }
    const sorted = Array.from(counts.keys()).sort((a, b) => b - a)
    return { years: sorted, yearCounts: counts, sortedYears: sorted }
  }, [])

  const [filter, setFilter] = useState<YearFilter>(() => defaultYear(sortedYears))

  const visibleGigs = useMemo(() => {
    if (filter === ALL) return setlist.gigs
    return setlist.gigs.filter((g) => getYear(g.date) === filter)
  }, [filter])

  const minYear = sortedYears[sortedYears.length - 1]
  const maxYear = sortedYears[0]
  const hasGigs = setlist.gigs.length > 0
  const fallbackMessage = setlist._meta?.message ?? 'Coming soon - waiting on API key'

  return (
    <section className="zn-section bg-ink has-bg" id="setlist">
      <span className="ripped-tape" aria-hidden="true">
        Gig Scrapbook
      </span>
      <SectionHeader
        eyebrow="Side D · live"
        title="Gigs"
        subtitle={`setlist.fm · @${setlist.username}`}
        generatedAt={setlist.generatedAt}
      />

      {!hasGigs ? (
        <EmptyState message={fallbackMessage} />
      ) : (
        <>
          <div className="gig-controls">
            <div className="gig-counter">
              <b>{setlist.totalAttended}</b> ATTENDED
              {minYear && maxYear ? ` · ${minYear}→${maxYear}` : null}
            </div>
            <div className="gig-years" role="group" aria-label="Filter gigs by year">
              <button
                type="button"
                className="gig-year-btn"
                aria-pressed={filter === ALL}
                onClick={() => setFilter(ALL)}
              >
                All<span className="ct">{setlist.gigs.length}</span>
              </button>
              {years.map((y) => (
                <button
                  key={y}
                  type="button"
                  className="gig-year-btn"
                  aria-pressed={filter === y}
                  onClick={() => setFilter(y)}
                >
                  {y}
                  <span className="ct">{yearCounts.get(y) ?? 0}</span>
                </button>
              ))}
            </div>
          </div>

          {visibleGigs.length === 0 ? (
            <EmptyState message="No gigs in that year." />
          ) : (
            <ul className="gig-list">
              {visibleGigs.map((g) => {
                const stamp = g.tour ?? g.city ?? null
                return (
                  <li key={g.id} className="gig-row">
                    {g.artistImageUrl ? (
                      <img
                        className="gig-thumb"
                        src={g.artistImageUrl}
                        alt=""
                        loading="lazy"
                      />
                    ) : (
                      <span className="gig-thumb gig-thumb-fallback" aria-hidden="true">
                        <Music size={18} />
                      </span>
                    )}
                    <div className="date">{formatGigDate(g.date)}</div>
                    <div>
                      <div className="artist">
                        <a href={g.setlistUrl} target="_blank" rel="noreferrer">
                          {g.artist}
                        </a>
                      </div>
                      <div className="venue">
                        {g.venue} · {g.city}
                      </div>
                    </div>
                    {stamp ? <span className="stamp">{stamp}</span> : null}
                  </li>
                )
              })}
            </ul>
          )}
        </>
      )}
    </section>
  )
}
