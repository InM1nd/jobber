import axios from 'axios';
import { JobSource, RawJob, JobSourceConfig } from './types';
import { looksRemote, stripHtml } from './html';

function tag(block: string, name: string): string {
  const match = block.match(new RegExp(`<${name}[^>]*>([\\s\\S]*?)</${name}>`, 'i'));
  if (!match) return '';
  return match[1].replace(/^<!\[CDATA\[/, '').replace(/\]\]>$/, '').trim();
}

export function parsePersonioXml(xml: string, company: string): RawJob[] {
  const blocks = xml.split(/<position>/i).slice(1);
  return blocks.map((block) => {
    const id = tag(block, 'id');
    const title = stripHtml(tag(block, 'name'));
    const office = stripHtml(tag(block, 'office'));
    const descriptions = [...block.matchAll(/<value>([\s\S]*?)<\/value>/gi)].map((match) =>
      stripHtml(match[1].replace(/^<!\[CDATA\[/, '').replace(/\]\]>$/, '')),
    );
    return {
      externalId: id || title,
      title: title || 'Untitled',
      location: office || undefined,
      remote: looksRemote(office) || looksRemote(descriptions.join(' ')),
      description: descriptions.join('\n\n'),
      url: `https://${company.toLowerCase().replace(/[^a-z0-9]+/g, '')}.jobs.personio.de/job/${id}`,
      postedAt: undefined,
    };
  }).filter((job) => job.externalId);
}

export class PersonioSource implements JobSource {
  constructor(private config: JobSourceConfig) {}

  async fetch(): Promise<RawJob[]> {
    const response = await axios.get(this.config.sourceUrl, { timeout: 20000, responseType: 'text' });
    return parsePersonioXml(String(response.data), this.config.company);
  }
}
