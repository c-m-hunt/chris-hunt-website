import { cricket } from '../data/cricket'
import { SectionHeader } from '../components/SectionHeader'
import { EmptyState } from '../components/EmptyState'

function dashIfEmpty(value: number | null | undefined): string {
  if (value == null) return '—'
  if (value === 0) return '0'
  return String(value)
}

function bestBowling(wickets: number, runs: number): string {
  if (!wickets) return '—'
  return `${wickets}-${runs}`
}

function formatAverage(value: number | null): string {
  return value == null ? 'N/A' : value.toFixed(2)
}

export function CricketSection() {
  const { career, seasons, club, playerName, playerId } = cricket
  const hasSeasons = seasons.length > 0
  const debutSeason = seasons.length > 0 ? seasons[seasons.length - 1].year : null

  return (
    <section className="zn-section bg-yellow has-bg" id="cricket">
      <SectionHeader
        eyebrow="Side E · whites"
        title="Cricket"
        subtitle={`${playerName} · player #${playerId} · ${club.name}`}
        generatedAt={cricket.generatedAt}
      />

      <ul className="cr-stamps">
        <li className="cr-stamp">
          <div className="cr-stamp-label">Best bowling</div>
          <div className="cr-stamp-val">
            {bestBowling(career.bowling.bestBowling.wickets, career.bowling.bestBowling.runs)}
          </div>
          <div className="cr-stamp-sub">
            {dashIfEmpty(career.bowling.overs)} ov · {dashIfEmpty(career.bowling.maidens)} mdns
          </div>
        </li>
        <li className="cr-stamp">
          <div className="cr-stamp-label">Wickets</div>
          <div className="cr-stamp-val">{dashIfEmpty(career.bowling.wickets)}</div>
          <div className="cr-stamp-sub">
            avg {career.bowling.average ? career.bowling.average.toFixed(2) : '—'} · econ{' '}
            {career.bowling.economy ? career.bowling.economy.toFixed(2) : '—'}
          </div>
        </li>
        <li className="cr-stamp">
          <div className="cr-stamp-label">Bat HS</div>
          <div className="cr-stamp-val">
            {dashIfEmpty(career.batting.highScore)}
            {career.batting.highScoreNotOut ? '*' : ''}
          </div>
          <div className="cr-stamp-sub">
            SR {career.batting.strikeRate ? career.batting.strikeRate.toFixed(2) : '—'}
          </div>
        </li>
        <li className="cr-stamp">
          <div className="cr-stamp-label">Matches</div>
          <div className="cr-stamp-val">{dashIfEmpty(career.batting.matches)}</div>
          <div className="cr-stamp-sub">debut: {debutSeason ?? '—'}</div>
        </li>
      </ul>

      {!hasSeasons ? (
        <EmptyState message="No season data yet." />
      ) : (
        <div className="cr-table-wrap">
          <div className="cr-table-title">
            <span>By season</span>
            <small>play-cricket.com</small>
          </div>
          <table className="cr-table">
            <thead>
              <tr>
                <th rowSpan={2}>Season</th>
                <th rowSpan={2}>Mat</th>
                <th colSpan={5}>Bowling</th>
                <th colSpan={6}>Batting</th>
              </tr>
              <tr>
                <th className="col-divider">Overs</th>
                <th>Wkts</th>
                <th>Avg</th>
                <th>Econ</th>
                <th>Best</th>
                <th className="col-divider">Inn</th>
                <th>NO</th>
                <th>Runs</th>
                <th>HS</th>
                <th>Avg</th>
                <th>50s</th>
              </tr>
            </thead>
            <tbody>
              {seasons.map((s) => (
                <tr key={s.year}>
                  <td>{s.year}</td>
                  <td>{s.batting.matches}</td>
                  <td className="col-divider">{s.bowling.overs}</td>
                  <td>{s.bowling.wickets}</td>
                  <td>{formatAverage(s.bowling.average)}</td>
                  <td>{s.bowling.economy.toFixed(2)}</td>
                  <td>{bestBowling(s.bowling.bestBowling.wickets, s.bowling.bestBowling.runs)}</td>
                  <td className="col-divider">{s.batting.innings}</td>
                  <td>{s.batting.notOuts}</td>
                  <td>{s.batting.runs}</td>
                  <td>
                    {s.batting.highScore}
                    {s.batting.highScoreNotOut ? '*' : ''}
                  </td>
                  <td>{formatAverage(s.batting.average)}</td>
                  <td>{s.batting.fifties}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}
