import { PageHeader } from '@/components/ui/kit';

export function Bar({ w, h = 14, className = '' }: { w: string; h?: number; className?: string }) {
  return <div className={`animate-pulse rounded-full bg-surface-2 ${className}`} style={{ width: w, height: h }} />;
}

export function PageSkeleton({ title, rows = 4 }: { title: string; rows?: number }) {
  return (
    <div aria-busy="true" role="status" aria-label={`Loading ${title}`}>
      <PageHeader title={title} />
      <div aria-hidden="true" className="divide-y divide-line overflow-hidden rounded-[var(--radius-card)] border border-line bg-surface">
        {Array.from({ length: rows }).map((_, i) => (
          <div key={i} className="flex items-center gap-3.5 px-5 py-4">
            <div className="size-9 shrink-0 animate-pulse rounded-full bg-surface-2" />
            <div className="flex-1 space-y-2">
              <Bar w={`${60 - i * 7}%`} />
              <Bar w={`${40 + i * 5}%`} h={11} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
