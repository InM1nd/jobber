import * as React from 'react';
import type { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

export const capsClass = 'text-[11.5px] font-medium uppercase tracking-[0.14em] text-muted';

export function PageHeader({
  title,
  subtitle,
  eyebrow,
  eyebrowRight,
  action,
}: {
  title: string;
  subtitle?: React.ReactNode;
  eyebrow?: React.ReactNode;
  eyebrowRight?: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <div className="mb-6 md:mb-10">
      {(eyebrow || eyebrowRight) && (
        <div className="mb-2 flex items-center justify-between text-[15px] text-muted">
          <span>{eyebrow}</span>
          {eyebrowRight && <span className="font-medium text-fg">{eyebrowRight}</span>}
        </div>
      )}
      <div className="flex items-end justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-[32px] font-semibold leading-[1.08] tracking-[-0.04em] md:text-[40px]">{title}</h1>
          {subtitle && <p className="mt-1.5 text-[15px] leading-snug text-muted">{subtitle}</p>}
        </div>
        {action}
      </div>
    </div>
  );
}

/** Karten-style primary CTA: ink pill, label left, mint round arrow right. */
export function CtaLink({ href, children, external, className }: { href: string; children: React.ReactNode; external?: boolean; className?: string }) {
  const cls = cn(
    'group inline-flex h-14 min-w-[220px] items-center justify-between gap-6 rounded-full bg-fg pl-7 pr-2 text-[16px] font-semibold tracking-[-0.01em] text-bg transition-transform active:scale-[0.98]',
    className,
  );
  const inner = (
    <>
      {children}
      <span className="flex size-10 items-center justify-center rounded-full bg-accent text-accent-fg transition-transform group-hover:translate-x-0.5">
        <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14M13 6l6 6-6 6" /></svg>
      </span>
    </>
  );
  return <a href={href} className={cls} {...(external ? { rel: "noreferrer" } : {})}>{inner}</a>;
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
      <Icon className="mb-5 size-7 text-fg" strokeWidth={1.5} />
      <p className="text-[22px] font-semibold tracking-[-0.03em]">{title}</p>
      <p className="mt-2 max-w-[300px] text-[15px] leading-relaxed text-muted">{text}</p>
      {action && <div className="mt-6">{action}</div>}
    </div>
  );
}

export function Group({ title, footer, children, className }: { title?: string; footer?: React.ReactNode; children: React.ReactNode; className?: string }) {
  return (
    <section className={cn('space-y-2', className)}>
      {title && <h2 className={cn(capsClass, 'px-1')}>{title}</h2>}
      <div className="divide-y divide-line overflow-hidden rounded-[var(--radius-card)] border border-line">{children}</div>
      {footer && <p className="px-1 text-[12.5px] leading-relaxed text-muted">{footer}</p>}
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
    <div className={cn('flex min-h-14 items-center gap-3.5 px-5 py-3', className)}>
      {Icon && <Icon className="size-[17px] shrink-0 text-muted" strokeWidth={1.6} />}
      <div className="min-w-0 flex-1">
        <div className="truncate text-[15.5px] font-medium tracking-[-0.01em]">{label}</div>
        {detail && <div className="truncate text-[12.5px] text-muted">{detail}</div>}
        {children}
      </div>
      {trailing}
    </div>
  );
}

export const fieldClass =
  'w-full rounded-[var(--radius-field)] border border-line bg-surface-2 px-4 py-3 text-[15px] text-fg placeholder:text-subtle outline-none transition-colors focus:border-accent focus:ring-2 focus:ring-accent/20 md:text-sm';

export const inlineFieldClass = 'w-full bg-transparent text-right text-[14.5px] text-fg placeholder:text-subtle outline-none';

export function Notice({ tone, children }: { tone: 'success' | 'danger'; children: React.ReactNode }) {
  return (
    <p className={cn('animate-in rounded-[var(--radius-field)] border border-line px-3 py-2 text-[13px]', tone === 'success' ? 'text-fg' : 'text-danger')}>
      {children}
    </p>
  );
}

/** Match ring: mint progress ring with a J. Ring/track use theme tokens, J uses currentColor. */
export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="64 64 384 384" className={cn('shrink-0', className)} aria-hidden>
      <circle cx="256" cy="256" r="170" fill="none" stroke="var(--color-line)" strokeWidth="46" />
      <path d="M341 108.8 A170 170 0 1 1 146.7 125.8" fill="none" stroke="var(--color-accent)" strokeWidth="46" strokeLinecap="round" />
      <path d="M282 176 V282 a52 52 0 0 1 -104 0" fill="none" stroke="currentColor" strokeWidth="52" strokeLinecap="round" />
    </svg>
  );
}

export function Logo({ className }: { className?: string }) {
  return (
    <span className={cn('inline-flex items-center gap-2 text-[17px] font-semibold tracking-[-0.03em]', className)}>
      <LogoMark className="size-6" />
      Jobber
    </span>
  );
}
