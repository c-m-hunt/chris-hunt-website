interface EmptyStateProps {
  title?: string
  message: string
}

export function EmptyState({ title = 'Coming soon', message }: EmptyStateProps) {
  return (
    <div className="empty-state">
      <p className="empty-state-title">{title}</p>
      <p className="empty-state-message">{message}</p>
    </div>
  )
}
