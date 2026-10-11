import axios from 'axios';
import Parser from 'rss-parser';
import { JobSource, RawJob, JobSourceConfig } from './types';
import { looksRemote, stripHtml } from './html';

const parser = new Parser();

/** Teamtailor feeds carry <tt:city>/<tt:country> per item; generic RSS uses categories. */
function teamtailorPlaces(xml: string) {
  const out: string[] = [];
  for (const m of xml.matchAll(/<item>([\s\S]*?)<\/item>/g)) {
    const city = m[1].match(/<tt:city>([^<]*)/)?.[1];
    const country = m[1].match(/<tt:country>([^<]*)/)?.[1];
    out.push([city, country].filter(Boolean).join(', '));
  }
  return out;
}

export async function parseJobRss(xml: string, company: string): Promise<RawJob[]> {
  const feed = await parser.parseString(xml);
  const places = xml.includes('<tt:') ? teamtailorPlaces(xml) : [];
  return (feed.items || []).map((item, index) => {
    const title = item.title || 'Untitled';
    const location = places[index] || item.categories?.join(', ');
    const link = item.link || item.guid || '';
    return {
      externalId: String(item.guid || item.link || `${company}-${index}`),
      title,
      location,
      remote: looksRemote(title) || looksRemote(location) || looksRemote(item.contentSnippet),
      description: stripHtml(item.content || item.contentSnippet || ''),
      url: link,
      postedAt: item.isoDate ? new Date(item.isoDate) : item.pubDate ? new Date(item.pubDate) : undefined,
    };
  }).filter((job) => job.url);
}

export class RssSource implements JobSource {
  constructor(private config: JobSourceConfig) {}

  async fetch(): Promise<RawJob[]> {
    const response = await axios.get(this.config.sourceUrl, { timeout: 20000, responseType: 'text' });
    return parseJobRss(String(response.data), this.config.company);
  }
}
