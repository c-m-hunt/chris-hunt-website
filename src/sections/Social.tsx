import { Fragment, useState, type ReactNode } from 'react'
import { Heart, MessageCircle, Repeat, Eye } from 'lucide-react'
import { twitter } from '../data/twitter'
import { instagram } from '../data/instagram'
import { untappd } from '../data/untappd'
import { SectionHeader } from '../components/SectionHeader'
import { EmptyState } from '../components/EmptyState'

type Tab = 'twitter' | 'instagram' | 'untappd'

const TWEET_TOKEN_RE = /(https?:\/\/\S+|@\w{1,15})/g

function linkifyTweet(text: string): ReactNode[] {
  const out: ReactNode[] = []
  let last = 0
  let key = 0
  let m: RegExpExecArray | null
  while ((m = TWEET_TOKEN_RE.exec(text)) !== null) {
    if (m.index > last) {
      out.push(<Fragment key={key++}>{text.slice(last, m.index)}</Fragment>)
    }
    const token = m[0]
    const href = token.startsWith('@') ? `https://x.com/${token.slice(1)}` : token
    out.push(
      <a key={key++} href={href} target="_blank" rel="noreferrer">
        {token}
      </a>,
    )
    last = m.index + token.length
  }
  if (last < text.length) {
    out.push(<Fragment key={key}>{text.slice(last)}</Fragment>)
  }
  return out
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString(undefined, {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    })
  } catch {
    return iso
  }
}

function formatNumber(value: number | null | undefined): string {
  if (value == null) return '—'
  if (value >= 1000) return value.toLocaleString()
  return String(value)
}

function TwitterPanel() {
  if (twitter.posts.length === 0) {
    return <EmptyState message="Coming soon - waiting on Twitter scraper." />
  }
  return (
    <ul className="tw-grid">
      {twitter.posts.map((p) => (
        <li key={p.id} className="tw-card" data-kind={p.is_reply ? 'reply' : 'post'}>
          <a
            className="pin"
            href={p.url}
            target="_blank"
            rel="noreferrer"
            aria-label={p.is_reply ? 'View reply on X' : 'View post on X'}
          >
            {p.is_reply ? 'REPLY' : 'POST'}
          </a>
          <div className="meta">
            <span className="handle">
              <a href={p.url} target="_blank" rel="noreferrer">
                @{twitter.user}
              </a>
            </span>
            <span className="date">{formatDate(p.created_at)}</span>
          </div>
          <p className="text">{linkifyTweet(p.text)}</p>
          <div className="stats">
            <span title="Likes">
              <Heart size={12} /> <b>{formatNumber(p.metrics.like_count)}</b>
            </span>
            <span title="Replies">
              <MessageCircle size={12} /> <b>{formatNumber(p.metrics.reply_count)}</b>
            </span>
            <span title="Retweets">
              <Repeat size={12} /> <b>{formatNumber(p.metrics.retweet_count)}</b>
            </span>
            {p.metrics.view_count != null ? (
              <span title="Views">
                <Eye size={12} /> <b>{formatNumber(p.metrics.view_count)}</b>
              </span>
            ) : null}
          </div>
        </li>
      ))}
    </ul>
  )
}

function InstagramPanel() {
  if (instagram.posts.length === 0) {
    return <EmptyState message="Coming soon - waiting on Instagram scraper." />
  }
  return (
    <ul className="ig-grid">
      {instagram.posts.map((p) => {
        const first = p.media[0]
        const previewUrl =
          first?.type === 'image' ? first.url : first?.type === 'video' ? first.thumbnail_url : null
        return (
          <li key={p.id} className="ig-card">
            {p.media_type === 'carousel' && p.media.length > 1 ? (
              <span className="badge-carousel" title={`${p.media.length} items`}>
                {p.media.length}
              </span>
            ) : null}
            {previewUrl ? (
              <a className="frame" href={p.url} target="_blank" rel="noreferrer">
                <img src={previewUrl} alt={p.caption || 'Instagram post'} loading="lazy" />
                {p.location ? <span className="loc">{p.location.name}</span> : null}
              </a>
            ) : (
              <a className="frame placeholder" href={p.url} target="_blank" rel="noreferrer">
                <span>{p.media_type}</span>
                {p.location ? <span className="loc">{p.location.name}</span> : null}
              </a>
            )}
            {p.caption ? <p className="cap">{p.caption}</p> : null}
            <div className="meta">
              <span>
                <Heart size={12} /> {formatNumber(p.metrics.like_count)}
              </span>
              <span>
                <MessageCircle size={12} /> {formatNumber(p.metrics.comment_count)}
              </span>
              <span>{formatDate(p.taken_at)}</span>
            </div>
          </li>
        )
      })}
    </ul>
  )
}

