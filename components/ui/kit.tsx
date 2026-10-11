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

export type Fit = 'strong' | 'good' | 'ok' | 'weak';

export function fitOf(score: number): Fit {
  if (score >= 80) return 'strong';
  if (score >= 65) return 'good';
  if (score >= 45) return 'ok';
  return 'weak';
}

export const FIT_LABEL: Record<Fit, string> = { strong: 'Strong match', good: 'Good fit', ok: 'Worth a look', weak: 'Long shot' };
export const FIT_TEXT: Record<Fit, string> = { strong: 'text-fit-strong', good: 'text-fit-good', ok: 'text-fit-ok', weak: 'text-fit-weak' };
export const FIT_BG: Record<Fit, string> = { strong: 'bg-fit-strong', good: 'bg-fit-good', ok: 'bg-fit-ok', weak: 'bg-fit-weak' };

/** Number inside a thin progress arc, coloured by fit. Fills once on load. */
export function ScoreRing({ score, size = 36, className }: { score: number; size?: number; className?: string }) {
  const stroke = 2.5;
  const r = (size - stroke) / 2;
  const len = 2 * Math.PI * r;
  const fit = fitOf(score);
  return (
    <span className={cn('relative inline-flex shrink-0 items-center justify-center', FIT_TEXT[fit], className)} style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90" aria-hidden>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="currentColor" strokeOpacity={0.15} strokeWidth={stroke} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="currentColor"
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={len}
          strokeDashoffset={len * (1 - Math.max(0, Math.min(100, score)) / 100)}
          style={{ ['--ring-len' as string]: `${len}`, animation: 'ring-fill 0.9s cubic-bezier(0.2,0.7,0.2,1) both' }}
        />
      </svg>
      <span className="absolute text-[12px] font-semibold tabular-nums text-fg" style={{ fontSize: size * 0.34 }}>{score}</span>
    </span>
  );
}

export function FitDot({ fit, className }: { fit: Fit; className?: string }) {
  return <span className={cn('inline-block size-1.5 shrink-0 rounded-full', FIT_BG[fit], className)} />;
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
  'w-full rounded-[var(--radius-field)] border border-line-strong bg-bg px-3 py-2 text-[15px] text-fg placeholder:text-subtle outline-none transition-colors focus:border-accent focus:ring-2 focus:ring-accent/20 md:text-sm';

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
      <span className="flex size-5 items-center justify-center rounded-[5px] bg-accent text-[11px] font-bold text-accent-fg">J</span>
      Jobber
    </span>
  );
}
