# Jobber MCP server (stdio)

Gives Claude (Desktop or Code) access to Alexander's Jobber tracker through the private agent API.

Tools:
- `list_applications` — filters: `status` (comma list: To apply, Check listing, Applied, On hold, Rejected, Skip, Interview, Offer), `q`, `company`, `role`, `url`, `updatedSince`, `limit`
- `get_application` — `id`
- `upsert_application` — create/update (dedup by URL, then company+role). **Needs write access**
- `update_status` — `id`, `status`, optional `appliedAt`, `followUpAt`, `appendNote`. **Needs write access**

The Claude key (`AGENT_API_KEY_CLAUDE`) is **read-only** by default: write tools return a clear "read-only" error and change nothing. To allow writes, set `AGENT_API_KEY_CLAUDE_WRITE=true` in Vercel (production) and redeploy. To revoke Claude entirely, delete `AGENT_API_KEY_CLAUDE` in Vercel and redeploy; the assistant's own key (`AGENT_API_KEY`) is unaffected.

## Install (from a clone of the repo)

```bash
git clone https://github.com/InM1nd/jobber.git
cd jobber/mcp
npm i && npm run build      # creates dist/index.js
pwd                         # note the absolute path, e.g. /Users/alex/code/jobber/mcp
which node                  # e.g. /usr/local/bin/node or /opt/homebrew/bin/node (Node 18+)
```

Env vars:
- `JOBBER_API_URL` — `https://jobber-check.vercel.app` (default)
- `JOBBER_API_KEY` — the Claude key (see "Getting the key")

## Claude Desktop

Settings → Developer → Edit Config (`claude_desktop_config.json`; macOS: `~/Library/Application Support/Claude/`, Windows: `%APPDATA%\Claude\`):

```json
{
  "mcpServers": {
    "jobber": {
      "command": "/opt/homebrew/bin/node",
      "args": ["/Users/alex/code/jobber/mcp/dist/index.js"],
      "env": {
        "JOBBER_API_URL": "https://jobber-check.vercel.app",
        "JOBBER_API_KEY": "<paste the Claude key>"
      }
    }
  }
}
```

Restart Claude Desktop. Ask: "List my Applied jobs in Jobber with follow-ups due."

## Claude Code

```bash
claude mcp add jobber \
  -e JOBBER_API_URL=https://jobber-check.vercel.app \
  -e JOBBER_API_KEY=<paste the Claude key> \
  -- node /Users/alex/code/jobber/mcp/dist/index.js
claude mcp list        # should show jobber ✓ connected
```

(Add `--scope user` to make it available in every project.)

## Raw API (curl)

```bash
KEY=<the Claude key>; BASE=https://jobber-check.vercel.app/api/agent
curl -s "$BASE/applications?status=Applied&limit=20" -H "Authorization: Bearer $KEY"
curl -s "$BASE/applications/<id>" -H "Authorization: Bearer $KEY"
curl -s -X POST "$BASE/applications" -H "Authorization: Bearer $KEY" -H 'content-type: application/json' \
  -d '{"company":"Example","role":"Frontend Engineer"}'     # → 403 read_only unless writes are enabled
```

## Getting the key

- The key is stored on the Grok Bot box at `/workspace/.jobber_claude_api_key` (chmod 600) and in Vercel as `AGENT_API_KEY_CLAUDE` (sensitive, so Vercel won't display it). It is never printed in chats or logs.
- Ask Grok Bot to hand it over securely (e.g. as a one-off file copied to your own computer), or
- generate your own: `openssl rand -hex 32`, set it as `AGENT_API_KEY_CLAUDE` in Vercel → Project → Settings → Environment Variables (Production), redeploy, and use that value. The old key stops working immediately after the redeploy.
