import crypto from 'crypto';
import { encryptApiKey } from '@/lib/crypto/encryption';

export interface DemoProfile {
  cvText: string | null;
  cvFileName: string | null;
  skills: string[];
  location: string | null;
  remoteOnly: boolean;
  countryEligible: string | null;
  languages: string[];
  salaryMin: number | null;
  salaryMax: number | null;
  stackKeywords: string[];
  skillGaps: string[];
  writingRules: string | null;
  watchedCompanies: string[];
}

export interface DemoMatch {
  id: string;
  score: number;
  priority: 'high' | 'medium' | 'low';
  reasons: string[];
  redFlags: string[];
  coverLetter: string | null;
  job: {
    id: string;
    title: string;
    company: string;
    sector: string | null;
    location: string | null;
    remote: boolean;
    url: string;
    description: string;
    salaryMin: number | null;
    salaryMax: number | null;
    currency: string | null;
    postedAt: string | null;
  };
}

export interface DemoApplication {
  id: string;
  company: string;
  role: string;
  url: string | null;
  status: string;
  appliedAt: string | null;
  followUpAt: string | null;
  followUpSent: boolean;
  contact: string | null;
  salaryExpectation: string | null;
  notes: string | null;
  coverLetter: string | null;
}

export interface DemoKey {
  id: string;
  provider: string;
  createdAt: string;
  encryptedKey: string;
  iv: string;
  authTag: string;
}

export interface DemoState {
  email: string;
  telegramId: string | null;
  telegramUsername: string | null;
  profile: DemoProfile;
  matches: DemoMatch[];
  applications: DemoApplication[];
  keys: DemoKey[];
  invites: string[];
}

const SAMPLE_LETTER = `I keep coming back to products where the interface is the product. Bitpanda's investing tools have to stay clear when the numbers underneath are not, which is the same constraint I work under when I design and ship product UI.

At a Vienna agency I take features from a Figma file through to production, including the small APIs behind them. I also built a rental search tool for Vienna that refuses to let a model fill in a cost unless it can quote the source.

I live in Vienna, I am happy with hybrid or office, and I can start on 1 November. English is my working language.

Oleksandr`;

function initialState(): DemoState {
  return {
    email: 'tg42@users.jobber.local',
    telegramId: '42',
    telegramUsername: 'oleksandr',
    profile: {
      cvText:
        'Product engineer in Vienna. Building web products since 2021, commercial frontend work since 2022. Strongest tools: TypeScript, React, Next.js, Node.js, PostgreSQL, and Figma. Currently at a Vienna agency until 31 October 2026, available from 1 November 2026. Wants Vienna office or hybrid, or remote with an Austrian contract. Working language: English. German A2.',
      cvFileName: 'local-profile.txt',
      skills: ['TypeScript', 'React', 'Next.js', 'Node.js', 'PostgreSQL', 'Prisma', 'Tailwind', 'Figma'],
      location: 'Vienna',
      remoteOnly: false,
      countryEligible: 'Austria',
      languages: ['English'],
      salaryMin: 60000,
      salaryMax: 75000,
      stackKeywords: ['Frontend', 'Product Engineer', 'Design Engineer', 'Full Stack'],
      skillGaps: ['Vue', 'Angular', 'Go', 'Java', 'GraphQL', 'Redux'],
      writingRules:
        '3 paragraphs, 120–200 words. No invented facts. No template phrases. One concrete story. Sign off with the first name only. Mention Vienna and a 1 November start when it fits.',
      watchedCompanies: ['Bitpanda', 'Storyblok', 'Linear', 'Sentry'],
    },
    matches: [
      {
        id: 'm1',
        score: 86,
        priority: 'high',
        reasons: [
          'Vienna hybrid frontend role on TypeScript and React.',
          'Product UI work matches the profile, without a stack from the gap list.',
        ],
        redFlags: ['Salary band is not published. Check it before applying.'],
        coverLetter: SAMPLE_LETTER,
        job: {
          id: 'j1',
          title: 'Frontend Engineer',
          company: 'Bitpanda',
          sector: 'Fintech',
          location: 'Vienna, Austria',
          remote: false,
          url: 'https://www.bitpanda.com/en/career',
          description:
            'Build customer-facing investing interfaces in Vienna. Hybrid. TypeScript, React, and close work with design. English is the working language.',
          salaryMin: null,
          salaryMax: null,
          currency: 'EUR',
          postedAt: new Date(Date.now() - 5 * 86400000).toISOString(),
        },
      },
      {
        id: 'm2',
        score: 74,
        priority: 'medium',
        reasons: ['Design-engineer shape: Figma plus production React.', 'CMS and content tooling sit close to existing work.'],
        redFlags: ['Confirm the contract can be based in Austria. Remote EU is not the same as remote Austria.'],
        coverLetter: null,
        job: {
          id: 'j2',
          title: 'Design Engineer',
          company: 'Storyblok',
          sector: 'Devtools',
          location: 'Remote, Europe',
          remote: true,
          url: 'https://www.storyblok.com/jobs',
          description:
            'Design and build the visual CMS product. Remote within Europe. React, TypeScript, and a strong eye for interface states.',
          salaryMin: 65000,
          salaryMax: 85000,
          currency: 'EUR',
          postedAt: new Date(Date.now() - 12 * 86400000).toISOString(),
        },
      },
      {
        id: 'm3',
        score: 61,
        priority: 'medium',
        reasons: ['Product engineer title and a small-team product surface.'],
        redFlags: ['Office is not in Vienna. Only consider if Austria-based remote is explicit.'],
        coverLetter: null,
        job: {
          id: 'j3',
          title: 'Product Engineer',
          company: 'Linear',
          sector: 'Productivity',
          location: 'Remote',
          remote: true,
          url: 'https://linear.app/careers',
          description: 'Product engineering on a fast interface. Remote. High bar for craft and TypeScript.',
          salaryMin: null,
          salaryMax: null,
          currency: null,
          postedAt: new Date(Date.now() - 20 * 86400000).toISOString(),
        },
      },
      {
        id: 'm4',
        score: 28,
        priority: 'low',
        reasons: ['The company is on the watchlist.'],
        redFlags: ['Core stack is Java and GraphQL, both on the skill-gap list.', 'Asks for 7+ years.'],
        coverLetter: null,
        job: {
          id: 'j4',
          title: 'Senior Backend Engineer, Java',
          company: 'Sentry',
          sector: 'Devtools',
          location: 'Vienna or remote',
          remote: true,
          url: 'https://sentry.io/careers/',
          description: 'Backend role. Java, GraphQL, and distributed systems. Seven or more years required.',
          salaryMin: null,
          salaryMax: null,
          currency: null,
          postedAt: new Date(Date.now() - 2 * 86400000).toISOString(),
        },
      },
    ],
    applications: [
      {
        id: 'a1',
        company: 'Bitpanda',
        role: 'Frontend Engineer',
        url: 'https://www.bitpanda.com/en/career',
        status: 'applied',
        appliedAt: new Date(Date.now() - 3 * 86400000).toISOString(),
        followUpAt: new Date(Date.now() + 4 * 86400000).toISOString(),
        followUpSent: false,
        contact: null,
        salaryExpectation: '€65k gross',
        notes: 'Sent the product-engineer CV. Letter mentions the Vienna rental tool.',
        coverLetter: SAMPLE_LETTER,
      },
      {
        id: 'a2',
        company: 'Example GmbH',
        role: 'Frontend Developer',
        url: null,
        status: 'to_apply',
        appliedAt: null,
        followUpAt: null,
        followUpSent: false,
        contact: null,
        salaryExpectation: null,
        notes: 'Check that the listing is still live.',
        coverLetter: null,
      },
    ],
    keys: [],
    invites: [],
  };
}