function UntappdPanel() {
  const lifetime = untappd.lifetime
  const badges = untappd.badges ?? []
  const favourites = (untappd.favourites ?? []).slice(0, 5)
  const checkins = untappd.checkins.slice(0, 8)

  if (
    !lifetime &&
    badges.length === 0 &&
    favourites.length === 0 &&
    checkins.length === 0
  ) {
    return <EmptyState message="No check-ins yet." />
  }

  return (
    <>
      {lifetime ? (
        <ul className="untappd-lifetime" aria-label="Lifetime stats">
          <li>
            <span className="ul-label">Total check-ins</span>
            <span className="ul-val">{lifetime.totalCheckins.toLocaleString()}</span>
          </li>
          <li>
            <span className="ul-label">Unique beers</span>
            <span className="ul-val">{lifetime.uniqueBeers.toLocaleString()}</span>
          </li>
          <li>
            <span className="ul-label">Badges</span>
            <span className="ul-val">{lifetime.totalBadges.toLocaleString()}</span>
          </li>
          <li>
            <span className="ul-label">Friends</span>
            <span className="ul-val">{lifetime.totalFriends.toLocaleString()}</span>
          </li>
        </ul>
      ) : null}

      {badges.length > 0 ? (
        <>
          <h3 className="bz-subhead">Recent badges</h3>
          <ul className="badge-grid">
            {badges.map((b) => (
              <li key={b.id} className="badge-tile" title={b.description}>
                {b.imageUrl ? (
                  <img src={b.imageUrl} alt="" loading="lazy" />
                ) : (
                  <div
                    aria-hidden="true"
                    style={{
                      width: 64,
                      height: 64,
                      background: 'var(--ink)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      color: 'var(--paper)',
                      fontFamily: 'var(--f-display)',
                      fontSize: 18,
                    }}
                  >
                    ✦
                  </div>
                )}
                <span className="badge-name">{b.name}</span>
                {b.level && b.level > 1 ? <span className="badge-level">lvl {b.level}</span> : null}
              </li>
            ))}
          </ul>
        </>
      ) : null}

      {favourites.length > 0 ? (
        <>
          <h3 className="bz-subhead">Top rated</h3>
          <ol className="bz-favs">
            {favourites.map((f) => (
              <li key={f.id} className="bz-row">
                <span className="bz-cap" aria-hidden="true">
                  {f.beerLabel ? (
                    <img src={f.beerLabel} alt="" loading="lazy" />
                  ) : (
                    f.beer.replace(/[^A-Za-z0-9]+/g, '').slice(0, 2).toUpperCase() || '🍺'
                  )}
                </span>
                <div>
                  <div className="bz-name">
                    {f.recentCheckinUrl ? (
                      <a href={f.recentCheckinUrl} target="_blank" rel="noreferrer">
                        {f.beer}
                      </a>
                    ) : (
                      f.beer
                    )}
                  </div>
                  <div className="bz-meta">
                    {f.brewery}
                    {f.beerStyle ? ` · ${f.beerStyle}` : null}
                    {f.beerAbv ? ` · ${f.beerAbv}%` : null}
                    {' · '}
                    {f.count}× check-in{f.count === 1 ? '' : 's'}
                  </div>
                </div>
                <span className="bz-rating">{f.rating.toFixed(2)} ★</span>
              </li>
            ))}
          </ol>
        </>
      ) : null}

      {checkins.length > 0 ? (
        <>
          <h3 className="bz-subhead">Recent check-ins</h3>
          <ul className="bz-list">
            {checkins.map((c) => {
              const thumb = c.beerLabel ?? c.imageUrl
              const initials = c.beer
                .replace(/[^A-Za-z0-9]+/g, '')
                .slice(0, 2)
                .toUpperCase()
              return (
                <li key={c.id} className="bz-row">
                  <span className="bz-cap" aria-hidden="true">
                    {thumb ? <img src={thumb} alt="" loading="lazy" /> : initials || '🍺'}
                  </span>
                  <div>
                    <a className="bz-name" href={c.url} target="_blank" rel="noreferrer">
                      {c.beer}
                    </a>
                    <div className="bz-meta">
                      {c.brewery}
                      {c.venue ? ` · ${c.venue}` : ''}
                      {' · '}
                      {formatDate(c.checkedInAt)}
                    </div>
                  </div>
                  <span className="bz-rating">
                    {c.rating != null ? `★ ${c.rating.toFixed(2)}` : '—'}
                  </span>
                </li>
              )
            })}
          </ul>
        </>
      ) : null}
    </>
  )
}

interface TabSpec {
  id: Tab
  label: string
  count: number
}

export function SocialSection() {
  const [tab, setTab] = useState<Tab>('twitter')

  const tabs: TabSpec[] = [
    { id: 'twitter', label: 'Twitter', count: twitter.posts.length },
    { id: 'instagram', label: 'Instagram', count: instagram.posts.length },
    { id: 'untappd', label: 'Untappd', count: untappd.checkins.length },
  ]

  return (
    <section className="zn-section" id="social">
      <SectionHeader
        eyebrow="Side A · feed"
        title="Social"
        subtitle="twitter · instagram · untappd"
      />

      <div className="zn-tabs" role="tablist" aria-label="Social platform">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={tab === t.id}
            className="zn-tab"
            onClick={() => setTab(t.id)}
          >
            {t.label}
            <span className="count">{t.count}</span>
          </button>
        ))}
      </div>

      <div className="zn-folder">
        <div
          className="zn-panel"
          data-active={tab === 'twitter' ? 'true' : 'false'}
          role="tabpanel"
        >
          {tab === 'twitter' ? <TwitterPanel /> : null}
        </div>
        <div
          className="zn-panel"
          data-active={tab === 'instagram' ? 'true' : 'false'}
          role="tabpanel"
        >
          {tab === 'instagram' ? <InstagramPanel /> : null}
        </div>
        <div
          className="zn-panel"
          data-active={tab === 'untappd' ? 'true' : 'false'}
          role="tabpanel"
        >
          {tab === 'untappd' ? <UntappdPanel /> : null}
        </div>
      </div>
    </section>
  )
}
