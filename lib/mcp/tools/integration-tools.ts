/**
 * Integration Tools Factory
 *
 * Creates MCP tools for interacting with integrated providers (Linear, Notion, Snowflake).
 * All tools use Pipes authority keyed by the AuthKit JWT `sid` claim.
 * Read and write operations require active authority.
 * For GraphQL APIs, mutations require write; queries are treated as read even though they use POST.
 */

import { z } from "zod";
import { auditLog } from "../audit-log";
import { handleGetStatus } from "../bridge-handlers/status";
import { NotConnectedError, UnsupportedProviderError } from "../bridge-types";
import { detectProviderFromUrl, getProvider } from "../providers";
import {
  requireProviderAccess,
  requireReadMode,
  requireWriteMode,
  SessionError,
} from "../session";
import {
  injectProviderAuth,
  makeAuthenticatedRequest,
} from "../token-injection";
import type { McpAuthInfo } from "../with-authkit";
import { isWriteRequest } from "../write-detection";
import {
  checkReadAccess,
  enforceSession,
  noAccessTokenError,
  toolError,
  toolResult,
} from "./tool-helpers";

/**
 * Registers integration tools on the MCP server
 */
export function registerIntegrationTools(server: any): void {
  // Tool 1: call_integration_api
  server.registerTool(
    "call_integration_api",
    {
      title: "Call Integration API",
      description:
        "Call any integrated provider API (Linear, Notion, Snowflake) with automatic authentication token injection. " +
        "Provider is auto-detected from URL domain. Active Pipes read authority is required for reads. " +
        "GET requests and GraphQL queries require read; POST/PUT/PATCH/DELETE and GraphQL mutations require write.",
      inputSchema: {
        url: z
          .string()
          .url()
          .describe(
            "Full API URL (e.g., 'https://api.linear.app/graphql', 'https://api.notion.com/v1/search')",
          ),
        method: z
          .enum(["GET", "POST", "PUT", "PATCH", "DELETE"])
          .default("POST")
          .describe("HTTP method"),
        body: z
          .record(z.unknown())
          .optional()
          .describe("Request body as JSON object"),
        headers: z
          .record(z.string())
          .optional()
          .describe(
            "Additional headers (authentication will be added automatically)",
          ),
      },
    },
    async (
      { url, method, body, headers }: any,
      { authInfo }: { authInfo: McpAuthInfo },
    ) => {
      const { session, error } = await enforceSession(authInfo);
      if (error) return error;

      if (!authInfo.token) return noAccessTokenError();

      const startTime = Date.now();
      let provider: string | null = null;

      try {
        // Check authority level
        requireReadMode(session!);
        if (isWriteRequest(method, url, body)) {
          requireWriteMode(session!);
        }

        // Detect provider from URL
        const detected = detectProviderFromUrl(url);
        if (!detected) {
          const domain = new URL(url).hostname;
          throw new UnsupportedProviderError(domain);
        }
        provider = detected.id;

        // Check provider-level access
        requireProviderAccess(session!, provider);

        // Inject authentication for provider
        const authenticatedConfig = await injectProviderAuth(
          provider,
          authInfo,
          { url, method: method || "POST", body, headers },
        );

        // Make the authenticated request
        const response = await makeAuthenticatedRequest(authenticatedConfig);

        // Parse response
        let data: unknown;
        const contentType = response.headers.get("content-type");
        if (contentType?.includes("application/json")) {
          data = await response.json();
        } else {
          data = await response.text();
        }

        auditLog({
          timestamp: new Date().toISOString(),
          event: "api_call.completed",
          sessionId: session!.sid,
          sessionMode: session!.authority,
          tool: "call_integration_api",
          method,
          provider,
          userId: session!.userId,
          userEmail: session!.userEmail,
          organizationId: session!.organizationId,
          durationMs: Date.now() - startTime,
          url,
          body,
        });

        // Return error if provider API failed
        if (!response.ok) {
          return toolError(
            `${provider} API returned ${response.status}\n\n\`\`\`json\n${JSON.stringify(data, null, 2)}\n\`\`\``,
          );
        }

        return toolResult(
          `API call successful!\n\n\`\`\`json\n${JSON.stringify(data, null, 2)}\n\`\`\``,
        );
      } catch (error) {
        auditLog({
          timestamp: new Date().toISOString(),
          event: "api_call.errored",
          sessionId: session!.sid,
          sessionMode: session!.authority,
          tool: "call_integration_api",
          method,
          provider: provider ?? undefined,
          userId: session!.userId,
          userEmail: session!.userEmail,
          organizationId: session!.organizationId,
          reason: error instanceof Error ? error.message : String(error),
          durationMs: Date.now() - startTime,
          url,
          body,
        });

        if (error instanceof SessionError) {
          auditLog({
            timestamp: new Date().toISOString(),
            event: "api_call.denied",
            sessionId: session!.sid,
            sessionMode: session!.authority,
            tool: "call_integration_api",
            method,
            provider: provider ?? undefined,
            userId: session!.userId,
            userEmail: session!.userEmail,
            organizationId: session!.organizationId,
            reason: error.message,
            url,
            body,
          });
          return toolError(error.message);
        }

        if (error instanceof NotConnectedError) {
          return toolError(
            `${error.provider} is not connected.\n\n${error.message}\n\nPlease connect it in Settings to use this integration.`,
          );
        }

        if (error instanceof UnsupportedProviderError) {
          return toolError(
            `Unsupported provider: ${error.domain}\n\nSupported providers: Linear (api.linear.app), Notion (api.notion.com), Snowflake (*.snowflakecomputing.com)`,
          );
        }

        return toolError(
          `Failed to call integration API: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    },
  );

  // Tool 2: get_integration_instructions
  server.registerTool(
    "get_integration_instructions",
    {
      title: "Get Integration Instructions",
      description:
        "Get instructions for using integrations. Requires active Pipes read authority.",
      inputSchema: {
        integrationIds: z
          .array(z.string())
          .describe(
            "Array of integration IDs (e.g., ['linear', 'notion', 'snowflake'])",
          ),
      },
    },
    async (
      { integrationIds }: any,
      { authInfo }: { authInfo: McpAuthInfo },
    ) => {
      const { session, error } = await enforceSession(authInfo);
      if (error) return error;
      const readErr = checkReadAccess(session!);
      if (readErr) return readErr;

      let markdown = `## Integration Instructions\n\n`;

      for (const id of integrationIds) {
        markdown += `### ${id}\n\n`;
        try {
          const provider = getProvider(id);
          markdown += `${provider.instructions}\n\n`;
        } catch {
          markdown += `_Unknown integration._\n\n`;
        }
      }

      return toolResult(markdown);
    },
  );

  // Tool 3: get_integration_status
  server.registerTool(
    "get_integration_status",
    {
      title: "Get Integration Status",
      description:
        "Check which integrations are currently connected. Requires active Pipes read authority.",
      inputSchema: {},
    },
    async (_params: any, { authInfo }: { authInfo: McpAuthInfo }) => {
      const { session, error } = await enforceSession(authInfo);
      if (error) return error;
      const readErr = checkReadAccess(session!);
      if (readErr) return readErr;
      if (!authInfo.token) return noAccessTokenError();

      try {
        const result = await handleGetStatus(authInfo);

        if (!result.success) {
          return toolError(
            `Error: ${result.error?.message || "Unknown error"}`,
          );
        }

        const integrations = result.data?.integrations || [];
        let markdown = `## Integration Status for ${authInfo.extra.userEmail}\n\n`;

        if (integrations.length === 0) {
          markdown += "No integrations available.\n";
        } else {
          markdown += "| Integration | Status | Scopes |\n";
          markdown += "|-------------|--------|--------|\n";

          for (const integration of integrations) {
            const statusIcon = integration.isConnected ? "[OK]" : "[--]";
            const scopesFormatted =
              integration.scopes.length > 0
                ? integration.scopes.join(", ")
                : "None";
            markdown += `| ${integration.name} | ${statusIcon} ${integration.status} | ${scopesFormatted} |\n`;
          }

          const connectedCount = integrations.filter(
            (i) => i.isConnected,
          ).length;
          markdown += `\n**Total:** ${integrations.length} integrations (${connectedCount} connected)\n`;
        }

        return toolResult(markdown);
      } catch (error) {
        return toolError(
          `Failed to fetch integration status: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    },
  );

  // Tool 4: get_integration_authorization_url
  server.registerTool(
    "get_integration_authorization_url",
    {
      title: "Get Integration Authorization URL",
      description:
        "Generate an OAuth authorization URL for connecting a pipes integration. Requires active Pipes read authority.",
      inputSchema: {
        slug: z
          .string()
          .describe(
            "Integration slug (e.g., 'linear', 'notion', 'snowflake', 'github', 'salesforce')",
          ),
      },
    },
    async ({ slug }: any, { authInfo }: { authInfo: McpAuthInfo }) => {
      const { session, error } = await enforceSession(authInfo);
      if (error) return error;
      const readErr = checkReadAccess(session!);
      if (readErr) return readErr;
      if (!authInfo.token) return noAccessTokenError();

      try {
        const response = await fetch(
          `https://api.workos.com/_widgets/DataIntegrations/${slug}/authorize`,
          {
            method: "GET",
            headers: {
              Authorization: `Bearer ${authInfo.token}`,
              "Content-Type": "application/json",
              "workos-widgets-type": "pipes",
              "workos-widgets-version": "1",
            },
          },
        );

        if (!response.ok) {
          const errorBody = await response.text();
          return toolError(
            `WorkOS API error: ${response.status}\n\n${errorBody}`,
          );
        }

        const data = await response.json();

        return toolResult(`## Authorization URL for ${slug}

To connect or reauthorize this integration, open the following URL in your browser:

**[Click here to authorize ${slug}](${data.url})**

Or copy and paste this URL:
\`\`\`
${data.url}
\`\`\`

This will open the OAuth flow where you can grant access to the integration.
`);
      } catch (error) {
        return toolError(
          `Failed to get authorization URL: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    },
  );
}
