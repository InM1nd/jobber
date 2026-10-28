/**
 * "Write it with Claude": opens a new claude.ai chat with a short prompt that names a match by id.
 * Claude reads it through the Jobber connector (MCP) and saves the letter back, on the owner's
 * own Claude plan, so the shared Gemini budget isn't spent. Prompts stay short: long links break.
 * Idea from AienTech/dossier (connector handoff), written for Jobber.
 */

const valid = (k?: string) => Boolean(k && k.length >= 24);

/** The connector is set up (owner only). */
export function claudeConnectorOn(): boolean {
  return valid(process.env.MCP_URL_TOKEN) || valid(process.env.AGENT_API_KEY_CLAUDE);
}

export const claudeCanSave = () => process.env.AGENT_API_KEY_CLAUDE_WRITE === 'true';

export const claudeChatUrl = (prompt: string) => `https://claude.ai/new?q=${encodeURIComponent(prompt)}`;

export function claudeLetterPrompt(matchId: string, about: string, canSave = claudeCanSave()): string {
  const what = about ? `match ${matchId} (${about.slice(0, 80)})` : `match ${matchId}`;
  return (
    `Using my Jobber connector: write a cover letter for ${what}. ` +
    'Read the job with get_match and me with get_profile. Follow my writing rules and facts, use only what my CV and facts back, and don’t list a stack. ' +
    (canSave ? 'Then save it with save_cover_letter and tell me what the fact check flagged.' : 'Show me the letter.')
  );
}

export function claudeLetterUrl(matchId: string, about: string): string {
  return claudeChatUrl(claudeLetterPrompt(matchId, about));
}
