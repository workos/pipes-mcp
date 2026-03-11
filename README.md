# Pipes MCP Template

A starter template for building an MCP server with human-approved, provider-scoped access to third-party APIs using [WorkOS Pipes](https://workos.com/docs/pipes).

Use this as a starting point to build your own MCP server that lets AI assistants securely interact with services like Linear, Notion, Snowflake, and more — with a human always in the loop.

## What's included

- **Human-in-the-loop approval flow** — AI assistants request access, humans approve via a browser-based consent screen
- **Provider-scoped authority** — humans select exactly which integrations to authorize (not all-or-nothing)
- **Time-limited sessions** — authority expires after 5 minutes, configurable
- **Read/write gating** — read and write operations are gated separately
- **Approval polling** — assistants poll for results and receive user instructions
- **Audit logging** — structured JSON logs for every tool call and authority change
- **Redis-backed sessions** — sessions and approval state persist across restarts

## The approval flow

```
AI Assistant                    This Server                    Human
     │                              │                            │
     ├─ request_pipes_authority ───►│                            │
     │  (reason, providers)         │                            │
     │◄──── approval URL + ID ──────┤                            │
     │                              │                            │
     │  "Open this URL"             │                            │
     │─────────────────────────────────────────────────────────►│
     │                              │                            │
     │                              │◄── select providers ───────┤
     │                              │◄── add notes (optional) ──┤
     │                              │◄── approve / deny ─────────┤
     │                              │                            │
     ├─ get_approval_status ──────►│                            │
     │◄──── approved + providers ──┤                            │
     │◄──── user instructions ─────┤                            │
     │                              │                            │
     ├─ call_integration_api ─────►│                            │
     │◄──── API response ──────────┤                            │
```

## Quick start

### Prerequisites

- Node.js 20+
- [pnpm](https://pnpm.io/)
- Redis
- A [WorkOS](https://workos.com) account with AuthKit and Pipes configured

### 1. Install dependencies

```bash
pnpm install
```

### 2. Start Redis

Redis is required for session and approval state storage.

```bash
# macOS (Homebrew)
brew install redis
brew services start redis

# Docker
docker run -d -p 6379:6379 redis

# Or run directly
redis-server
```

Verify it's running:

```bash
redis-cli ping
# PONG
```

### 3. Configure environment

```bash
cp .env.local.example .env.local
```

Fill in your values:

```bash
WORKOS_API_KEY=sk_test_...
WORKOS_CLIENT_ID=client_...
WORKOS_COOKIE_PASSWORD=<generate with: openssl rand -base64 32>
WORKOS_REDIRECT_URI=http://localhost:5711/callback
AUTHKIT_DOMAIN=auth.workos.com
REDIS_URL=redis://127.0.0.1:6379
```

Optional tuning:

```bash
SESSION_TTL_MS=604800000          # Session store TTL (default: 7 days)
SESSION_AUTHORITY_TTL_MS=300000   # Authority expiry (default: 5 minutes)
```

### 4. Start the dev server

```bash
pnpm dev
```

The server starts at `http://localhost:5711`.

## Connecting an MCP client

Point your MCP client (Claude Code, Claude Desktop, Cursor, etc.) at the server URL. The server uses Streamable HTTP transport at `http://localhost:5711/mcp`.

## Adding a new provider

1. Add the provider's API domain mapping in `lib/mcp/providers/`
2. Add token injection logic in `lib/mcp/token-injection.ts` if the provider uses non-standard auth headers
3. Configure the integration in your WorkOS dashboard

The `call_integration_api` tool auto-detects the provider from the API URL domain and injects the correct authentication headers.

## Project structure

```
app/
  [transport]/route.ts            # MCP entry point (Streamable HTTP)
  approve/                        # Human approval UI
    page.tsx                      #   Consent screen
    approval-form.tsx             #   Interactive form (client component)
    actions.ts                    #   Approve/deny server actions
    validate-approval.ts          #   Token validation

lib/mcp/
  session.ts                      # Session model and authority management
  session-store.ts                # Redis persistence
  approval-token.ts               # JWE token creation/decryption
  audit-log.ts                    # Structured audit logging
  with-authkit.ts                 # JWT verification via WorkOS AuthKit
  token-injection.ts              # Provider auth token injection
  tools/
    authority-tools.ts            # request/poll/release authority
    integration-tools.ts          # call_integration_api + discovery tools
    meta-tools.ts                 # whoami, server info
```

## Redis keys

| Key pattern | Data | TTL |
|-------------|------|-----|
| `pipes:mcp:session:{sid}` | Session state (authority, providers, pending approval) | 7 days |
| `pipes:mcp:approval-token:{jti}` | One-time token consumption guard | 5 min |
| `pipes:mcp:approval-result:{id}` | Approval outcome (approved/denied, providers, notes) | 5 min |

## Development

```bash
pnpm dev          # Start dev server (Turbopack)
pnpm typecheck    # Type check
pnpm lint         # Lint (Biome)
pnpm format       # Format (Biome)
```
