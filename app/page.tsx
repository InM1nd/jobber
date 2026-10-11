import Link from 'next/link';
import { Button } from '@/components/ui/button';

export default function Home() {
  return (
    <div className="min-h-screen flex flex-col">
      <header className="border-b">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <h1 className="text-2xl font-semibold tracking-tight text-green-700">Jobber</h1>
          <div className="flex gap-4">
            <Link href="/auth/signin">
              <Button variant="ghost">Sign In</Button>
            </Link>
            <Link href="/auth/signup">
              <Button>Get Started</Button>
            </Link>
          </div>
        </div>
      </header>

      <main className="flex-1 flex flex-col items-center justify-center px-4">
        <div className="max-w-3xl text-center space-y-8">
          <h2 className="text-5xl font-bold tracking-tight">
            Your Personal Job Search Assistant
          </h2>
          
          <p className="text-xl text-gray-600">
            Let AI find and match jobs for you. Get daily digests via Telegram, 
            generate cover letters following your rules, and track your applications 
            in one place.
          </p>

          <div className="grid md:grid-cols-3 gap-6 mt-12">
            <div className="p-6 border rounded-lg">
              <h3 className="font-semibold text-lg mb-2">Smart Matching</h3>
              <p className="text-sm text-gray-600">
                AI scores every job against your profile, filters by your preferences, 
                and surfaces only the best matches.
              </p>
            </div>

            <div className="p-6 border rounded-lg">
              <h3 className="font-semibold text-lg mb-2">Automated Fetching</h3>
              <p className="text-sm text-gray-600">
                Daily job fetch from company ATSs you choose. No manual checking 
                of 50+ career pages.
              </p>
            </div>

            <div className="p-6 border rounded-lg">
              <h3 className="font-semibold text-lg mb-2">Your Own AI</h3>
              <p className="text-sm text-gray-600">
                Bring your own OpenRouter, OpenAI, Anthropic, or Gemini key. 
                Zero LLM costs for us, full control for you.
              </p>
            </div>
          </div>

          <div className="flex gap-4 justify-center pt-6">
            <Link href="/auth/signup">
              <Button size="lg">Start Job Search</Button>
            </Link>
            <Link href="/dashboard/matches">
              <Button size="lg" variant="outline">Open the app</Button>
            </Link>
          </div>
        </div>
      </main>

      <footer className="border-t py-6 text-center text-sm text-gray-500">
        <p>Jobber MVP - Built for focused job search</p>
      </footer>
    </div>
  );
}
