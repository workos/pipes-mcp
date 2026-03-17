/**
 * Shared helpers for MCP tool handlers.
 */

import {
  extractSid,
  getOrCreateSession,
  type PipesSession,
  requireReadMode,
  SessionError,
} from "../session";
import {
  getOrganizationIdFromAuthInfo,
  type McpAuthInfo,
} from "../with-authkit";

export type ToolResponse = {
  content: { type: "text"; text: string }[];
  isError?: true;
};

/** Wrap a text string as a successful MCP tool response. */
export function toolResult(text: string): ToolResponse {
  return { content: [{ type: "text", text }] };
}

/** Wrap a text string as an MCP tool error response. */
export function toolError(text: string): ToolResponse {
  return { content: [{ type: "text", text }], isError: true };
}

/**
 * Extract sid + lazy-init session from authInfo.
 * Returns `{ session, error }` — check `error` first.
 */
export async function enforceSession(
  authInfo: McpAuthInfo,
): Promise<
  | { session: PipesSession; error: null }
  | { session: null; error: ToolResponse }
> {
  const sid = extractSid(authInfo);
  if (!sid) {
    return {
      session: null,
      error: toolError(
        "Authentication error: no session ID found in JWT claims.",
      ),
    };
  }

  const organizationId = getOrganizationIdFromAuthInfo(authInfo);

  const session = await getOrCreateSession(
    sid,
    authInfo.extra.userId,
    organizationId,
    authInfo.extra.userEmail,
  );

  return { session, error: null };
}

/**
 * Check that the session has active read authority.
 * Returns a `ToolResponse` on failure, or `null` on success.
 */
export function checkReadAccess(session: PipesSession): ToolResponse | null {
  try {
    requireReadMode(session);
    return null;
  } catch (err) {
    if (err instanceof SessionError) {
      return toolError(err.message);
    }
    throw err;
  }
}

/**
 * Standard "no access token" error response.
 */
export function noAccessTokenError(): ToolResponse {
  return toolError("No access token available. Please re-authenticate.");
}
