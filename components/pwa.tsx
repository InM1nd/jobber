'use client';

import { useEffect, useState } from 'react';
import { Download, Share, Smartphone } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { insideTelegram } from '@/components/telegram-ui';
import { cn } from '@/lib/utils';

type PromptEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }> };

let deferred: PromptEvent | null = null;
const listeners = new Set<() => void>();

if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault();
    deferred = event as PromptEvent;
    listeners.forEach((l) => l());
  });
  window.addEventListener('appinstalled', () => {
    deferred = null;
    listeners.forEach((l) => l());
  });
}

/** Registers /sw.js on the web. Skipped inside Telegram, whose webview handles its own caching. */
export function ServiceWorkerRegister() {
  useEffect(() => {
    if (!('serviceWorker' in navigator) || process.env.NODE_ENV !== 'production') return;
    const t = setTimeout(() => {
      if (insideTelegram()) return;
      navigator.serviceWorker.register('/sw.js').catch(() => undefined);
    }, 1500);
    return () => clearTimeout(t);
  }, []);
  return null;
}

type InstallState = 'unknown' | 'installed' | 'prompt' | 'ios' | 'unsupported' | 'telegram';

function useInstallState(): [InstallState, () => Promise<void>] {
  const [state, setState] = useState<InstallState>('unknown');
  useEffect(() => {
    const compute = () => {
      if (insideTelegram()) return setState('telegram');
      const standalone = matchMedia('(display-mode: standalone)').matches || (navigator as { standalone?: boolean }).standalone;
      if (standalone) return setState('installed');
      if (deferred) return setState('prompt');
      const ios = /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
      setState(ios ? 'ios' : 'unsupported');
    };
    compute();
    listeners.add(compute);
    return () => {
      listeners.delete(compute);
    };
  }, []);
  async function install() {
    if (!deferred) return;
    await deferred.prompt();
    await deferred.userChoice.catch(() => undefined);
    deferred = null;
    listeners.forEach((l) => l());
  }
  return [state, install];
}

/** Install row for Settings / landing. `force` previews a state (screenshots only). */
export function InstallApp({ variant = 'row', force }: { variant?: 'row' | 'inline'; force?: InstallState }) {
  const [live, install] = useInstallState();
  const state = force ?? live;
  const [showHint, setShowHint] = useState(false);
  if (state === 'telegram' || state === 'unknown') return null;
  if (variant === 'inline') {
    if (state === 'installed') return null;
    return (
      <div className="flex flex-col items-center gap-2">
        {state === 'prompt' ? (
          <button type="button" onClick={install} className="inline-flex items-center gap-1.5 text-[13px] font-medium text-accent hover:underline underline-offset-4">
            <Download className="size-4" /> Install the app
          </button>
        ) : (
          <button type="button" onClick={() => setShowHint((v) => !v)} className="inline-flex items-center gap-1.5 text-[13px] font-medium text-accent hover:underline underline-offset-4">
            <Smartphone className="size-4" /> Add to Home Screen
          </button>
        )}
        {showHint && <IosHint ios={state === 'ios'} />}
      </div>
    );
  }
  return (
    <div className="px-5 py-3.5">
      <div className="flex items-center gap-3.5">
        <Smartphone className="size-[17px] shrink-0 text-muted" strokeWidth={1.6} />
        <div className="min-w-0 flex-1">
          <p className="text-[15.5px] font-medium tracking-[-0.01em]">Install Jobber</p>
          <p className="text-[12.5px] text-muted">
            {state === 'installed' ? 'Installed on this device' : 'Opens like an app, full screen'}
          </p>
        </div>
        {state === 'prompt' && (
          <Button size="sm" variant="accent" onClick={install}><Download /> Install</Button>
        )}
        {(state === 'ios' || state === 'unsupported') && (
          <Button size="sm" variant="outline" onClick={() => setShowHint((v) => !v)}>How to</Button>
        )}
        {state === 'installed' && <span className="text-[12px] text-muted">Installed</span>}
      </div>
      {(showHint || force === 'ios') && state !== 'installed' && state !== 'prompt' && (
        <div className="mt-3"><IosHint ios={state === 'ios'} /></div>
      )}
    </div>
  );
}

function IosHint({ ios }: { ios: boolean }) {
  return (
    <div className={cn('animate-in rounded-[14px] bg-surface-2 px-4 py-3 text-left text-[13px] leading-relaxed text-muted')}>
      {ios ? (
        <>
          In Safari, tap <Share className="mx-0.5 inline size-4 -translate-y-px text-fg" /> <span className="font-medium text-fg">Share</span>, then{' '}
          <span className="font-medium text-fg">Add to Home Screen</span>.
        </>
      ) : (
        <>Open your browser menu and choose <span className="font-medium text-fg">Install app</span> or <span className="font-medium text-fg">Add to Home screen</span>.</>
      )}
    </div>
  );
}
