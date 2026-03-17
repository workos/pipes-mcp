import { handleGetStatus } from "../bridge-handlers/status";
import type { McpAuthInfo } from "../with-authkit";
import { enforceSession, toolError, toolResult } from "./tool-helpers";

function renderIntegrationStatusMarkdown(
  userEmail: string,
  integrations: Awaited<ReturnType<typeof handleGetStatus>> extends {
    data?: { integrations: infer TIntegrations };
  }
    ? TIntegrations
    : never,
): string {
  let markdown = `## Integration Status for ${userEmail}\n\n`;

  if (integrations.length === 0) {
    markdown += "No integrations available.\n";
    return markdown;
  }

  markdown += "| Integration | Status | Scopes |\n";
  markdown += "|-------------|--------|--------|\n";

  for (const integration of integrations) {
    const statusIcon = integration.isConnected ? "[OK]" : "[--]";
    const scopesFormatted =
      integration.scopes.length > 0 ? integration.scopes.join(", ") : "None";
    markdown += `| ${integration.name} | ${statusIcon} ${integration.status} | ${scopesFormatted} |\n`;
  }

  const connectedCount = integrations.filter(
    (integration) => integration.isConnected,
  ).length;
  markdown += `\n**Total:** ${integrations.length} integrations (${connectedCount} connected)\n`;

  return markdown;
}

export function registerListIntegrationsTool(server: any): void {
  server.registerTool(
    "list_integrations",
    {
      title: "List Integrations",
      description: "Check which integrations are currently connected.",
      inputSchema: {},
    },
    async (_params: any, { authInfo }: { authInfo: McpAuthInfo }) => {
      const { error } = await enforceSession(authInfo);
      if (error) return error;

      try {
        const result = await handleGetStatus(authInfo);

        if (!result.success) {
          return toolError(
            `Error: ${result.error?.message || "Unknown error"}`,
          );
        }

        return toolResult(
          renderIntegrationStatusMarkdown(
            authInfo.extra.userEmail,
            result.data?.integrations || [],
          ),
        );
      } catch (caughtError) {
        return toolError(
          `Failed to fetch integration status: ${caughtError instanceof Error ? caughtError.message : String(caughtError)}`,
        );
      }
    },
  );
}
