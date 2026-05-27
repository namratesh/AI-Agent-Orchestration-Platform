import clsx from 'clsx'

interface Props {
  size?: 'xs' | 'sm' | 'md' | 'lg'
  className?: string
}

const sizes = { xs: 'w-3 h-3', sm: 'w-4 h-4', md: 'w-6 h-6', lg: 'w-10 h-10' }

export default function LoadingSpinner({ size = 'md', className }: Props) {
  return (
    <div
      className={clsx(
        'animate-spin rounded-full border-2 border-current border-t-transparent text-primary-600',
        sizes[size],
        className,
      )}
      role="status"
      aria-label="Loading"
    />
  )
}

export function PageSpinner() {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-20">
      <LoadingSpinner size="lg" />
      <p className="text-sm text-gray-500 dark:text-gray-400">Loading…</p>
    </div>
  )
}
