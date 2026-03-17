import { createMcpHandler, withMcpAuth } from "mcp-handler";
import { registerAuthorityTools } from "@/lib/mcp/tools/authority-tools";
import { registerIntegrationTools } from "@/lib/mcp/tools/integration-tools";
import { registerMetaTools } from "@/lib/mcp/tools/meta-tools";
import { verifyToken } from "@/lib/mcp/with-authkit";

const handler = createMcpHandler(async (server) => {
  // Audit log schema registration can be triggered here if event logging is re-enabled.

  registerAuthorityTools(server);
  registerMetaTools(server);
  registerIntegrationTools(server);
});

// Make authorization required
const authHandler = withMcpAuth(handler, verifyToken, {
  required: true,
  resourceMetadataPath: "/.well-known/oauth-protected-resource/mcp",
});

export { authHandler as GET, authHandler as POST };
