import type { LLMMessage, LLMResponse } from './provider';

/** Anything that can answer a chat: the shared Gemini client or a provider client. */
export interface ChatClient {
  chat(messages: LLMMessage[], options?: { temperature?: number; maxTokens?: number }): Promise<LLMResponse>;
}

export interface JobMatchResult {
  score: number;
  reasons: string[];
  redFlags: string[];
  priority: 'high' | 'medium' | 'low';
}

export interface UserProfile {
  cvText?: string;
  skills: string[];
  location?: string;
  remoteOnly: boolean;
  languages: string[];
  salaryMin?: number;
  salaryMax?: number;
  stackKeywords: string[];
  skillGaps: string[];
  writingRules?: string;
}

export interface JobData {
  title: string;
  company: string;
  location?: string;
  remote: boolean;
  description: string;
  requirements?: string;
  salaryMin?: number;
  salaryMax?: number;
}

export function priorityFromScore(score: number): JobMatchResult['priority'] {
  if (score >= 80) return 'high';
  if (score >= 50) return 'medium';
  return 'low';
}

export function parseMatchResponse(content: string): JobMatchResult {
  const jsonMatch = content.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    throw new Error('No JSON found in response');
  }

  const result = JSON.parse(jsonMatch[0]) as Partial<JobMatchResult>;
  const score = Number(result.score);
  if (!Number.isFinite(score) || !Array.isArray(result.reasons) || !Array.isArray(result.redFlags)) {
    throw new Error('Invalid response format');
  }

  const clamped = Math.max(0, Math.min(100, Math.round(score)));
  const priority = result.priority === 'high' || result.priority === 'medium' || result.priority === 'low'
    ? result.priority
    : priorityFromScore(clamped);

  return {
    score: clamped,
    reasons: result.reasons.map(String).slice(0, 6),
    redFlags: result.redFlags.map(String).slice(0, 6),
    priority,
  };
}

export function buildMatchMessages(profile: UserProfile, job: JobData): LLMMessage[] {
  const systemPrompt = `You are a job matching assistant. Score one vacancy against a candidate profile.

Rules:
- Use only facts present in the profile and the vacancy. Do not invent experience, years, or skills.
- Treat the skill-gap list as technologies the candidate does not want to claim.
- Down-rank roles that require relocation, offices outside the candidate's city, or a core stack from the skill gaps.
- Prefer English as a working language when the profile says so.

Return JSON only:
{
  "score": <number 0-100>,
  "reasons": ["reason1", "reason2"],
  "redFlags": ["flag1"],
  "priority": "high" | "medium" | "low"
}

priority is high at 80+, medium at 50-79, low below 50.`;

  const userPrompt = `Candidate profile:
- Skills: ${profile.skills.join(', ') || 'not set'}
- Stack keywords: ${profile.stackKeywords.join(', ') || 'not set'}
- Skill gaps to avoid: ${profile.skillGaps.join(', ') || 'none'}
- Location: ${profile.location || 'not set'}
- Remote only: ${profile.remoteOnly ? 'yes' : 'no'}
- Languages: ${profile.languages.join(', ') || 'not set'}
- Salary target: ${profile.salaryMin ? `€${profile.salaryMin}` : 'n/a'} – ${profile.salaryMax ? `€${profile.salaryMax}` : 'n/a'}

CV excerpt:
${(profile.cvText || 'No CV text').slice(0, 2500)}

Vacancy:
Company: ${job.company}
Title: ${job.title}
Location: ${job.location || 'not set'}
Remote: ${job.remote ? 'yes' : 'no'}
Salary: ${job.salaryMin ? `€${job.salaryMin}` : ''} ${job.salaryMax ? `– €${job.salaryMax}` : ''}

Description:
${job.description.slice(0, 2500)}

${job.requirements ? `Requirements:\n${job.requirements.slice(0, 1000)}` : ''}`;

  return [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userPrompt },
  ];
}

export function buildCoverLetterMessages(profile: UserProfile, job: JobData): LLMMessage[] {
  const systemPrompt = `You write cover letters for one candidate.

Rules:
- 3 short paragraphs, 120–200 words. Plain prose. No bullet lists, no bold, no emoji.
- Sound like a person. Do not use "I am excited to apply", "I am confident that", "passionate", "leverage", "fast-paced environment", or "I believe I would be a great fit".
- Do not list a stack of technologies. Use one concrete story tied to the company's product.
- Never invent facts, numbers, projects, or technologies that are not in the profile.
- Do not mention skill gaps and do not apologise for them.
- If a fact is missing, leave it out.
- Sign with the candidate's first name only if it appears in the profile. Otherwise end without a surname you were not given.

${profile.writingRules ? `Candidate writing rules:\n${profile.writingRules.slice(0, 4000)}` : ''}`;

  const userPrompt = `Profile:
${(profile.cvText || 'No CV text provided.').slice(0, 4000)}

Skills: ${profile.skills.join(', ')}
Do not claim: ${profile.skillGaps.join(', ') || 'n/a'}

Job:
Company: ${job.company}
Title: ${job.title}
Location: ${job.location || 'not set'}
Description:
${job.description.slice(0, 2000)}

Write the letter.`;

  return [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userPrompt },
  ];
}

const fallbackMatch: JobMatchResult = {
  score: 0,
  reasons: ['The model did not return a usable score.'],
  redFlags: ['Match failed and was not guessed.'],
  priority: 'low',
};

export async function matchJob(
  llmClient: ChatClient,
  profile: UserProfile,
  job: JobData,
): Promise<JobMatchResult> {
  const response = await llmClient.chat(buildMatchMessages(profile, job), {
    temperature: 0.2,
    maxTokens: 800,
  });

  try {
    return parseMatchResponse(response.content);
  } catch (error) {
    console.error('Error parsing match result:', error);
    return fallbackMatch;
  }
}

export async function generateCoverLetter(
  llmClient: ChatClient,
  profile: UserProfile,
  job: JobData,
): Promise<string> {
  const response = await llmClient.chat(buildCoverLetterMessages(profile, job), {
    temperature: 0.7,
    maxTokens: 700,
  });
  return response.content.trim();
}
