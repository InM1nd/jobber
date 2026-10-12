import { handleMcp } from '@/lib/agent/mcp';

export const instant = false;
export const maxDuration = 60;

type Ctx = { params: Promise<{ token: string }> };
const h = async (request: Request, { params }: Ctx) => handleMcp(request, (await params).token);
export { h as GET, h as POST, h as DELETE, h as HEAD, h as OPTIONS };
