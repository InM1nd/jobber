import * as React from 'react';
import type { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

export function PageHeader({
  title,
  subtitle,
  action,
}: {
  title: string;
  subtitle?: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <div className="mb-5 flex items-end justify-between gap-4 md:mb-8">
      <div className="min-w-0">
        <h1 className="text-[22px] font-semibold leading-tight tracking-[-0.02em] md:text-[28px]">{title}</h1>
        {subtitle && <p className="mt-1 text-[13px] text-muted md:text-sm">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}

export function Chip({
  tone = 'neutral',
  className,
  children,
  icon: Icon,
}: {
  tone?: 'neutral' | 'accent' | 'success' | 'warning' | 'danger';
  className?: string;
  children: React.ReactNode;
  icon?: LucideIcon;
}) {
  const tones = {
    neutral: 'bg-surface-2 text-muted',
    accent: 'bg-accent-soft text-accent',
    success: 'bg-success-soft text-success',
    warning: 'bg-warning-soft text-warning',
    danger: 'bg-danger-soft text-danger',
  } as const;
  return (
    <span
      className={cn(
        'inline-flex max-w-full items-start gap-1.5 rounded-lg px-2 py-1 text-[12px] font-medium leading-snug',
        tones[tone],
        className,
      )}
    >
      {Icon && <Icon className="mt-[1px] size-3.5 shrink-0" />}
      <span className="min-w-0">{children}</span>
    </span>
  );
}

export function ScoreBadge({ score }: { score: number }) {
  const tone = score >= 80 ? 'text-success bg-success-soft' : score >= 60 ? 'text-accent bg-accent-soft' : 'text-muted bg-surface-2';
  return (
    <div className={cn('flex size-12 shrink-0 flex-col items-center justify-center rounded-2xl', tone)}>
      <span className="text-[17px] font-semibold leading-none tabular-nums">{score}</span>
      <span className="mt-0.5 text-[9px] font-medium uppercase tracking-wider opacity-70">match</span>
    </div>
  );
}

export function EmptyState({
  icon: Icon,
  title,
  text,
  action,
}: {
  icon: LucideIcon;
  title: string;
  text: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex animate-in flex-col items-center rounded-[var(--radius-card)] border border-line bg-surface px-6 py-10 text-center shadow-soft">
      <div className="mb-4 flex size-12 items-center justify-center rounded-2xl bg-accent-soft text-accent">
        <Icon className="size-6" strokeWidth={1.75} />
      </div>
      <p className="text-[15px] font-semibold">{title}</p>
      <p className="mt-1 max-w-xs text-[13px] leading-relaxed text-muted">{text}</p>
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

/** iOS-style grouped list. */
export function Group({
  title,
  footer,
  children,
  className,
}: {
  title?: string;
  footer?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={cn('space-y-1.5', className)}>
      {title && <h2 className="px-4 text-[12px] font-medium uppercase tracking-[0.06em] text-subtle">{title}</h2>}
      <div className="divide-y divide-line overflow-hidden rounded-[var(--radius-card)] border border-line bg-surface shadow-soft">
        {children}
      </div>
      {footer && <p className="px-4 text-[12px] leading-relaxed text-muted">{footer}</p>}
    </section>
  );
}

export function Row({
  icon: Icon,
  iconTone = 'accent',
  label,
  detail,
  trailing,
  className,
  children,
}: {
  icon?: LucideIcon;
  iconTone?: 'accent' | 'success' | 'warning' | 'neutral' | 'telegram';
  label: React.ReactNode;
  detail?: React.ReactNode;
  trailing?: React.ReactNode;
  className?: string;
  children?: React.ReactNode;
}) {
  const tones = {
    accent: 'bg-accent text-white',
    success: 'bg-success text-white',
    warning: 'bg-warning text-white',
    neutral: 'bg-subtle text-white',
    telegram: 'bg-[#2aabee] text-white',
  } as const;
  return (
    <div className={cn('flex min-h-12 items-center gap-3 px-4 py-2.5', className)}>
      {Icon && (
        <span className={cn('flex size-7 shrink-0 items-center justify-center rounded-lg', tones[iconTone])}>
          <Icon className="size-4" strokeWidth={2} />
        </span>
      )}
      <div className="min-w-0 flex-1">
        <div className="truncate text-[15px]">{label}</div>
        {detail && <div className="truncate text-[12.5px] text-muted">{detail}</div>}
        {children}
      </div>
      {trailing}
    </div>
  );
}

export const fieldClass =
  'w-full rounded-[var(--radius-field)] border border-line-strong bg-surface px-3.5 py-2.5 text-[15px] text-fg placeholder:text-subtle outline-none transition focus:border-accent focus:ring-4 focus:ring-accent/15 md:text-sm';

/** Borderless input that sits inside a grouped Row. */
export const inlineFieldClass =
  'w-full bg-transparent text-right text-[15px] text-fg placeholder:text-subtle outline-none';

export function Notice({ tone, children }: { tone: 'success' | 'danger'; children: React.ReactNode }) {
  return (
    <p
      className={cn(
        'animate-in rounded-[var(--radius-field)] px-3.5 py-2.5 text-[13px]',
        tone === 'success' ? 'bg-success-soft text-success' : 'bg-danger-soft text-danger',
      )}
    >
      {children}
    </p>
  );
}

export function Logo({ className }: { className?: string }) {
  return (
    <span className={cn('inline-flex items-center gap-2 font-semibold tracking-tight', className)}>
      <span className="flex size-7 items-center justify-center rounded-[9px] bg-gradient-to-br from-[#7c7cff] to-[#4f46e5] text-white shadow-soft">
        <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
          <path d="M14 4v10a4 4 0 0 1-8 0" />
          <path d="M18 4h-6" />
        </svg>
      </span>
      Jobber
    </span>
  );
}
