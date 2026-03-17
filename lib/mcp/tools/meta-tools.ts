/**
 * Meta Tools
 *
 * MCP tools for user info and server documentation.
 * `whoami` and `server_info` need no session.
 */

import { getAllProviders } from "@/lib/mcp/providers";
import {
  extractSid,
  getSession,
  getSessionAuthority,
  getSessionAuthorityExpiresAt,
  getSessionProviders,
} from "@/lib/mcp/session";
import { requireMcpAuthInfo } from "@/lib/mcp/with-authkit";
import { toolResult } from "./tool-helpers";

export function registerMetaTools(server: any): void {
  // whoami — returns authenticated user information
  server.registerTool(
    "whoami",
    {
      title: "Who Am I",
      description:
        "Returns information about the authenticated user. Does not require a session.",
      inputSchema: {},
    },
    async (
      _params: any,
      { authInfo }: { authInfo?: Parameters<typeof requireMcpAuthInfo>[0] },
    ) => {
      const auth = requireMcpAuthInfo(authInfo);

      let response =
        `**Authenticated User Information**\n\n` +
        `**Email:** ${auth.extra.userEmail}\n` +
        `**User ID:** ${auth.extra.userId}\n` +
        `**Organization ID:** ${auth.extra.organizationId}\n`;

      // Include current authority scope if a session exists
      const sid = extractSid(auth);
      if (sid) {
        const session = await getSession(sid, auth.extra.organizationId);
        const authority = session ? getSessionAuthority(session) : "none";
        if (session && authority !== "none") {
          const expiresInSec = Math.round(
            ((getSessionAuthorityExpiresAt(session) ?? Date.now()) -
              Date.now()) /
              1000,
          );
          const providers = getSessionProviders(session);
          response +=
            `\n**Authority:** ${authority}\n` +
            `**Providers:** ${providers.length > 0 ? providers.join(", ") : "none"}\n` +
            `**Expires in:** ${expiresInSec} seconds\n`;
        } else {
          response += `\n**Authority:** none\n`;
        }

        if (session?.activeRequestGrant) {
          const requestExpiresInSec = Math.max(
            0,
            Math.round(
              (session.activeRequestGrant.expiresAt - Date.now()) / 1000,
            ),
          );
          response +=
            `\n**Active Request Grant:** ${session.activeRequestGrant.status}\n` +
            `**Request Authority:** ${session.activeRequestGrant.authority}\n` +
            `**Request Provider:** ${session.activeRequestGrant.providers.join(", ")}\n` +
            `**Request:** ${session.activeRequestGrant.request.method} ${session.activeRequestGrant.request.url}\n` +
            `**Request Expires in:** ${requestExpiresInSec} seconds\n`;
        }
      }

      return toolResult(response);
    },
  );

  // server_info — server documentation (no session required)
  server.registerTool(
    "server_info",
    {
      title: "Server Info",
      description:
        "REQUIRED: Read this first before using any integration tools. Get complete information about this MCP server, access model, and available integrations.",
      inputSchema: {},
    },
    async (_params: any) => {
      const providers = getAllProviders();
      const integrationsList = providers.map((p) => p.displayName).join(", ");

      return toolResult(`# WorkOS Pipes MCP Server

## Access Model

Authority is **provider-scoped** — the human approver selects which integrations to authorize.

### Access Levels
- **none**: authenticated but no active Pipes authority
- **read** (5min TTL): GET requests, GraphQL queries
- **write** (5min TTL): POST, PUT, PATCH, DELETE, GraphQL mutations

## Supported Integrations

${integrationsList}

## Tools

- \`whoami\` — check current user and authority
- \`list_integrations\` — see which integrations are connected
- \`connect_integration\` — generate OAuth URL for a missing integration
- \`request_elevated_access\` — request read/write authority (returns approval URL)
- \`check_access_request\` — poll approval status; returns provider instructions and user instructions when approved
- \`call_integration_api\` — make authenticated API calls (provider auto-detected from URL)
`);
    },
  );
}
