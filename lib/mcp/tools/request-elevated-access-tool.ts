import { z } from "zod";
import { createApprovalToken } from "@/lib/mcp/approval-token";
import { auditLog } from "@/lib/mcp/audit-log";
import { createPendingGrant } from "@/lib/mcp/authority-grants";
import { handleGetStatus } from "@/lib/mcp/bridge-handlers/status";
import { detectProviderFromUrl } from "@/lib/mcp/providers";
import {
  clearPendingGrant,
  getAuthorityTtlMs,
  getSessionAuthority,
  getSessionProviders,
  hasPendingGrant,
  type PipesSession,
  setActiveRequestGrant,
  setPendingGrant,
} from "@/lib/mcp/session";
import {
  deleteAuthorityGrant,
  saveAuthorityGrant,
} from "@/lib/mcp/session-store";
import { requireMcpAuthInfo } from "@/lib/mcp/with-authkit";
import { isWriteRequest } from "@/lib/mcp/write-detection";
import {
  buildApprovalUrl,
  formatBroadAuthorityPrompt,
  formatRequestAuthorityPrompt,
} from "./authority-tool-shared";
import { enforceSession, toolError, toolResult } from "./tool-helpers";

type ClientNameGetter = () => string | undefined;

const requestElevatedAccessInputSchema = {
  kind: z
    .enum(["session", "call"])
    .describe(
      'Type of elevated access request. Use "session" for broad temporary access and "call" for one exact API call.',
    ),
  level: z
    .enum(["read", "write"])
    .optional()
    .describe(
      'Access level to request. Required when kind is "session". Use "read" for read access and "write" for write operations.',
    ),
  providers: z
    .array(z.string())
    .optional()
    .describe(
      'Provider slugs to request access for (e.g. ["linear", "notion"]). ' +
        'If omitted, all connected integrations are shown for approval. Only used when kind is "session".',
    ),
  url: z
    .string()
    .url()
    .optional()
    .describe('The exact API URL to call. Required when kind is "call".'),
  method: z
    .enum(["GET", "POST", "PUT", "PATCH", "DELETE"])
    .optional()
    .describe("HTTP method for the API call."),
  body: z
    .record(z.unknown())
    .optional()
    .describe('Request body as JSON object. Only used when kind is "call".'),
  reason: z
    .string()
    .optional()
    .describe(
      "Justification for why this access is needed. Shown to the human approver on the consent screen.",
    ),
};

async function handleRequestAuthority(
  params: {
    authority: "request";
    reason?: string;
    url?: string;
    method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
    body?: Record<string, unknown>;
  },
  context: {
    session: PipesSession;
    auth: ReturnType<typeof requireMcpAuthInfo>;
    clientName?: string;
  },
) {
  const { session, auth, clientName } = context;
  const { url, method, body, reason } = params;

  if (!url) {
    return toolError(
      'The "url" field is required when request_elevated_access kind is "call".',
    );
  }
  if (!method) {
    return toolError(
      'The "method" field is required when request_elevated_access kind is "call".',
    );
  }

  const detected = detectProviderFromUrl(url);
  if (!detected) {
    return toolError(
      `Unsupported provider URL: ${url}. Supported providers: Linear (api.linear.app), Notion (api.notion.com), Snowflake (*.snowflakecomputing.com)`,
    );
  }

  const ttlMs = getAuthorityTtlMs();
  const approvalId = crypto.randomUUID();
  const requestAuthority = isWriteRequest(method, url, body) ? "write" : "read";

  const grant = createPendingGrant({
    id: approvalId,
    kind: "request",
    sid: session.sid,
    userId: auth.extra.userId,
    userEmail: auth.extra.userEmail,
    organizationId: session.organizationId,
    authority: requestAuthority,
    providers: [detected.id],
    expiresAt: Date.now() + ttlMs,
    request: {
      url,
      method,
      body,
    },
  });
  await saveAuthorityGrant(grant, ttlMs);

  const previousRequestGrant = await setActiveRequestGrant(
    session.sid,
    session.organizationId,
    {
      id: grant.id,
      status: grant.status,
      authority: grant.authority,
      providers: grant.providers,
      expiresAt: grant.expiresAt,
      request: {
        url: grant.request.url,
        method: grant.request.method,
      },
    },
  );
  if (previousRequestGrant && previousRequestGrant.id !== grant.id) {
    await deleteAuthorityGrant(previousRequestGrant.id);
  }

  const token = await createApprovalToken({
    tokenId: approvalId,
    sid: session.sid,
    userId: auth.extra.userId,
    organizationId: session.organizationId,
    userEmail: auth.extra.userEmail,
    authority: "request",
    clientName,
    reason,
    requestDetails: {
      url,
      method,
    },
  });

  auditLog({
    timestamp: new Date().toISOString(),
    event: "pipes_authority.requested",
    sessionId: session.sid,
    sessionMode: "request",
    userId: auth.extra.userId,
    userEmail: auth.extra.userEmail,
    organizationId: session.organizationId,
    url,
    method,
  });

  return toolResult(
    formatRequestAuthorityPrompt({
      requestId: approvalId,
      method,
      url,
      approvalUrl: buildApprovalUrl(token),
    }),
  );
}

