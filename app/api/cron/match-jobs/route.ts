import { NextRequest, NextResponse } from 'next/server';
import { getPrisma } from '@/lib/db/prisma';
import { decryptApiKey } from '@/lib/crypto/encryption';
import { createLLMClient } from '@/lib/llm/provider';
import { matchJob } from '@/lib/llm/matcher';

export const maxDuration = 60;

const BATCH_SIZE = 10;

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization');
  
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const users = await getPrisma().user.findMany({
      where: {
        profile: {
          isNot: null,
        },
      },
      include: {
        profile: true,
        apiKeys: {
          where: { isActive: true },
          take: 1,
        },
      },
      take: 5,
    });

    let totalMatches = 0;

    for (const user of users) {
      if (!user.profile || user.apiKeys.length === 0) {
        continue;
      }

      const apiKey = user.apiKeys[0];
      const decryptedKey = decryptApiKey(
        apiKey.encryptedKey,
        apiKey.iv,
        apiKey.authTag
      );

      const llmClient = await createLLMClient({
        provider: apiKey.provider as any,
        apiKey: decryptedKey,
      });

      const unmatchedJobs = await getPrisma().job.findMany({
        where: {
          isActive: true,
          matches: {
            none: {
              userId: user.id,
            },
          },
        },
        include: {
          source: true,
        },
        orderBy: {
          createdAt: 'desc',
        },
        take: BATCH_SIZE,
      });

      for (const job of unmatchedJobs) {
        try {
          const matchResult = await matchJob(
            llmClient,
            {
              cvText: user.profile.cvText || undefined,
              skills: user.profile.skills,
              location: user.profile.location || undefined,
              remoteOnly: user.profile.remoteOnly,
              languages: user.profile.languages,
              salaryMin: user.profile.salaryMin || undefined,
              salaryMax: user.profile.salaryMax || undefined,
              stackKeywords: user.profile.stackKeywords,
              skillGaps: user.profile.skillGaps,
            },
            {
              title: job.title,
              company: job.source.company,
              location: job.location || undefined,
              remote: job.remote,
              description: job.description,
              requirements: job.requirements || undefined,
              salaryMin: job.salaryMin || undefined,
              salaryMax: job.salaryMax || undefined,
            }
          );

          await getPrisma().jobMatch.create({
            data: {
              userId: user.id,
              jobId: job.id,
              score: matchResult.score,
              reasons: matchResult.reasons,
              redFlags: matchResult.redFlags,
              priority: matchResult.priority,
            },
          });

          totalMatches++;
        } catch {
          console.error(`Error matching job ${job.id} for user ${user.id}`);
        }
      }
    }

    return NextResponse.json({
      message: 'Matching complete',
      users: users.length,
      matches: totalMatches,
    });
  } catch {
    console.error('Match cron error');
    return NextResponse.json(
      { error: 'Failed to match jobs' },
      { status: 500 }
    );
  }
}
