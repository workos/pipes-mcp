import { z } from "zod";
import type {
  BroadAuthorityGrant,
  RequestAuthorityGrant,
} from "@/lib/mcp/authority-grants";
import { getSessionAuthorityExpiresAt } from "@/lib/mcp/session";
import { loadAuthorityGrant } from "@/lib/mcp/session-store";
import { requireMcpAuthInfo } from "@/lib/mcp/with-authkit";
import {
  formatApprovalNotFoundStatus,
  formatApprovedBroadGrantStatus,
  formatApprovedRequestGrantStatus,
  formatDeniedGrantStatus,
  formatPendingApprovalStatus,
  isGrantVisibleToSession,
} from "./authority-tool-shared";
import { enforceSession, toolResult } from "./tool-helpers";

export function registerCheckAccessRequestTool(server: any): void {
  server.registerTool(
    "check_access_request",
    {
      title: "Check Access Request",
      description:
        "Check the status of a pending Pipes access request. " +
        "Returns the current status (pending, approved, not_found) and any user instructions if approved.",
      inputSchema: {
        requestId: z
          .string()
          .describe("The request ID returned by request_elevated_access."),
      },
    },
    async (
      { requestId }: { requestId: string },
      { authInfo }: { authInfo?: Parameters<typeof requireMcpAuthInfo>[0] },
    ) => {
      const auth = requireMcpAuthInfo(authInfo);
      const { session, error } = await enforceSession(auth);
      if (error) return error;

      if (session.pendingGrant?.id === requestId) {
        return toolResult(formatPendingApprovalStatus());
      }

      const grant = await loadAuthorityGrant(requestId);
      if (!grant || !isGrantVisibleToSession(grant, session)) {
        return toolResult(formatApprovalNotFoundStatus());
      }

      if (grant.status === "pending") {
        return toolResult(formatPendingApprovalStatus());
      }

      if (grant.status === "denied") {
        return toolResult(formatDeniedGrantStatus(grant));
      }

      if (grant.kind === "request") {
        return toolResult(
          formatApprovedRequestGrantStatus(
            grant as RequestAuthorityGrant<"approved">,
            requestId,
          ),
        );
      }

      const activeGrantExpiresAt =
        session.activeGrant?.id === grant.id
          ? getSessionAuthorityExpiresAt(session)
          : grant.expiresAt;
      const expiresInSec = Math.max(
        0,
        Math.round(((activeGrantExpiresAt ?? Date.now()) - Date.now()) / 1000),
      );

      return toolResult(
        formatApprovedBroadGrantStatus(
          grant as BroadAuthorityGrant<"approved">,
          expiresInSec,
        ),
      );
    },
  );
}
