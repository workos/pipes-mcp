import { z } from "zod";
import { getWorkOSClient } from "@/lib/workos-client";
import type { McpAuthInfo } from "../with-authkit";
import { enforceSession, toolError, toolResult } from "./tool-helpers";

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
        "Generate an OAuth authorization URL for connecting a pipes integration.",
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
      const { error } = await enforceSession(authInfo);
      if (error) return error;

      try {
        if (!authInfo.extra.organizationId) {
          return toolError(
            "Organization context is required to connect an integration. Please sign in with an organization.",
          );
        }

        const { data } = await getWorkOSClient().post<{ url: string }>(
          `data-integrations/${slug}/authorize`,
          {
            user_id: authInfo.extra.userId,
            organization_id: authInfo.extra.organizationId,
          },
        );

        return toolResult(renderAuthorizationUrlMarkdown(slug, data.url));
      } catch (caughtError: any) {
        const apiMessage =
          caughtError?.response?.data?.message ?? caughtError?.rawData?.message;

        if (apiMessage) {
          return toolError(apiMessage);
        }

        return toolError(
          `Failed to get authorization URL: ${caughtError instanceof Error ? caughtError.message : String(caughtError)}`,
        );
      }
    },
  );
}
