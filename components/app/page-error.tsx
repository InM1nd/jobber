'use client';

import { RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/kit';

export function PageError({ retry }: { retry: () => void }) {
  return (
    <div role="alert">
      <EmptyState
        icon={RefreshCw}
        title="Couldn’t load this page"
        text="Please try again in a moment."
        action={<Button onClick={retry}><RefreshCw /> Try again</Button>}
      />
    </div>
  );
}
