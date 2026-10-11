import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Logo, Note } from '@/components/ui/kit';
import { ThemeToggle } from '@/components/theme-toggle';

const BOT = (process.env.NEXT_PUBLIC_TELEGRAM_BOT_USERNAME || 'JobberCheck_bot').replace(/^@/, '');

const rows = [
  { score: 86, title: 'Frontend Engineer', meta: 'Bitpanda · Vienna', reason: 'TypeScript and React, hybrid in Vienna' },
  { score: 74, title: 'Design Engineer', meta: 'Storyblok · Remote', reason: 'Figma plus production React' },
  { score: 61, title: 'Product Engineer', meta: 'Linear · Remote', flag: 'Contract must be Austria-based' },
];

export default function Home() {
  return (
    <div className="flex min-h-screen flex-col bg-bg">
      <header className="mx-auto flex w-full max-w-5xl items-center justify-between px-6 py-5">
        <Logo />
        <div className="flex items-center gap-3">
          <ThemeToggle />
          <Link href="/auth/signin" className="text-[13px] text-muted transition-colors hover:text-fg">Sign in</Link>
        </div>
      </header>

      <main className="flex flex-1 flex-col items-center px-6 pb-24 pt-20 text-center md:pt-28">
        <h1 className="max-w-2xl animate-in text-[40px] font-semibold leading-[1.05] tracking-[-0.04em] md:text-[56px]">
          Job search, quietly handled.
        </h1>
        <p className="mt-4 max-w-md text-[16px] leading-relaxed text-muted">
          New roles scored against your CV every morning, with an honest letter when one fits.
        </p>
        <div className="mt-8 flex flex-wrap justify-center gap-2.5">
          <Button asChild size="lg"><a href={`https://t.me/${BOT}`}>Open in Telegram</a></Button>
          <Button asChild size="lg" variant="outline"><Link href="/auth/signin">Sign in <ArrowRight /></Link></Button>
        </div>

        <div className="mt-20 w-full max-w-md text-left">
          <div className="flex items-baseline justify-between border-b border-line pb-2 text-[12px] text-muted">
            <span className="font-medium">This morning</span>
            <span className="tabular-nums text-subtle">3</span>
          </div>
          <div className="divide-y divide-line">
            {rows.map((r) => (
              <div key={r.title} className="flex gap-3 py-3.5">
                <span className={`w-8 shrink-0 text-[15px] font-medium tabular-nums ${r.score >= 80 ? 'text-fg' : 'text-muted'}`}>{r.score}</span>
                <div className="min-w-0">
                  <p className="text-[14.5px] font-medium">{r.title}</p>
                  <p className="text-[12.5px] text-muted">{r.meta}</p>
                  {r.reason && <p className="mt-1 text-[12.5px] text-fg/80">{r.reason}</p>}
                  {r.flag && <Note tone="warning" className="mt-1">{r.flag}</Note>}
                </div>
              </div>
            ))}
          </div>
        </div>
      </main>

      <footer className="mx-auto w-full max-w-5xl px-6 py-6 text-[12px] text-subtle">
        Jobber · <a href={`https://t.me/${BOT}`} className="hover:text-fg">@{BOT}</a>
      </footer>
    </div>
  );
}
