import Link from 'next/link';
import { ArrowRight, BellRing, Check, KeyRound, PenLine, Send, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Chip, Logo, ScoreBadge } from '@/components/ui/kit';

const BOT = (process.env.NEXT_PUBLIC_TELEGRAM_BOT_USERNAME || 'JobberCheck_bot').replace(/^@/, '');

const features = [
  { icon: Sparkles, title: 'Scored every morning', text: 'New roles from the companies you follow, ranked against your CV and filters.' },
  { icon: PenLine, title: 'Letters that sound like you', text: 'Drafts follow your own writing rules and never invent experience.' },
  { icon: BellRing, title: 'Follow-ups on time', text: 'A light tracker that nudges you in Telegram a week after you apply.' },
  { icon: KeyRound, title: 'Your AI, your bill', text: 'Connect OpenRouter or paste a key. Encrypted, never shared.' },
];

function Preview() {
  return (
    <div className="relative mx-auto w-full max-w-[340px]">
      <div className="absolute -inset-10 -z-10 rounded-full bg-accent/20 blur-3xl" />
      <div className="rounded-[32px] border border-line bg-bg p-3 shadow-lift">
        <div className="rounded-[24px] bg-bg px-2 pb-2 pt-3">
          <p className="px-1 text-[18px] font-semibold tracking-tight">Matches</p>
          <p className="px-1 text-[11.5px] text-muted">3 roles scored this morning</p>
          <div className="mt-3 space-y-2.5">
            {[
              { score: 86, company: 'Bitpanda', title: 'Frontend Engineer', place: 'Vienna · Hybrid', reason: 'TypeScript + React, Vienna' },
              { score: 74, company: 'Storyblok', title: 'Product Engineer', place: 'Remote · Austria', reason: 'Design-minded product UI' },
            ].map((m) => (
              <div key={m.title} className="rounded-2xl border border-line bg-surface p-3 shadow-soft">
                <div className="flex gap-3">
                  <ScoreBadge score={m.score} />
                  <div className="min-w-0">
                    <p className="text-[11px] font-medium text-muted">{m.company}</p>
                    <p className="text-[14px] font-semibold leading-tight">{m.title}</p>
                    <p className="mt-0.5 text-[11px] text-muted">{m.place}</p>
                  </div>
                </div>
                <div className="mt-2.5"><Chip tone="success" icon={Check}>{m.reason}</Chip></div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function Home() {
  return (
    <div className="min-h-screen overflow-hidden bg-bg">
      <header className="mx-auto flex max-w-6xl items-center justify-between px-5 py-5 md:px-8">
        <Logo />
        <nav className="flex items-center gap-1.5">
          <Button asChild variant="ghost" size="sm"><Link href="/auth/signin">Sign in</Link></Button>
          <Button asChild size="sm"><a href={`https://t.me/${BOT}`}>Open in Telegram</a></Button>
        </nav>
      </header>

      <main>
        <section className="mx-auto grid max-w-6xl items-center gap-14 px-5 pb-20 pt-10 md:grid-cols-[1.1fr_1fr] md:px-8 md:pb-28 md:pt-20">
          <div className="animate-in">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-line bg-surface px-3 py-1 text-[12px] font-medium text-muted shadow-soft">
              <span className="size-1.5 rounded-full bg-success" /> Invite-only beta
            </span>
            <h1 className="mt-5 text-[40px] font-semibold leading-[1.05] tracking-[-0.035em] md:text-[60px]">
              A calmer way<br />to find your next job.
            </h1>
            <p className="mt-5 max-w-md text-[17px] leading-relaxed text-muted">
              Jobber checks the companies you care about, scores every new role against your profile, and drafts an honest cover letter when one fits.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Button asChild size="lg">
                <a href={`https://t.me/${BOT}`}><Send /> Open in Telegram</a>
              </Button>
              <Button asChild size="lg" variant="outline">
                <Link href="/auth/signin">Sign in on the web <ArrowRight /></Link>
              </Button>
            </div>
            <p className="mt-4 text-[13px] text-subtle">One account in Telegram and on the web.</p>
          </div>
          <Preview />
        </section>

        <section className="border-t border-line bg-surface/60">
          <div className="mx-auto grid max-w-6xl gap-px px-5 py-16 sm:grid-cols-2 md:px-8 lg:grid-cols-4">
            {features.map(({ icon: Icon, title, text }) => (
              <div key={title} className="p-4 md:p-5">
                <div className="flex size-10 items-center justify-center rounded-xl bg-accent-soft text-accent">
                  <Icon className="size-5" strokeWidth={1.8} />
                </div>
                <h3 className="mt-4 text-[15px] font-semibold">{title}</h3>
                <p className="mt-1.5 text-[14px] leading-relaxed text-muted">{text}</p>
              </div>
            ))}
          </div>
        </section>
      </main>

      <footer className="border-t border-line">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-5 py-6 text-[12.5px] text-subtle md:px-8">
          <span>Jobber</span>
          <a href={`https://t.me/${BOT}`} className="hover:text-fg">@{BOT}</a>
        </div>
      </footer>
    </div>
  );
}
