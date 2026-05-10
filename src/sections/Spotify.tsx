import { Music, Disc3 } from 'lucide-react'
import { spotify } from '../data/spotify'
import { SectionHeader } from '../components/SectionHeader'
import { EmptyState } from '../components/EmptyState'

export function SpotifySection() {
  const { nowPlaying, topArtists, topTracks } = spotify
  const playing = nowPlaying?.track ?? null

  if (!playing && topArtists.length === 0 && topTracks.length === 0) {
    return (
      <section className="zn-section" id="spotify">
        <SectionHeader eyebrow="Side C · sound" title="Music" generatedAt={spotify.generatedAt} />
        <EmptyState message="Spotify data not yet available." />
      </section>
    )
  }

  const subtitle = nowPlaying?.isPlaying
    ? 'currently spinning · top of the rotation'
    : 'last spun · top of the rotation'

  return (
    <section className="zn-section" id="spotify">
      <SectionHeader
        eyebrow="Side C · sound"
        title="Music"
        subtitle={subtitle}
        generatedAt={spotify.generatedAt}
      />

      {playing ? (
        <div className="sp-now">
          {playing.album.imageUrl ? (
            <img src={playing.album.imageUrl} alt={`${playing.album.name} cover`} loading="eager" />
          ) : (
            <div
              aria-hidden="true"
              style={{
                width: 96,
                height: 96,
                background: 'var(--ink)',
                color: 'var(--paper)',
                border: '2px solid var(--ink)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Music size={32} />
            </div>
          )}
          <div className="sp-now-meta">
            <span className="sp-now-label">
              <Disc3 size={14} className="now-playing-spin" />
              {nowPlaying?.isPlaying ? 'Now playing' : 'Last spun'}
            </span>
            <a className="sp-now-track" href={playing.url} target="_blank" rel="noreferrer">
              {playing.name}
            </a>
            <div className="sp-now-artists">
              {playing.artists.map((a, i) => (
                <span key={a.url}>
                  {i > 0 ? ', ' : ''}
                  <a href={a.url} target="_blank" rel="noreferrer">
                    {a.name}
                  </a>
                </span>
              ))}
              {playing.album.releaseDate ? <> · {playing.album.releaseDate.slice(0, 4)}</> : null}
            </div>
          </div>
        </div>
      ) : null}

      {topArtists.length > 0 ? (
        <>
          <h3 className="sp-subhead">Top artists</h3>
          <ul className="sp-artists">
            {topArtists.map((a) => (
              <li key={a.id}>
                <a className="sp-artist" href={a.url} target="_blank" rel="noreferrer">
                  {a.imageUrl ? (
                    <img src={a.imageUrl} alt="" loading="lazy" />
                  ) : (
                    <div className="sp-artist-img-fallback" aria-hidden="true">
                      <Music size={20} />
                    </div>
                  )}
                  <span className="sp-artist-name">{a.name}</span>
                  <span className="sp-artist-genre">{a.genres[0] ?? '—'}</span>
                </a>
              </li>
            ))}
          </ul>
        </>
      ) : null}

      {topTracks.length > 0 ? (
        <>
          <h3 className="sp-subhead">Top tracks</h3>
          <ol className="sp-tracks">
            {topTracks.map((t) => (
              <li key={t.id} className="sp-track">
                {t.album.imageUrl ? (
                  <img src={t.album.imageUrl} alt="" loading="lazy" />
                ) : (
                  <div
                    aria-hidden="true"
                    style={{
                      width: 56,
                      height: 56,
                      background: 'var(--ink)',
                      color: 'var(--paper)',
                      border: '2px solid var(--ink)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <Music size={20} />
                  </div>
                )}
                <div className="sp-track-meta">
                  <a className="sp-track-name" href={t.url} target="_blank" rel="noreferrer">
                    {t.name}
                  </a>
                  <span className="sp-track-artists">
                    {t.artists.map((a, i) => (
                      <span key={a.url}>
                        {i > 0 ? ', ' : ''}
                        <a href={a.url} target="_blank" rel="noreferrer">
                          {a.name}
                        </a>
                      </span>
                    ))}
                    {t.album.releaseDate ? <> · {t.album.releaseDate.slice(0, 4)}</> : null}
                  </span>
                </div>
              </li>
            ))}
          </ol>
        </>
      ) : null}
    </section>
  )
}
