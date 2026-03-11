import { createMcpHandler, withMcpAuth } from "mcp-handler";
import { registerAuditLogSchemas } from "@/lib/mcp/audit-log";
import { registerAuthorityTools } from "@/lib/mcp/tools/authority-tools";
import { registerIntegrationTools } from "@/lib/mcp/tools/integration-tools";
import { registerMetaTools } from "@/lib/mcp/tools/meta-tools";
import { verifyToken } from "@/lib/mcp/with-authkit";

const handler = createMcpHandler(async (server) => {
  // Register audit log event schemas with WorkOS (fire-and-forget at startup)
  registerAuditLogSchemas().catch((err) => {
    console.error("Failed to register audit log schemas:", err);
  });

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
