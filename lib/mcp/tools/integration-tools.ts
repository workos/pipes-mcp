import { registerCallIntegrationApiTool } from "./call-integration-api-tool";
import { registerConnectIntegrationTool } from "./connect-integration-tool";
import { registerListIntegrationsTool } from "./list-integrations-tool";

/**
 * Registers integration tools on the MCP server.
 */
export function registerIntegrationTools(server: any): void {
  registerCallIntegrationApiTool(server);
  registerListIntegrationsTool(server);
  registerConnectIntegrationTool(server);
}
