export function Bar({ w, h = 14, className = '' }: { w: string; h?: number; className?: string }) {
  return <div className={`animate-pulse rounded-full bg-surface-2 ${className}`} style={{ width: w, height: h }} />;
}

export function PageSkeleton({ title, rows = 4 }: { title: string; rows?: number }) {
  return (
    <div aria-busy="true">
      <h1 className="mb-6 text-[32px] font-semibold leading-[1.08] tracking-[-0.04em] md:mb-10 md:text-[40px]">{title}</h1>
      <div className="divide-y divide-line overflow-hidden rounded-[var(--radius-card)] border border-line">
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
