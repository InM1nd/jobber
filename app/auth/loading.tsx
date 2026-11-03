import { PageSkeleton } from '@/components/app/skeleton';

export default function Loading() {
  return <main className="mx-auto max-w-[420px] px-5 py-16"><PageSkeleton title="Jobber" rows={2} /></main>;
}
