/**
 * Authority Tools
 *
 * MCP tools for requesting, polling, and releasing Pipes authority.
 * `request_pipes_authority` initiates the approval flow.
 * `get_approval_status` polls for the result and delivers user instructions.
 * `release_pipes_authority` drops active authority.
 */

import { z } from "zod";
import {
  createApprovalToken,
  decryptApprovalToken,
  getApprovalBaseUrl,
} from "@/lib/mcp/approval-token";
import { auditLog } from "@/lib/mcp/audit-log";
import { handleGetStatus } from "@/lib/mcp/bridge-handlers/status";
import {
  clearPendingApproval,
  getAuthorityTtlMs,
  hasPendingApproval,
  releaseAuthority,
  setPendingApproval,
} from "@/lib/mcp/session";
import { loadApprovalResult } from "@/lib/mcp/session-store";
import { requireMcpAuthInfo } from "@/lib/mcp/with-authkit";
import { enforceSession, toolResult } from "./tool-helpers";

const g = globalThis as unknown as { __mcpClientName?: string };

export function registerAuthorityTools(server: any): void {
  // Capture MCP client name on initialize (persists across HMR)
  const prevOnInitialized = server.server?.oninitialized;
  if (server.server) {
    server.server.oninitialized = () => {
      const cv = server.server.getClientVersion?.();
      if (cv?.name) g.__mcpClientName = cv.name;
      prevOnInitialized?.();
    };
  }

  // request_pipes_authority — initiates approval flow for read/write authority
  server.registerTool(
    "request_pipes_authority",
    {
      title: "Request Pipes Authority",
      description:
        "Request Pipes authority for the current authenticated session. " +
        "This returns an approval URL that the user must open in their browser to approve or deny. " +
        "Both read and write authority expire after 5 minutes. " +
        "Can be called again to request different providers or upgrade authority level.",
      inputSchema: {
        authority: z
          .enum(["read", "write"])
          .describe(
            'Pipes authority to request. Use "read" for read access, or "write" for write operations.',
          ),
        providers: z
          .array(z.string())
          .optional()
          .describe(
            'Provider slugs to request access for (e.g. ["linear", "notion"]). ' +
              "If omitted, all connected integrations are shown for approval.",
          ),
        reason: z
          .string()
          .optional()
          .describe(
            "Justification for why this access is needed. Shown to the human approver on the consent screen.",
          ),
      },
    },
    async (
      {
        authority,
        providers,
        reason,
      }: { authority: "read" | "write"; providers?: string[]; reason?: string },
      { authInfo }: { authInfo?: Parameters<typeof requireMcpAuthInfo>[0] },
    ) => {
      const auth = requireMcpAuthInfo(authInfo);

      const { session, error } = await enforceSession(auth);
      if (error) return error;

      // Clear any stale pending approval so a fresh one can be created
      if (hasPendingApproval(session)) {
        await clearPendingApproval(session.sid);
      }

      // Fetch connected integration names + slugs for the approval UI
      const statusResult = await handleGetStatus(auth);
      const allConnected =
        statusResult.success && statusResult.data
          ? statusResult.data.integrations
              .filter((i) => i.isConnected)
              .map((i) => ({ name: i.name, slug: i.slug }))
          : [];

      // Filter to requested providers if specified
      const connectedIntegrations =
        providers && providers.length > 0
          ? allConnected.filter((i) => providers.includes(i.slug))
          : allConnected;

      const clientName =
        g.__mcpClientName ??
        server.server?.getClientVersion?.()?.name ??
        undefined;

      const token = await createApprovalToken({
        sid: session.sid,
        userId: auth.extra.userId,
        organizationId: session.organizationId,
        userEmail: auth.extra.userEmail,
        authority,
        integrations: connectedIntegrations,
        clientName,
        reason,
      });
      const tokenPayload = await decryptApprovalToken(token);

      const expiresAt = Date.now() + getAuthorityTtlMs();
      await setPendingApproval(session.sid, {
        token,
        tokenJti: tokenPayload.jti,
        createdAt: Date.now(),
        expiresAt,
        authority,
      });

      auditLog({
        timestamp: new Date().toISOString(),
        event: "pipes_authority.requested",
        sessionId: session.sid,
        sessionMode: authority,
        userId: auth.extra.userId,
        userEmail: auth.extra.userEmail,
        organizationId: session.organizationId,
      });

      const approvalUrl = `${getApprovalBaseUrl()}/approve?token=${encodeURIComponent(token)}`;

      // Note about existing authority being replaced
      const currentAuthorityNote =
        session.authority !== "none"
          ? `\n\nNote: You currently have ${session.authority} authority for [${session.allowedProviders.join(", ")}]. ` +
            `This will be replaced once the new approval is granted.`
          : "";

      return toolResult(
        `Pipes ${authority} authority requires human approval.\n\n` +
          `**Approval ID:** ${tokenPayload.jti}\n\n` +
          `Ask the user to open this URL to approve or deny your request:\n${approvalUrl}\n\n` +
          `**Important:** You must poll for the result by calling \`get_approval_status\` with approvalId "${tokenPayload.jti}". ` +
          `Keep polling until the status is "approved" or "denied". ` +
          `The result will include which providers were authorized and any custom instructions from the user that you must follow.\n\n` +
          `The approval link expires in 5 minutes.` +
          currentAuthorityNote,
      );
    },
  );

  // get_approval_status — polls for the result of a pending approval
  server.registerTool(
    "get_approval_status",
    {
      title: "Get Approval Status",
      description:
        "Check the status of a pending Pipes authority approval. " +
        "Returns the current status (pending, approved, not_found) and any user instructions if approved.",
      inputSchema: {
        approvalId: z
          .string()
          .describe("The approval ID returned by request_pipes_authority."),
      },
    },
    async (
      { approvalId }: { approvalId: string },
      { authInfo }: { authInfo?: Parameters<typeof requireMcpAuthInfo>[0] },
    ) => {
      const auth = requireMcpAuthInfo(authInfo);

      const { session, error } = await enforceSession(auth);
      if (error) return error;

      // Check if this approval is still pending on the session
      if (session.pendingApproval?.tokenJti === approvalId) {
        return toolResult(
          `**Status:** pending\n\n` +
            `The approval request is still waiting for the user to act.\n` +
            `Wait 10 seconds (e.g. \`sleep 10\` in a shell) then call \`get_approval_status\` again. ` +
            `Keep polling until the status is "approved" or "denied".`,
        );
      }

      // Look up the resolved outcome from the approval result store
      const result = await loadApprovalResult(approvalId);

      if (!result) {
        return toolResult(
          `**Status:** not_found\n\n` +
            `This approval was not found. It may have expired.`,
        );
      }

      if (result.outcome === "denied") {
        let response =
          `**Status:** denied\n\n` +
          `The user denied this ${result.authority} authority request.`;

        if (result.userInstructions) {
          response += `\n\n**Reason:** ${result.userInstructions}`;
        }

        return toolResult(response);
      }

      // Approved — return details
      const expiresInSec = Math.round(
        ((session.authorityExpiresAt ?? Date.now()) - Date.now()) / 1000,
      );

      let response =
        `**Status:** approved\n\n` +
        `**Authority:** ${result.authority}\n` +
        `**Providers:** ${result.providers.join(", ")}\n` +
        `**Expires in:** ${expiresInSec} seconds\n`;

      if (result.userInstructions) {
        response += `\n**User Instructions:**\n${result.userInstructions}\n`;
      }

      response += `\nCall \`release_pipes_authority\` when done to release authority.`;

      return toolResult(response);
    },
  );

  // release_pipes_authority — releases current Pipes authority back to none
  server.registerTool(
    "release_pipes_authority",
    {
      title: "Release Pipes Authority",
      description: "Release current Pipes authority and return to none.",
      inputSchema: {},
    },
    async (
      _params: any,
      { authInfo }: { authInfo?: Parameters<typeof requireMcpAuthInfo>[0] },
    ) => {
      const auth = requireMcpAuthInfo(authInfo);

      const { session: currentSession, error } = await enforceSession(auth);
      if (error) return error;

      const session = await releaseAuthority(currentSession.sid);

      if (!session) {
        return toolResult("No active Pipes authority found.");
      }

      auditLog({
        timestamp: new Date().toISOString(),
        event: "pipes_authority.released",
        sessionId: session.sid,
        sessionMode: session.authority,
        userId: session.userId,
        userEmail: session.userEmail,
        organizationId: session.organizationId,
      });

      return toolResult(
        "Pipes authority released. You now have no active authority.",
      );
    },
  );
}
