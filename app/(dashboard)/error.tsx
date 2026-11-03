'use client';

import { PageError } from '@/components/app/page-error';

export default function Error({ retry }: { error: unknown; retry: () => void }) {
  return <PageError retry={retry} />;
}
