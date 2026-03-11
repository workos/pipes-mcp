# CLAUDE.md

## Project Overview

Pipes MCP is a standalone Next.js MCP server that provides session-scoped, authenticated access to third-party APIs (Linear, Notion, Snowflake) via WorkOS Pipes. Extracted from the `pipes-studio` package in `workos-studio`.

The core idea: **AI that can take action, safe by default via session-scoped authority.** Read access is implicit for authenticated users. Write operations require explicit elevation via `request_elevated_access`.

## Commands

```bash
pnpm dev          # Start dev server on localhost:5711 (Turbopack)
pnpm build        # Production build (requires .env.local)
pnpm typecheck    # tsc --noEmit
pnpm lint         # biome check
pnpm format       # biome format --write
```

## Environment Setup

Copy `.env.local.example` to `.env.local` and fill in:

```bash
WORKOS_API_KEY=sk_test_...
WORKOS_CLIENT_ID=client_...
WORKOS_COOKIE_PASSWORD=<openssl rand -base64 32>
WORKOS_REDIRECT_URI=http://localhost:5711/callback
AUTHKIT_DOMAIN=auth.workos.com
NEXT_PUBLIC_CONVEX_URL=https://your-deployment.convex.cloud
SERVER_API_SECRET=<shared secret for Convex HTTP actions>
# SESSION_TTL_READ_MS=3600000   (optional, default 60min)
# SESSION_TTL_WRITE_MS=900000   (optional, default 15min)
```

`AUTHKIT_DOMAIN` and `WORKOS_CLIENT_ID` are validated at module load time (`lib/mcp/with-authkit.ts`), so the build and dev server both require them.

## Architecture

### MCP Entry Point

`app/[transport]/route.ts` — Registers all tools via `createMcpHandler` from `mcp-handler`, wraps with `withMcpAuth` for JWT enforcement. Exports GET and POST handlers.

### Session Layer

`lib/mcp/session.ts` — In-memory `Map<string, Session>` store keyed by AuthKit JWT `sid` claim. Key functions:

- `extractSid(authInfo)` — extracts `sid` from JWT claims
- `getOrCreateSession(sid, userId, orgId?, email)` — lazy-init; returns existing or creates new read-only session
- `grantWriteAccess(sid)` — sets `writeAccess` with 15min TTL
- `revokeWriteAccess(sid)` — sets `writeAccess = null`
- `requireWriteMode(session)` — throws if no valid write access
- `hasWriteAccess(session)` — convenience check (auto-clears if expired)

Sessions are keyed by `authInfo.extra.claims.sid` — one per MCP client connection, automatically available in every request. No explicit session ID passing required.

`SessionError` codes: `NO_SESSION`, `SESSION_EXPIRED`, `WRITE_NOT_ALLOWED`.

### Auth

`lib/mcp/with-authkit.ts` — Verifies WorkOS AuthKit JWTs via JWKS. Fetches full user profile and org from WorkOS API. Returns `AuthInfo` with `extra.user`, `extra.organizationId`, `extra.claims` (including `sid`).

### Token Injection

`lib/mcp/token-injection.ts` — Fetches OAuth tokens from WorkOS Pipes (`pipes.getAccessToken`) and injects provider-specific headers (Bearer token, Notion-Version, Snowflake OAuth type).

### Provider Detection

`lib/mcp/provider-detection.ts` — Maps URL domains to providers:
- `api.linear.app` → linear
- `api.notion.com` → notion
- `*.snowflakecomputing.com` → snowflake

### Audit Logging

`lib/mcp/audit-log.ts` — Structured JSON lines to stdout with `_type: "pipes_mcp_audit"`. Events: `session.started`, `session.ended`, `session.expired`, `tool.allowed`, `tool.denied`, `tool.errored`. Supports optional `userAgent` and `clientIp` fields.

### Bridge Handlers

- `lib/mcp/bridge-handlers/status.ts` — Fetches integration status from WorkOS Pipes API
- `lib/mcp/bridge-handlers/instructions.ts` — Fetches org-specific instructions from Convex HTTP endpoint

## Tool Reference

### Meta tools (no elevation required)

| Tool | Purpose |
|------|---------|
| `request_elevated_access` | Elevate to write mode. Input: `{ level: "write" }`. Returns TTL info. |
| `release_elevated_access` | Release write access, return to read-only. No input. |
| `whoami` | Returns authenticated user info. |
| `get_mcp_server_info` | Server documentation and usage instructions. |

### Implicit read access (no params needed)

| Tool | Access Level | Purpose |
|------|-------------|---------|
| `get_integration_status` | read | Check which integrations are connected |
| `get_integration_instructions` | read | Fetch org-specific integration guidelines. Input: `{ integrationIds }` |
| `get_integration_authorization_url` | read | Generate OAuth URL for connecting a provider. Input: `{ slug }` |
| `call_integration_api` | **dynamic** | Call provider APIs. GET + GraphQL queries = read; POST/PATCH/DELETE + GraphQL mutations = write (requires elevation) |

### Read vs Write

- **Read** (implicit, session auto-created): GET requests, GraphQL queries, and all `get_*` tools
- **Write** (explicit elevation, 15min TTL): POST/PATCH/DELETE (REST) and GraphQL mutations

Write operations without elevation return: `"This operation requires write access."`

## Key Patterns

**Implicit sessions:** Sessions are keyed by the AuthKit JWT `sid` claim and lazily created on first tool call. No explicit `session_start` needed — read access is always available for authenticated users.

**Elevated access for writes:** Write operations require calling `request_elevated_access(level: "write")` first. Write access expires after 15 minutes (configurable via `SESSION_TTL_WRITE_MS`).

**Session enforcement in tools:** Each tool handler calls `enforceSession(authInfo, toolName)` which extracts the sid and lazy-creates the session. For writes, `requireWriteMode(session)` checks the elevation.

**Provider tokens never reach the client.** All API calls are made server-side via `makeAuthenticatedRequest()` after token injection from WorkOS Pipes.

**Audit every decision.** Every tool execution emits a structured log: allowed, denied (wrong mode / no session), or errored (runtime failure). Session lifecycle (start/end/expire) is also logged.

## Key Files

```
app/[transport]/route.ts              # MCP entry point, elevated access + meta tools
lib/mcp/session.ts                    # Session store, implicit read, write elevation
lib/mcp/audit-log.ts                  # Structured JSON audit logging
lib/mcp/tools/integration-tools.ts    # 4 integration tools (implicit session)
lib/mcp/with-authkit.ts               # JWT verification via WorkOS AuthKit
lib/mcp/token-injection.ts            # WorkOS Pipes token fetch + header injection
lib/mcp/provider-detection.ts         # URL domain → provider mapping
lib/mcp/bridge-types.ts               # Shared types and error classes
lib/mcp/bridge-handlers/status.ts     # Integration status from WorkOS API
lib/mcp/bridge-handlers/instructions.ts  # Org instructions from Convex
lib/workos-client.ts                  # Lazy-initialized WorkOS client singleton
```

## Origin

Extracted from `packages/pipes-studio/` in the `workos-studio` monorepo. Stripped: Slack bot, LangChain agent, cover image generation, `@workos-inc/agents` dependency. Added: session layer, audit logging, read/write gating.
