import { getProfile } from '@/lib/data/service';
import { getPrisma } from '@/lib/db/prisma';
import { isDemoMode } from '@/lib/demo/mode';
import type { JobData, UserProfile } from '@/lib/llm/matcher';
import type { DemoMatch } from '@/lib/demo/store';

/** What the cover-letter prompts need for one match: the profile (with the match's best CV) and the job. */
export async function letterInputs(userId: string, match: Pick<DemoMatch, 'cvId' | 'job'>): Promise<{ profileInput: UserProfile; jobInput: JobData }> {
  const profile = await getProfile(userId);
  const cv = match.cvId && !isDemoMode() ? await getPrisma().cv.findFirst({ where: { id: match.cvId, userId } }).catch(() => null) : null;
  const profileInput: UserProfile = {
    cvText: cv?.text || profile.cvText || undefined,
    skills: profile.skills,
    location: profile.location || undefined,
    remoteOnly: profile.remoteOnly,
    languages: profile.languages,
    salaryMin: profile.salaryMin || undefined,
    salaryMax: profile.salaryMax || undefined,
    stackKeywords: profile.stackKeywords,
    skillGaps: profile.skillGaps,
    writingRules: profile.writingRules || undefined,
    facts: profile.facts || undefined,
    fullName: profile.fullName || undefined,
  };
  const jobInput: JobData = {
    title: match.job.title,
    company: match.job.company,
    location: match.job.location || undefined,
    remote: match.job.remote,
    description: match.job.description,
    salaryMin: match.job.salaryMin || undefined,
    salaryMax: match.job.salaryMax || undefined,
  };
  return { profileInput, jobInput };
}
