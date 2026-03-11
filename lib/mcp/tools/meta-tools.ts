/**
 * Meta Tools
 *
 * MCP tools for user info and server documentation.
 * `whoami` and `get_mcp_server_info` need no session.
 */

import { getAllProviders } from "@/lib/mcp/providers";
import { extractSid, getSession } from "@/lib/mcp/session";
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
        `**User ID:** ${auth.extra.userId}\n`;

      // Include current authority scope if a session exists
      const sid = extractSid(auth);
      if (sid) {
        const session = await getSession(sid);
        if (session && session.authority !== "none") {
          const expiresInSec = Math.round(
            ((session.authorityExpiresAt ?? Date.now()) - Date.now()) / 1000,
          );
          response +=
            `\n**Authority:** ${session.authority}\n` +
            `**Providers:** ${session.allowedProviders.length > 0 ? session.allowedProviders.join(", ") : "all"}\n` +
            `**Expires in:** ${expiresInSec} seconds\n`;
        } else {
          response += `\n**Authority:** none\n`;
        }
      }

      return toolResult(response);
    },
  );

  // get_mcp_server_info — server documentation (no session required)
  server.registerTool(
    "get_mcp_server_info",
    {
      title: "Get MCP Server Info",
      description:
        "REQUIRED: Read this first before using any integration tools. Get complete information about this MCP server, access model, and available integrations.",
      inputSchema: {},
    },
    async (_params: any) => {
      const providers = getAllProviders();
      const integrationsList = providers
        .map((p, i) => `${i + 1}. ${p.documentation.summary}`)
        .join("\n");
      const importantNotes = providers
        .map((p) => `**${p.displayName}:**\n${p.instructions}`)
        .join("\n\n");

      return toolResult(`# WorkOS Pipes MCP Server

## Access Model

Authority is **provider-scoped** — the human approver selects which integrations to authorize.

1. Read operations require active \`read\` or \`write\` authority for the specific provider
2. Write operations require active \`write\` authority for the specific provider
3. To request authority:
   - Call \`request_pipes_authority\` with authority level and a reason
   - This returns an **approval URL** and an **approval ID**
   - Ask the user to open the URL in their browser
   - The user selects which providers to authorize and can add custom instructions
   - Call \`get_approval_status(approvalId)\` to poll for the result and retrieve instructions
   - Call \`release_pipes_authority\` when done

### Access Levels
- **none**: authenticated but no active Pipes authority
- **read** (5min TTL): GET requests via call_integration_api, GraphQL queries, plus all get_* tools
- **write** (5min TTL): POST, PUT, PATCH, DELETE via call_integration_api, and GraphQL mutations

### Approval Flow
1. Call \`request_pipes_authority(authority: "read" | "write", reason: "why you need access")\`
   → receive an approval URL and approval ID
2. Present the URL to the user and ask them to open it in their browser
3. User selects which integrations to authorize, optionally adds instructions, then approves or denies
4. Call \`get_approval_status(approvalId)\` to check the result
   - If approved: returns authority level, authorized providers, and any user instructions
   - If pending: try again after a moment
5. **Follow any user instructions** provided in the approval
6. Authority expires after 5 minutes; you can request again for different providers or levels

### Re-requesting Authority
You can call \`request_pipes_authority\` again even with active authority to:
- Request access to additional providers
- Upgrade from read to write
The new approval replaces the previous one once granted.

## Available Integrations

${integrationsList}

## How to Use

### 1. Check Status
Call \`get_integration_status\` to see which integrations are connected.

### 2. Connect Missing Integrations
Use \`get_integration_authorization_url\` to generate an OAuth URL.

### 3. Read Instructions (Optional)
Call \`get_integration_instructions\` for org-specific guidelines.

### 4. Make API Calls
Use \`call_integration_api\` with the provider's API URL:
- Provider auto-detected from URL domain
- Authentication handled automatically
- Only providers the user authorized in the approval will work
- GET and GraphQL queries require active \`read\` authority
- POST/PUT/PATCH/DELETE and GraphQL mutations require active \`write\` authority

### 5. Write Operations
When you need to create, update, or delete data:
1. Call \`request_pipes_authority(authority: "write", reason: "...")\` — returns an approval URL
2. Ask the user to open the URL and approve
3. Call \`get_approval_status(approvalId)\` to confirm and read instructions
4. Perform your write operations, respecting any user instructions
5. Call \`release_pipes_authority()\` when done

## Important Notes

${importantNotes}
`);
    },
  );
}
