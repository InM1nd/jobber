'use client';

import { PageError } from '@/components/app/page-error';

export default function Error({ retry }: { error: unknown; retry: () => void }) {
  return <main className="mx-auto max-w-lg px-5 py-16"><PageError retry={retry} /></main>;
}
