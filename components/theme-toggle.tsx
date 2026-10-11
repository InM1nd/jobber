'use client';

import { useEffect, useState } from 'react';
import { Monitor, Moon, Sun } from 'lucide-react';
import { cn } from '@/lib/utils';

type Mode = 'system' | 'light' | 'dark';

function apply(mode: Mode) {
  const dark = mode === 'dark' || (mode === 'system' && matchMedia('(prefers-color-scheme: dark)').matches);
  document.documentElement.dataset.theme = dark ? 'dark' : 'light';
}

export function ThemeToggle({ className }: { className?: string }) {
  const [mode, setMode] = useState<Mode>('system');

  useEffect(() => {
    const saved = (localStorage.getItem('theme') as Mode | null) || 'system';
    setMode(saved);
    const media = matchMedia('(prefers-color-scheme: dark)');
    const onChange = () => {
      if ((localStorage.getItem('theme') || 'system') === 'system') apply('system');
    };
    media.addEventListener('change', onChange);
    return () => media.removeEventListener('change', onChange);
  }, []);

  function choose(next: Mode) {
    setMode(next);
    localStorage.setItem('theme', next);
    apply(next);
  }

  const options: [Mode, typeof Sun, string][] = [
    ['system', Monitor, 'System'],
    ['light', Sun, 'Light'],
    ['dark', Moon, 'Dark'],
  ];
  return (
    <div className={cn('inline-flex items-center rounded-full border border-line p-0.5', className)} role="radiogroup" aria-label="Theme">
      {options.map(([value, Icon, label]) => (
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