async function handleBroadAuthority(
  params: {
    authority: "read" | "write";
    providers?: string[];
    reason?: string;
  },
  context: {
    session: PipesSession;
    auth: ReturnType<typeof requireMcpAuthInfo>;
    clientName?: string;
  },
) {
  const { session, auth, clientName } = context;
  const { authority, providers, reason } = params;

  if (hasPendingGrant(session)) {
    await clearPendingGrant(session.sid, session.organizationId);
  }

  const statusResult = await handleGetStatus(auth);
  const allConnected =
    statusResult.success && statusResult.data
      ? statusResult.data.integrations
          .filter((integration) => integration.isConnected)
          .map((integration) => ({
            name: integration.name,
            slug: integration.slug,
          }))
      : [];

  const connectedIntegrations =
    providers && providers.length > 0
      ? allConnected.filter((integration) =>
          providers.includes(integration.slug),
        )
      : allConnected;

  const ttlMs = getAuthorityTtlMs();
  const approvalId = crypto.randomUUID();
  const grant = createPendingGrant({
    id: approvalId,
    kind: "broad",
    sid: session.sid,
    userId: auth.extra.userId,
    userEmail: auth.extra.userEmail,
    organizationId: session.organizationId,
    authority,
    providers: connectedIntegrations.map((integration) => integration.slug),
    expiresAt: Date.now() + ttlMs,
  });

  await setPendingGrant(session.sid, session.organizationId, grant);

  const token = await createApprovalToken({
    tokenId: approvalId,
    sid: session.sid,
    userId: auth.extra.userId,
    organizationId: session.organizationId,
    userEmail: auth.extra.userEmail,
    authority,
    integrations: connectedIntegrations,
    clientName,
    reason,
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

  const currentAuthority = getSessionAuthority(session);
  const currentProviders = getSessionProviders(session);
  const currentAuthorityNote =
    currentAuthority !== "none"
      ? `\n\nNote: You currently have ${currentAuthority} authority for [${currentProviders.join(", ")}]. ` +
        `This will be replaced once the new approval is granted.`
      : "";

  return toolResult(
    formatBroadAuthorityPrompt({
      requestId: approvalId,
      authority,
      approvalUrl: buildApprovalUrl(token),
      currentAuthorityNote,
    }),
  );
}

export function registerRequestElevatedAccessTool(
  server: any,
  getClientName: ClientNameGetter,
): void {
  server.registerTool(
    "request_elevated_access",
    {
      title: "Request Elevated Access",
      description:
        "Create a human approval request for either broad temporary Pipes access or one exact API call. " +
        "Call `whoami` first and prefer broad `read` or `write` access when that matches the user's request. " +
        "This returns an approval URL that the user must open in their browser to approve or deny. " +
        'Use kind "call" only when the user explicitly wants per-request approval of one exact API call.',
      inputSchema: requestElevatedAccessInputSchema,
    },
    async (
      {
        kind,
        level,
        providers,
        url,
        method,
        body,
        reason,
      }: {
        kind: "session" | "call";
        level?: "read" | "write";
        providers?: string[];
        url?: string;
        method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
        body?: Record<string, unknown>;
        reason?: string;
      },
      { authInfo }: { authInfo?: Parameters<typeof requireMcpAuthInfo>[0] },
    ) => {
      const auth = requireMcpAuthInfo(authInfo);
      const { session, error } = await enforceSession(auth);
      if (error || !session) return error;

      const context = {
        session,
        auth,
        clientName: getClientName(),
      };

      if (kind === "call") {
        return handleRequestAuthority(
          {
            authority: "request",
            reason,
            url,
            method,
            body,
          },
          context,
        );
      }

      if (!level) {
        return toolError(
          'The "level" field is required when request_elevated_access kind is "session".',
        );
      }

      return handleBroadAuthority(
        {
          authority: level,
          providers,
          reason,
        },
        context,
      );
    },
  );
}
