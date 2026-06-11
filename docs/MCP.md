# Connect your agent to TutorRoom (MCP)

TutorRoom exposes itself as a **Model Context Protocol (MCP) server** over
**Streamable HTTP**, so external agents — Claude Code, Gemini CLI, Codex, or
anything that speaks MCP — can drive a teacher's studio: inspect students, record
observations, and generate lesson plans, homework, and progress briefs.

- **Endpoint:** `<base-url>/api/mcp`
  - Production: `https://tutorroom-759438277418.us-central1.run.app/api/mcp`
  - Local dev: `http://localhost:3000/api/mcp`
- **Transport:** Streamable HTTP (stateless). No SSE, no OAuth dance.
- **Auth:** `Authorization: Bearer <token>` (see [Tokens](#tokens)).

Every tool is **scoped to the authenticated teacher's own students** — an agent
can never see or touch another teacher's roster, and every `studentId` /
`documentId` is ownership-checked.

---

## Tokens

The bearer token takes one of two forms:

1. **Account credentials** — base64 of `email:password` for any TutorRoom
   account. Verified against the User table with bcrypt, exactly like the web
   login.

   ```bash
   # macOS/Linux
   printf 'you@example.com:your-password' | base64
   ```

2. **Demo token** — if the server has `TUTORROOM_MCP_DEMO_TOKEN` set, sending
   that raw value as the bearer token authenticates as the demo teacher
   (`demo@tutorroom.ai`). Handy for read-only demos without sharing a password.

For the seeded demo account the credentials token is:

```bash
printf 'demo@tutorroom.ai:TeachFlow!Demo2026' | base64
```

---

## Tools

| Tool | Args | Returns |
|------|------|---------|
| `list_students` | — | Your roster: id, name, level, languages, goals |
| `get_student` | `studentId` | Full profile + memory facts (category, fact, source, createdAt) |
| `save_observation` | `studentId`, `category` (`strength`\|`error`\|`interest`\|`note`\|`progress`), `fact` | The saved fact (source `teacher`) |
| `list_teaching_packs` | `studentId` | Artifacts for the student: id, kind, title, createdAt |
| `get_teaching_pack` | `documentId` | Latest content of one artifact |
| `create_lesson_plan` | `studentId`, `brief` | A personalized lesson-plan document (id, title). ~20–60s |
| `create_homework` | `studentId`, `brief` | An interactive homework set **+ a public `shareUrl`** the student can play in a browser, no login. ~20–60s |
| `get_progress_brief` | `studentId` | A parent/admin-ready progress brief (content). ~20–60s |

> `create_homework` returns a **public, student-shareable** `/s/<slug>` URL —
> hand it straight to the learner.

---

## Claude Code

```bash
claude mcp add --transport http tutorroom \
  https://tutorroom-759438277418.us-central1.run.app/api/mcp \
  --header "Authorization: Bearer $(printf 'demo@tutorroom.ai:TeachFlow!Demo2026' | base64)"
```

`-H` is shorthand for `--header`. To talk to a local dev server, swap the URL
for `http://localhost:3000/api/mcp`. Verify with `claude mcp list`, then ask
Claude e.g. "list my TutorRoom students".

## Gemini CLI

Add an `mcpServers` entry to `~/.gemini/settings.json`:

```json
{
  "mcpServers": {
    "tutorroom": {
      "httpUrl": "https://tutorroom-759438277418.us-central1.run.app/api/mcp",
      "headers": {
        "Authorization": "Bearer <base64 of demo@tutorroom.ai:TeachFlow!Demo2026>"
      }
    }
  }
}
```

`httpUrl` selects the Streamable HTTP transport. Replace the bearer value with
your own base64 (or the demo token). Restart the CLI; run `/mcp` to confirm the
`tutorroom` server and its tools are listed.

## Codex

Codex stores MCP config in `~/.codex/config.toml`. Streamable HTTP servers use a
`url` plus a bearer token read from an **environment variable**:

```toml
# Streamable HTTP support lives in the experimental rmcp client.
experimental_use_rmcp_client = true

[mcp_servers.tutorroom]
url = "https://tutorroom-759438277418.us-central1.run.app/api/mcp"
bearer_token_env_var = "TUTORROOM_TOKEN"
```

Then export the token before launching Codex:

```bash
export TUTORROOM_TOKEN="$(printf 'demo@tutorroom.ai:TeachFlow!Demo2026' | base64)"
codex
```

---

## Verify with raw curl

The server speaks JSON-RPC 2.0 over Streamable HTTP. Responses come back as
`text/event-stream`, so pass the right `Accept` header.

```bash
URL=http://localhost:3000/api/mcp/mcp
TOKEN=$(printf 'demo@tutorroom.ai:TeachFlow!Demo2026' | base64)

# initialize
curl -s "$URL" \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-06-18","capabilities":{},"clientInfo":{"name":"curl","version":"1"}}}'

# list tools
curl -s "$URL" \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"jsonrpc":"2.0","id":2,"method":"tools/list","params":{}}'

# call a tool
curl -s "$URL" \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"jsonrpc":"2.0","id":3,"method":"tools/call","params":{"name":"list_students","arguments":{}}}'
```

> The `[transport]` path segment is part of the route, so the full path is
> `/api/mcp/mcp` for the Streamable HTTP transport.

A missing or invalid bearer token returns an MCP tool error
("Unauthorized…") rather than leaking data.
