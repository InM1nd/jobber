'use client';

import { useEffect, useState } from 'react';
import { Monitor, Moon, Sun } from 'lucide-react';
import { cn } from '@/lib/utils';
import { applyThemeMode, savedThemeMode, type ThemeMode } from '@/lib/theme';

const OPTIONS: [ThemeMode, typeof Sun, string][] = [
  ['system', Monitor, 'System'],
  ['light', Sun, 'Light'],
  ['dark', Moon, 'Dark'],
];

function useThemeMode() {
  const [mode, setMode] = useState<ThemeMode>('system');
  useEffect(() => {
    setMode(savedThemeMode());
    const media = matchMedia('(prefers-color-scheme: dark)');
    const onChange = () => {
      if (savedThemeMode() === 'system') applyThemeMode('system');
    };
    media.addEventListener('change', onChange);
    return () => media.removeEventListener('change', onChange);
  }, []);
  function choose(next: ThemeMode) {
    setMode(next);
    try {
      if (next === 'system') localStorage.removeItem('theme');
      else localStorage.setItem('theme', next);
    } catch {}
    applyThemeMode(next);
  }
  return [mode, choose] as const;
}

/** Compact icon toggle for headers. */
export function ThemeToggle({ className }: { className?: string }) {
  const [mode, choose] = useThemeMode();
  return (
    <div className={cn('inline-flex items-center rounded-full border border-line p-0.5', className)} role="radiogroup" aria-label="Theme">
      {OPTIONS.map(([value, Icon, label]) => (
        <button
          key={value}
          type="button"
          role="radio"
          aria-checked={mode === value}
          aria-label={label}
          onClick={() => choose(value)}
          className={cn('flex size-6 items-center justify-center rounded-full transition-colors', mode === value ? 'bg-surface-2 text-fg' : 'text-subtle hover:text-fg')}
        >
          <Icon className="size-3.5" strokeWidth={1.8} />
        </button>
      ))}
    </div>
  );
}

/** Labelled segmented control for Settings. */
export function ThemeSegmented() {
  const [mode, choose] = useThemeMode();
  return (
    <div className="grid grid-cols-3 gap-0.5 rounded-[14px] bg-surface-2 p-[3px]" role="radiogroup" aria-label="Theme">
      {OPTIONS.map(([value, Icon, label]) => (
        <button
          key={value}
          type="button"
          role="radio"
          aria-checked={mode === value}
          onClick={() => choose(value)}
          className={cn(
            'flex items-center justify-center gap-1.5 rounded-[11px] py-2 text-[13px] transition-all active:scale-[0.97]',
            mode === value ? 'bg-bg font-semibold text-fg shadow-[0_1px_3px_rgb(0_0_0/0.08)] dark:bg-[#1c1c1f]' : 'text-muted hover:text-fg',
          )}
        >
          <Icon className={cn('size-4', mode === value && 'text-accent')} strokeWidth={1.8} />
          {label}
        </button>
      ))}
    </div>
  );
}
