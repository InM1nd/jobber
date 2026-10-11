import * as React from 'react';
import type { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

export function PageHeader({ title, subtitle, action }: { title: string; subtitle?: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div className="mb-6 flex items-end justify-between gap-4 md:mb-10">
      <div className="min-w-0">
        <h1 className="text-[20px] font-semibold tracking-[-0.02em] md:text-[24px]">{title}</h1>
        {subtitle && <p className="mt-0.5 text-[13px] text-muted">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}

/** Quiet inline note: a small dot plus muted text. No tinted boxes. */
export function Note({ tone = 'neutral', children, className }: { tone?: 'neutral' | 'warning'; children: React.ReactNode; className?: string }) {
  return (
    <p className={cn('flex items-start gap-2 text-[12.5px] leading-snug text-muted', className)}>
      <span className={cn('mt-[6px] size-1 shrink-0 rounded-full', tone === 'warning' ? 'bg-warning' : 'bg-subtle')} />
      <span className="min-w-0">{children}</span>
    </p>
  );
}

export function Score({ score, className }: { score: number; className?: string }) {
  return (
    <span className={cn('w-8 shrink-0 text-[15px] font-medium tabular-nums', score >= 80 ? 'text-fg' : 'text-muted', className)}>
      {score}
    </span>
  );
}

export function EmptyState({ icon: Icon, title, text, action }: { icon: LucideIcon; title: string; text: string; action?: React.ReactNode }) {
  return (
    <div className="flex animate-in flex-col items-center px-6 py-16 text-center">
      <Icon className="mb-4 size-5 text-muted" strokeWidth={1.5} />
      <p className="text-[15px] font-medium">{title}</p>
      <p className="mt-1 max-w-[280px] text-[13px] leading-relaxed text-muted">{text}</p>
      {action && <div className="mt-6">{action}</div>}
    </div>
  );
}

export function Group({ title, footer, children, className }: { title?: string; footer?: React.ReactNode; children: React.ReactNode; className?: string }) {
  return (
    <section className={cn('space-y-2', className)}>
      {title && <h2 className="text-[12px] font-medium text-muted">{title}</h2>}
      <div className="divide-y divide-line overflow-hidden rounded-[var(--radius-card)] border border-line">{children}</div>
      {footer && <p className="text-[12px] leading-relaxed text-subtle">{footer}</p>}
    </section>
  );
}

export function Row({
  icon: Icon,
  label,
  detail,
  trailing,
  className,
  children,
}: {
  icon?: LucideIcon;
  iconTone?: string;
  label: React.ReactNode;
  detail?: React.ReactNode;
  trailing?: React.ReactNode;
  className?: string;
  children?: React.ReactNode;
}) {
  return (
    <div className={cn('flex min-h-12 items-center gap-3 px-3.5 py-2.5', className)}>
      {Icon && <Icon className="size-[17px] shrink-0 text-muted" strokeWidth={1.6} />}
      <div className="min-w-0 flex-1">
        <div className="truncate text-[14.5px]">{label}</div>
        {detail && <div className="truncate text-[12.5px] text-muted">{detail}</div>}
        {children}
      </div>
      {trailing}
    </div>
  );
}

export const fieldClass =
  'w-full rounded-[var(--radius-field)] border border-line-strong bg-bg px-3 py-2 text-[15px] text-fg placeholder:text-subtle outline-none transition-colors focus:border-fg md:text-sm';

export const inlineFieldClass = 'w-full bg-transparent text-right text-[14.5px] text-fg placeholder:text-subtle outline-none';

export function Notice({ tone, children }: { tone: 'success' | 'danger'; children: React.ReactNode }) {
  return (
    <p className={cn('animate-in rounded-[var(--radius-field)] border border-line px-3 py-2 text-[13px]', tone === 'success' ? 'text-fg' : 'text-danger')}>
      {children}
    </p>
  );
}

export function Logo({ className }: { className?: string }) {
  return (
    <span className={cn('inline-flex items-center gap-2 text-[15px] font-semibold tracking-[-0.02em]', className)}>
      <span className="flex size-5 items-center justify-center rounded-[5px] bg-fg text-[11px] font-bold text-bg">J</span>
      Jobber
    </span>
  );
}