const globalStore = globalThis as unknown as { __jobberDemo?: DemoState };

function state(): DemoState {
  if (!globalStore.__jobberDemo) {
    globalStore.__jobberDemo = initialState();
  }
  return globalStore.__jobberDemo;
}

export const demoStore = {
  user() {
    const current = state();
    return {
      id: 'demo-user',
      email: current.email,
      telegramId: current.telegramId,
      telegramUsername: current.telegramUsername,
    };
  },
  profile() {
    return state().profile;
  },
  saveProfile(patch: Partial<DemoProfile>) {
    state().profile = { ...state().profile, ...patch };
    return state().profile;
  },
  matches() {
    return state().matches;
  },
  match(id: string) {
    return state().matches.find((match) => match.id === id) || null;
  },
  saveCoverLetter(id: string, letter: string) {
    const match = state().matches.find((item) => item.id === id);
    if (!match) return null;
    match.coverLetter = letter;
    return match;
  },
  applications() {
    return state().applications;
  },
  addApplication(input: Omit<DemoApplication, 'id' | 'followUpSent'> & { followUpSent?: boolean }) {
    const application: DemoApplication = {
      ...input,
      id: crypto.randomUUID(),
      followUpSent: input.followUpSent ?? false,
    };
    state().applications.unshift(application);
    return application;
  },
  updateApplication(id: string, patch: Partial<DemoApplication>) {
    const application = state().applications.find((item) => item.id === id);
    if (!application) return null;
    Object.assign(application, patch);
    return application;
  },
  keys() {
    return state().keys.map((key) => ({
      id: key.id,
      provider: key.provider,
      createdAt: key.createdAt,
    }));
  },
  activeKey() {
    return state().keys[0] || null;
  },
  saveKey(provider: string, apiKey: string) {
    const encrypted = encryptApiKey(apiKey);
    const record: DemoKey = {
      id: crypto.randomUUID(),
      provider,
      createdAt: new Date().toISOString(),
      ...encrypted,
    };
    state().keys = [record];
    return { id: record.id, provider, createdAt: record.createdAt };
  },
  deleteKey(id: string) {
    state().keys = state().keys.filter((key) => key.id !== id);
  },
  linkTelegram(telegramId: string, username?: string) {
    state().telegramId = telegramId;
    state().telegramUsername = username || null;
  },
  createInvite() {
    const code = `jobber-${crypto.randomBytes(3).toString('hex')}`;
    state().invites.push(code);
    return code;
  },
  invites() {
    return state().invites;
  },
};
