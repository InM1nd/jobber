import { NextRequest, NextResponse } from 'next/server';
import { getPrisma } from '@/lib/db/prisma';
import { ingestSource } from '@/lib/jobs/ingest';
import { sendDailyDigest } from '@/lib/telegram/bot';

export const maxDuration = 60;

const BATCH_SIZE = 5;

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization');
  
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    let cronJob = await getPrisma().cronJob.findUnique({
      where: { name: 'fetch-jobs' },
    });

    if (!cronJob) {
      cronJob = await getPrisma().cronJob.create({
        data: {
          name: 'fetch-jobs',
          currentBatch: 0,
          totalBatches: 0,
        },
      });
    }

    const sources = await getPrisma().jobSource.findMany({
      where: { isActive: true },
      skip: cronJob.currentBatch * BATCH_SIZE,
      take: BATCH_SIZE,
    });

    if (sources.length === 0) {
      await getPrisma().cronJob.update({
        where: { name: 'fetch-jobs' },
        data: {
          currentBatch: 0,
          lastRunAt: new Date(),
          lastStatus: 'success',
        },
      });

      const users = await getPrisma().user.findMany({
        where: { telegramId: { not: null } },
      });

      for (const user of users) {
        await sendDailyDigest(user.id);
      }

      return NextResponse.json({ 
        message: 'Cycle complete, sent digests',
        processed: 0,
      });
    }

    let totalJobs = 0;

    for (const source of sources) {
      totalJobs += await ingestSource(source);
    }

    await getPrisma().cronJob.update({
      where: { name: 'fetch-jobs' },
      data: {
        currentBatch: cronJob.currentBatch + 1,
        lastRunAt: new Date(),
        lastStatus: 'success',
      },
    });

    return NextResponse.json({
      message: 'Batch processed',
      batch: cronJob.currentBatch + 1,
      sources: sources.length,
      jobs: totalJobs,
    });
  } catch (error) {
    console.error('Cron job error:', error);
    
    await getPrisma().cronJob.update({
      where: { name: 'fetch-jobs' },
      data: {
        lastRunAt: new Date(),
        lastStatus: 'error',
        lastError: error instanceof Error ? error.message : 'Unknown error',
      },
    });

    return NextResponse.json(
      { error: 'Failed to fetch jobs' },
      { status: 500 }
    );
  }
}
