interface LoaderProps {
  label?: string
}

export function Loader({ label = 'Loading...' }: LoaderProps) {
  return (
    <div className="loader" role="status" aria-live="polite">
      <span className="loader-dot" />
      <span className="loader-dot" />
      <span className="loader-dot" />
      <span className="visually-hidden">{label}</span>
    </div>
  )
}
