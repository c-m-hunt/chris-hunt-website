interface SectionHeaderProps {
  eyebrow: string
  title: string
  subtitle?: string
  generatedAt?: string
  withStamp?: boolean
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    })
  } catch {
    return iso
  }
}

export function SectionHeader({
  eyebrow,
  title,
  subtitle,
  generatedAt,
  withStamp = true,
}: SectionHeaderProps) {
  return (
    <header>
      <span className="zn-eyebrow">{eyebrow}</span>
      <h2 className={`zn-title${withStamp ? ' with-stamp' : ''}`}>{title}</h2>
      {subtitle ? <p className="zn-subtitle">{subtitle}</p> : null}
      {generatedAt ? <p className="section-meta">updated {formatDate(generatedAt)}</p> : null}
    </header>
  )
}
