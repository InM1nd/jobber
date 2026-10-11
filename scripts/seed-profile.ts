import { PrismaClient } from '@prisma/client';
import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';

const prisma = new PrismaClient();

async function main() {
  console.log('Seeding owner profile...');

  const profilePath = path.join(process.cwd(), 'seed-data', 'alexander_profile.md');
  const rulesPath = path.join(process.cwd(), 'seed-data', 'job_search_rules.md');
  const watchlistPath = fs.existsSync(path.join(process.cwd(), 'seed-data', 'company_watchlist.json'))
    ? path.join(process.cwd(), 'seed-data', 'company_watchlist.json')
    : path.join(process.cwd(), 'examples', 'company_watchlist.json');

  const hasProfile = fs.existsSync(profilePath) && fs.existsSync(rulesPath);
  if (!hasProfile) {
    console.log('No local profile in seed-data/. Seeding job sources only.');
    console.log('Copy your profile and writing rules into seed-data/ to seed the owner account.');
  }

  const ownerTelegramId = process.env.OWNER_TELEGRAM_ID?.trim() || '';
  const inviteCode = process.env.SEED_INVITE_CODE || `jobber-${crypto.randomBytes(3).toString('hex')}`;

  let user = ownerTelegramId
    ? await prisma.user.findUnique({
        where: { telegramId: ownerTelegramId },
        include: { profile: true },
      })
    : null;

  if (!user && ownerTelegramId) {
    user = await prisma.user.create({
      data: {
        email: `tg${ownerTelegramId}@users.jobber.local`,
        telegramId: ownerTelegramId,
      },
      include: { profile: true },
    });
    console.log(`Created owner for Telegram id ${ownerTelegramId}`);
  }

  if (!user) {
    const invite = await prisma.inviteCode.findUnique({ where: { code: inviteCode } });
    if (invite?.usedBy) {
      user = await prisma.user.findUnique({
        where: { id: invite.usedBy },
        include: { profile: true },
      });
    }
  }

  await prisma.inviteCode.upsert({
    where: { code: inviteCode },
    create: {
      code: inviteCode,
      createdBy: user?.id || 'seed',
      expiresAt: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000),
    },
    update: {},
  });
  console.log(`Invite code: ${inviteCode}`);

  if (!hasProfile || !user) {
    await seedSources(watchlistPath);
    if (hasProfile && !user) {
      console.log('Profile files are present, but no owner Telegram account exists yet.');
      console.log('Set OWNER_TELEGRAM_ID, or open the Mini App with the invite above, then run seed again.');
    }
    return;
  }

  const profileText = fs.readFileSync(profilePath, 'utf-8');
  const writingRules = fs.readFileSync(rulesPath, 'utf-8');
  
  let watchedCompanies: string[] = [];
  if (fs.existsSync(watchlistPath)) {
    const watchlist = JSON.parse(fs.readFileSync(watchlistPath, 'utf-8'));
    watchedCompanies = watchlist.map((c: any) => c.company);
  }

  const profileData = {
    userId: user.id,
    cvText: profileText.slice(0, 50000),
    cvFileName: 'alexander_profile.md',
    skills: [
      'TypeScript',
      'JavaScript',
      'React',
      'Next.js',
      'Node.js',
      'PostgreSQL',
      'Prisma',
      'Tailwind CSS',
      'Figma',
      'UI/UX Design',
      'Zustand',
      'TanStack Query',
      'Vitest',
      'Playwright',
      'Vercel AI SDK',
    ],
    stackKeywords: [
      'Frontend',
      'Full Stack',
      'Product Engineer',
      'Design Engineer',
      'TypeScript',
      'React',
      'Next.js',
      'AI',
      'LLM',
      'B2B SaaS',
    ],
    skillGaps: [
      'Redux',
      'MobX',
      'Vue',
      'Angular',
      'GraphQL',
      'AWS CDK',
      'Storybook',
      'Go',
      'C#',
      '.NET',
      'Java',
      'Django',
      'Ruby on Rails',
    ],
    location: 'Vienna',
    remoteOnly: false,
    countryEligible: 'Austria',
    languages: ['English', 'German', 'Ukrainian', 'Russian'],
    salaryMin: 55000,
    salaryMax: 75000,
    writingRules,
    watchedCompanies,
  };

  if (user.profile) {
    await prisma.profile.update({
      where: { userId: user.id },
      data: profileData,
    });
    console.log('Updated existing profile');
  } else {
    await prisma.profile.create({
      data: profileData,
    });
    console.log('Created new profile');
  }

  await seedSources(watchlistPath);

  console.log('\nSeed complete.');
  console.log(`Owner Telegram id: ${user.telegramId || ownerTelegramId || 'the account that used the seed invite'}`);
}

async function seedSources(watchlistPath: string) {
  if (!fs.existsSync(watchlistPath)) {
    console.log('No watchlist file found.');
    return;
  }

  const watchlist = JSON.parse(fs.readFileSync(watchlistPath, 'utf-8'));
  const supported = new Set([
    'greenhouse', 'ashby', 'lever', 'workable', 'personio', 'recruitee',
    'remotive', 'rss', 'teamtailor', 'smartrecruiters',
  ]);

  for (const source of watchlist) {
    await prisma.jobSource.upsert({
      where: {
        company_sourceUrl: {
          company: source.company,
          sourceUrl: source.source_url,
        },
      },
      create: {
        company: source.company,
        sector: source.sector,
        sourceType: source.source_type,
        sourceUrl: source.source_url,
        careersUrl: source.careers_url,
        isActive: supported.has(source.source_type),
      },
      update: {
        sector: source.sector,
        sourceType: source.source_type,
        careersUrl: source.careers_url,
      },
    });
  }

  console.log(`Seeded ${watchlist.length} job sources from ${watchlistPath}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
