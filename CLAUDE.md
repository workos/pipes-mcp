# CLAUDE.md

## Project Overview

Pipes MCP is a standalone Next.js MCP server that provides session-scoped, authenticated access to third-party APIs (Linear, Notion, Snowflake) via WorkOS Pipes. Extracted from the `pipes-studio` package in `workos-studio`.

The core idea: **AI that can take action, safe by default via session-scoped authority.** Assistants reuse current broad session access when it already covers the task, request broad `read` or `write` access when needed, and only use exact-call approval when the user explicitly asks for it.

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

## Tool Reference

### Meta tools

| Tool | Purpose |
|------|---------|
| `whoami` | Returns authenticated user info. |
| `server_info` | Server documentation and usage instructions. |

### Authority tools

| Tool | Purpose |
|------|---------|
| `request_elevated_access` | Create a broad session-access request or one exact-call approval. Input: `{ kind, level?, providers?, url?, method?, body?, reason? }` |
| `check_access_request` | Poll the status of an access request. Input: `{ requestId }` |

### Integration tools

| Tool | Access Level | Purpose |
|------|-------------|---------|
| `list_integrations` | read | Check which integrations are connected |
| `connect_integration` | read | Generate OAuth URL for connecting a provider. Input: `{ slug }` |
| `call_integration_api` | **dynamic** | Call provider APIs. GET + GraphQL queries = read; POST/PATCH/DELETE + GraphQL mutations = write (requires broad write access or a matching request approval) |

### Read vs Write

- **Read** (5 min broad access): GET requests, GraphQL queries, and all read-only integration tools
- **Write** (5 min broad access): POST/PATCH/DELETE (REST) and GraphQL mutations
- **Per-request approval** (5 min single-use): one exact API request, used only when the user explicitly wants exact-call approval

Calls outside the current access grant return an authorization error telling the assistant to request the right access first.

## Key Patterns

**Session model:** Sessions are keyed by the AuthKit JWT `sid` claim and organization ID. Each session can have one active broad grant plus one active request-specific grant.

**Broad access first:** The intended assistant flow is `whoami` → reuse current broad access if it already covers the task → otherwise call `request_elevated_access(kind: "session", level: "read" | "write")`.

**Per-request approval only on demand:** Use `request_elevated_access(kind: "call", ...)` only when the user explicitly wants exact-call approval. `call_integration_api` checks broad access first, then falls back to the request-specific approval when a `requestId` is supplied.

**Session enforcement in tools:** Each tool handler calls `enforceSession(authInfo)` to extract the session and enforce provider-scoped access.

**Provider tokens never reach the client.** All API calls are made server-side via `makeAuthenticatedRequest()` after token injection from WorkOS Pipes.

**Audit every decision.** Every tool execution emits a structured log: allowed, denied (wrong mode / no session), or errored (runtime failure). Session lifecycle (start/end/expire) is also logged.

## Key Files

```
app/[transport]/route.ts              # MCP entry point and tool registration
lib/mcp/session.ts                    # Session facade and grant lifecycle
lib/mcp/audit-log.ts                  # Structured JSON audit logging
lib/mcp/tools/authority-tools.ts      # request_elevated_access and check_access_request
lib/mcp/tools/integration-tools.ts    # Integration discovery and request execution tools
lib/mcp/with-authkit.ts               # JWT verification via WorkOS AuthKit
lib/mcp/token-injection.ts            # WorkOS Pipes token fetch + header injection
lib/mcp/provider-detection.ts         # URL domain → provider mapping
lib/mcp/bridge-types.ts               # Shared types and error classes
lib/mcp/bridge-handlers/status.ts     # Integration status from WorkOS API
lib/workos-client.ts                  # Lazy-initialized WorkOS client singleton
```

## Origin

Extracted from `packages/pipes-studio/` in the `workos-studio` monorepo. Stripped: Slack bot, LangChain agent, cover image generation, `@workos-inc/agents` dependency. Added: session layer, audit logging, read/write gating.
