import type { ReactNode } from 'react'

interface CardProps {
  children: ReactNode
  className?: string
  as?: 'div' | 'article' | 'li'
}

export function Card({ children, className = '', as: Tag = 'article' }: CardProps) {
  return <Tag className={`card ${className}`.trim()}>{children}</Tag>
}
