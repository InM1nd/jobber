import { handleMcp } from '@/lib/agent/mcp';

export const instant = false;
export const maxDuration = 60;

/** Same MCP endpoint with Authorization: Bearer AGENT_API_KEY_CLAUDE. */
const h = (request: Request) => handleMcp(request);
export { h as GET, h as POST, h as DELETE };
