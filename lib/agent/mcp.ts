import { createHash, timingSafeEqual } from 'crypto';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js';
import { z } from 'zod';
import { getPrisma } from '@/lib/db/prisma';
import { getOwner, mapStatus, parseDate, serialize, upsertAgentJob } from '@/lib/agent/api';
import { listOwnerApplications } from '@/lib/agent/list';

const same = (a: string, b: string) => timingSafeEqual(createHash('sha256').update(a).digest(), createHash('sha256').update(b).digest());
const valid = (k?: string) => Boolean(k && k.length >= 24);

/** Auth for the remote MCP endpoint: secret URL token (MCP_URL_TOKEN) or Bearer AGENT_API_KEY_CLAUDE. */
export function mcpAuthorized(request: Request, urlToken?: string) {
  const tok = process.env.MCP_URL_TOKEN;
  if (urlToken && valid(tok) && same(urlToken, tok!)) return true;
  const claude = process.env.AGENT_API_KEY_CLAUDE;
  const h = request.headers.get('authorization') || '';
  const bearer = h.startsWith('Bearer ') ? h.slice(7).trim() : '';
  return Boolean(bearer && valid(claude) && same(bearer, claude!));
}

const STATUS = 'To apply | Check listing | Applied | On hold | Rejected | Skip | Interview | Offer';
type R = { content: Array<{ type: 'text'; text: string }>; isError?: boolean };
const out = (v: unknown): R => ({ content: [{ type: 'text', text: typeof v === 'string' ? v : JSON.stringify(v, null, 2) }] });
const err = (t: string): R => ({ content: [{ type: 'text', text: t }], isError: true });
const canWrite = () => process.env.AGENT_API_KEY_CLAUDE_WRITE === 'true';
const READ_ONLY = 'Write access denied: this Jobber connector is read-only (AGENT_API_KEY_CLAUDE_WRITE is not true). Nothing was changed.';

function buildServer(ownerId: string) {
  const server = new McpServer({ name: 'jobber', version: '0.2.0' });
  server.registerTool(
    'list_applications',
    {
      description: `List Alexander's job applications from the Jobber tracker. status = comma list of: ${STATUS}. q = text in company/role; company+role = exact dedup lookup; url; updatedSince (ISO); limit (default 100, max 1000).`,
      inputSchema: { status: z.string().optional(), q: z.string().optional(), company: z.string().optional(), role: z.string().optional(), url: z.string().optional(), updatedSince: z.string().optional(), limit: z.number().int().min(1).max(1000).optional() },
      annotations: { readOnlyHint: true },
    },
    async (args) => {
      const sp = new URLSearchParams();
      for (const [k, v] of Object.entries({ ...args, limit: args.limit ?? 100 })) if (v !== undefined && v !== '') sp.set(k, String(v));
      const rows = await listOwnerApplications(ownerId, sp);
      return out({ count: rows.length, items: rows.map(serialize) });
    },
  );
  server.registerTool(
    'get_application',
    { description: 'Get one tracker application by id (status, dates, whyFit, risks, notes, next action).', inputSchema: { id: z.string() }, annotations: { readOnlyHint: true } },
    async ({ id }) => {
      const a = await getPrisma().application.findFirst({ where: { id, userId: ownerId } });
      return a ? out({ application: serialize(a) }) : err('Not found');
    },
  );
  server.registerTool(
    'upsert_application',
    {
      description: `Create or update a tracker application (dedup by URL, then company+role). Needs write access. Status: ${STATUS}. Dates YYYY-MM-DD.`,
      inputSchema: {
        company: z.string(), role: z.string(), location: z.string().optional(), url: z.string().optional(), source: z.string().optional(),
        priority: z.enum(['High', 'Medium', 'Low']).optional(), score: z.number().min(0).max(100).optional(), whyFit: z.string().optional(),
        risks: z.string().optional(), nextAction: z.string().optional(), notes: z.string().optional(), status: z.string().optional(),
        appliedAt: z.string().optional(), followUpAt: z.string().optional(),
      },
    },
    async (args) => {
      if (!canWrite()) return err(READ_ONLY);
      const r = await upsertAgentJob(ownerId, { ...args, source: args.source ?? 'claude' });
      return 'error' in r ? err(r.error!) : out({ created: r.created, application: serialize(r.application!) });
    },
  );
  server.registerTool(
    'update_status',
    { description: `Change an application's status (${STATUS}), optional appliedAt/followUpAt (YYYY-MM-DD) and appendNote. Needs write access.`, inputSchema: { id: z.string(), status: z.string(), appliedAt: z.string().optional(), followUpAt: z.string().optional(), appendNote: z.string().optional() } },
    async ({ id, status, appliedAt, followUpAt, appendNote }) => {
      if (!canWrite()) return err(READ_ONLY);
      const prisma = getPrisma();
      const a = await prisma.application.findFirst({ where: { id, userId: ownerId } });
      if (!a) return err('Not found');
      const st = mapStatus(status);
      if (!st) return err(`Unknown status "${status}"`);
      const data: Record<string, unknown> = { status: st };
      const ap = parseDate(appliedAt); if (ap !== undefined) data.appliedAt = ap;
      const fu = parseDate(followUpAt); if (fu !== undefined) { data.followUpAt = fu; data.followUpSent = false; }
      if (st === 'applied' && !a.appliedAt && data.appliedAt === undefined) data.appliedAt = new Date();
      if (appendNote?.trim()) data.notes = [a.notes, appendNote.trim()].filter(Boolean).join('\n').slice(0, 8000);
      return out({ application: serialize(await prisma.application.update({ where: { id }, data })) });
    },
  );
  return server;
}

/** Stateless Streamable HTTP: a fresh server + transport per request. */
export async function handleMcp(request: Request, urlToken?: string) {
  if (!mcpAuthorized(request, urlToken)) return Response.json({ error: 'Not found' }, { status: 404 });
  if (request.method === 'GET' || request.method === 'DELETE') {
    return Response.json({ jsonrpc: '2.0', error: { code: -32000, message: 'Method not allowed (stateless server: use POST).' }, id: null }, { status: 405, headers: { allow: 'POST' } });
  }
  const owner = await getOwner();
  if (!owner) return Response.json({ error: 'Owner not found' }, { status: 500 });
  const transport = new WebStandardStreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
  const server = buildServer(owner.id);
  await server.connect(transport);
  try {
    return await transport.handleRequest(request);
  } finally {
    void server.close();
  }
}
