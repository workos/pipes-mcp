import { z } from "zod";
import type { McpAuthInfo } from "../with-authkit";
import {
  checkReadAccess,
  enforceSession,
  noAccessTokenError,
  toolError,
  toolResult,
} from "./tool-helpers";

function renderAuthorizationUrlMarkdown(slug: string, url: string): string {
  return `## Authorization URL for ${slug}

To connect or reauthorize this integration, open the following URL in your browser:

**[Click here to authorize ${slug}](${url})**

Or copy and paste this URL:
\`\`\`
${url}
\`\`\`

This will open the OAuth flow where you can grant access to the integration.
`;
}

export function registerConnectIntegrationTool(server: any): void {
  server.registerTool(
    "connect_integration",
    {
      title: "Connect Integration",
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
    async (
      { slug }: { slug: string },
      { authInfo }: { authInfo: McpAuthInfo },
    ) => {
      const { session, error } = await enforceSession(authInfo);
      if (error) return error;

      const readError = checkReadAccess(session);
      if (readError) return readError;

      if (!authInfo.token) {
        return noAccessTokenError();
      }

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
        return toolResult(renderAuthorizationUrlMarkdown(slug, data.url));
      } catch (caughtError) {
        return toolError(
          `Failed to get authorization URL: ${caughtError instanceof Error ? caughtError.message : String(caughtError)}`,
        );
      }
    },
  );
}
