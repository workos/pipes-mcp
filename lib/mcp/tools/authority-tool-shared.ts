import { getApprovalBaseUrl } from "@/lib/mcp/approval-token";
import type {
  AuthorityGrantRecord,
  BroadAuthorityGrant,
  RequestAuthorityGrant,
} from "@/lib/mcp/authority-grants";
import { getProvider } from "@/lib/mcp/providers";

function getProviderInstructions(providers: string[]): string {
  const sections = providers
    .map((id) => {
      try {
        const provider = getProvider(id);
        return `### ${provider.displayName}\n${provider.instructions}`;
      } catch {
        return null;
      }
    })
    .filter(Boolean);

  if (sections.length === 0) return "";
  return `\n**Provider Instructions:**\n${sections.join("\n\n")}\n`;
}

export function buildApprovalUrl(token: string): string {
  return `${getApprovalBaseUrl()}/approve?token=${encodeURIComponent(token)}`;
}

export function formatPendingApprovalStatus(): string {
  return (
    `**Status:** pending\n\n` +
    `The approval request is still waiting for the user to act.\n` +
    `Wait 10 seconds (e.g. \`sleep 10\` in a shell) then call \`check_access_request\` again. ` +
    `Keep polling until the status is "approved" or "denied".`
  );
}

export function formatApprovalNotFoundStatus(): string {
  return `**Status:** not_found\n\nThis approval was not found. It may have expired.`;
}

export function formatDeniedGrantStatus(grant: AuthorityGrantRecord): string {
  const deniedTarget =
    grant.kind === "request"
      ? `per-request approval for ${grant.request.method} ${grant.request.url}`
      : `${grant.authority} authority request`;
  let response = `**Status:** denied\n\nThe user denied this ${deniedTarget}.`;

  if (grant.userInstructions) {
    response += `\n\n**Reason:** ${grant.userInstructions}`;
  }

  return response;
}

export function formatApprovedRequestGrantStatus(
  grant: RequestAuthorityGrant<"approved">,
  requestId: string,
): string {
  let response =
    `**Status:** approved\n\n` +
    `**Request:** ${grant.request.method} ${grant.request.url}\n` +
    `**Provider:** ${grant.providers.join(", ")}\n`;

  response += getProviderInstructions(grant.providers);

  if (grant.userInstructions) {
    response += `\n**User Instructions:**\n${grant.userInstructions}\n`;
  }

  response += `\nCall \`call_integration_api\` with requestId "${requestId}" to execute the approved request. This approval is single-use.`;

  return response;
}

export function formatApprovedBroadGrantStatus(
  grant: BroadAuthorityGrant<"approved">,
  expiresInSec: number,
): string {
  let response =
    `**Status:** approved\n\n` +
    `**Authority:** ${grant.authority}\n` +
    `**Providers:** ${grant.providers.join(", ")}\n` +
    `**Expires in:** ${expiresInSec} seconds\n`;

  response += getProviderInstructions(grant.providers);

  if (grant.userInstructions) {
    response += `\n**User Instructions:**\n${grant.userInstructions}\n`;
  }

  response += `\nThis access expires automatically after a short time.`;

  return response;
}

export function formatRequestAuthorityPrompt(input: {
  requestId: string;
  method: string;
  url: string;
  approvalUrl: string;
}): string {
  return (
    `Per-request approval required for this API call.\n\n` +
    `**Request ID:** ${input.requestId}\n\n` +
    `**Request:** ${input.method} ${input.url}\n\n` +
    `Ask the user to open this URL to approve or deny your request:\n${input.approvalUrl}\n\n` +
    `**Important:** You must poll for the result by calling \`check_access_request\` with requestId "${input.requestId}". ` +
    `Keep polling until the status is "approved" or "denied". ` +
    `Once approved, call \`call_integration_api\` with requestId "${input.requestId}" to execute the request.\n\n` +
    `The approval link expires in 5 minutes. This approval is single-use.`
  );
}

export function formatBroadAuthorityPrompt(input: {
  requestId: string;
  authority: "read" | "write";
  approvalUrl: string;
  currentAuthorityNote: string;
}): string {
  return (
    `Pipes ${input.authority} authority requires human approval.\n\n` +
    `**Request ID:** ${input.requestId}\n\n` +
    `Ask the user to open this URL to approve or deny your request:\n${input.approvalUrl}\n\n` +
    `**Important:** You must poll for the result by calling \`check_access_request\` with requestId "${input.requestId}". ` +
    `Keep polling until the status is "approved" or "denied". ` +
    `The result will include which providers were authorized and any custom instructions from the user that you must follow.\n\n` +
    `The approval link expires in 5 minutes.` +
    input.currentAuthorityNote
  );
}

export function isGrantVisibleToSession(
  grant: AuthorityGrantRecord,
  session: {
    sid: string;
    userId: string;
    organizationId?: string;
  },
): boolean {
  return (
    grant.sid === session.sid &&
    grant.userId === session.userId &&
    grant.organizationId === session.organizationId
  );
}
