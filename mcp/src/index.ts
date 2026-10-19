#!/usr/bin/env node
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';

const BASE = (process.env.JOBBER_API_URL || 'https://jobber-check.vercel.app').replace(/\/+$/, '');
const KEY = process.env.JOBBER_API_KEY || '';

type Result = { content: Array<{ type: 'text'; text: string }>; isError?: boolean };
const text = (t: string, isError = false): Result => ({ content: [{ type: 'text', text: t }], ...(isError ? { isError: true } : {}) });

async function api(method: string, path: string, body?: unknown): Promise<Result> {
  if (!KEY) return text('JOBBER_API_KEY is not set in the MCP server env.', true);
  let res: Response;
  try {
    res = await fetch(`${BASE}/api/agent${path}`, {
      method,
      headers: { authorization: `Bearer ${KEY}`, ...(body ? { 'content-type': 'application/json' } : {}) },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(60_000),
    });
  } catch (e) {
    return text(`Network error calling Jobber: ${e instanceof Error ? e.message : String(e)}`, true);
  }
  const raw = await res.text();
  let data: unknown = raw;
  try { data = JSON.parse(raw); } catch {}
  if (res.status === 403) return text('Write access denied: this Jobber key is read-only. Ask Alexander to enable AGENT_API_KEY_CLAUDE_WRITE=true in Vercel if writes are wanted. Nothing was changed.', true);
  if (res.status === 401) return text('Unauthorized: the Jobber API key is wrong or has been revoked.', true);
  if (!res.ok) return text(`Jobber API error ${res.status}: ${typeof data === 'string' ? data.slice(0, 500) : JSON.stringify(data)}`, true);
  return text(JSON.stringify(data, null, 2));
}

const STATUS = 'To apply | Check listing | Applied | On hold | Rejected | Skip | Interview | Offer';
const server = new McpServer({ name: 'jobber', version: '0.1.0' });

server.registerTool(
  'list_applications',
  {
    description: `List Alexander's job applications from the Jobber tracker. Filter by status (comma list of: ${STATUS}), free text q (company/role), exact company+role (dedup lookup), url, updatedSince (ISO date), limit (default 100, max 1000).`,
    inputSchema: {
      status: z.string().optional(),
      q: z.string().optional(),
      company: z.string().optional(),
      role: z.string().optional(),
      url: z.string().optional(),
      updatedSince: z.string().optional(),
      limit: z.number().int().min(1).max(1000).optional(),
    },
  },
  async (args) => {
    const sp = new URLSearchParams();
    for (const [k, v] of Object.entries({ ...args, limit: args.limit ?? 100 })) if (v !== undefined && v !== '') sp.set(k, String(v));
    return api('GET', `/applications?${sp}`);
  },
);

server.registerTool(
  'get_application',
  { description: 'Get one tracker application by id (all fields: status, dates, whyFit, risks, notes, next action, saved application-form drafts).', inputSchema: { id: z.string() } },
  async ({ id }) => api('GET', `/applications/${encodeURIComponent(id)}`),
);

server.registerTool(
  'upsert_application',
  {
    description: `Create or update a tracker application (dedup by normalized URL, then company+role). Requires write access; read-only keys get a clear error. Status: ${STATUS}. Dates YYYY-MM-DD. Omitted fields stay unchanged.`,
    inputSchema: {
      company: z.string(), role: z.string(),
      location: z.string().optional(), url: z.string().optional(), source: z.string().optional(),
      priority: z.enum(['High', 'Medium', 'Low']).optional(), score: z.number().min(0).max(100).optional(),
      whyFit: z.string().optional(), risks: z.string().optional(), nextAction: z.string().optional(), notes: z.string().optional(),
      status: z.string().optional(), appliedAt: z.string().optional(), followUpAt: z.string().optional(),
    },
  },
  async (args) => api('POST', '/applications', args),
);

server.registerTool(
  'update_status',
  {
    description: `Change an application's status (${STATUS}), optionally appliedAt/followUpAt (YYYY-MM-DD) and appendNote. Requires write access.`,
    inputSchema: { id: z.string(), status: z.string(), appliedAt: z.string().optional(), followUpAt: z.string().optional(), appendNote: z.string().optional() },
  },
  async ({ id, ...rest }) => api('PATCH', `/applications/${encodeURIComponent(id)}`, rest),
);

await server.connect(new StdioServerTransport());
