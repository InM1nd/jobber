export function isDemoMode(): boolean {
  if (process.env.DEMO_MODE === 'true') return true;
  if (process.env.DEMO_MODE === 'false') return false;
  return !process.env.NEXT_PUBLIC_SUPABASE_URL;
}
