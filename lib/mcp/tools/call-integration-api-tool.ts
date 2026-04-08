import { z } from "zod";
import type { RequestAuthorityGrant } from "../authority-grants";
import { NotConnectedError, UnsupportedProviderError } from "../bridge-types";
import {
  clearActiveRequestGrant,
  type PipesSession,
  SessionError,
} from "../session";
import { consumeApprovedRequestGrant } from "../session-store";
import {
  injectProviderAuth,
  makeAuthenticatedRequest,
  type RequestConfig,
} from "../token-injection";
import type { McpAuthInfo } from "../with-authkit";
import {
  authorizeBroadIntegrationRequest,
  type IntegrationApiAuthorizationInput,
} from "./call-integration-api-authorization";
import {
  enforceSession,
  noAccessTokenError,
  toolError,
  toolResult,
} from "./tool-helpers";

interface ToolInput {
  url: string;
  method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  body?: Record<string, unknown>;
  headers?: Record<string, string>;
  requestId?: string;
}

interface ParsedProviderResponse {
  response: Response;
  data: unknown;
}

type RequestGrantResolution =
  | { kind: "none" }
  | { kind: "error"; response: ReturnType<typeof toolError> }
  | { kind: "grant"; grant: RequestAuthorityGrant<"approved"> };

async function parseProviderResponse(
  response: Response,
): Promise<ParsedProviderResponse> {
  const contentType = response.headers.get("content-type");
  const data = contentType?.includes("application/json")
    ? await response.json()
    : await response.text();

  return { response, data };
}

async function executeProviderRequest(
  provider: string,
  authInfo: McpAuthInfo,
  request: RequestConfig,
): Promise<ParsedProviderResponse> {
  const authenticatedConfig = await injectProviderAuth(
    provider,
    authInfo,
    request,
  );
  const response = await makeAuthenticatedRequest(authenticatedConfig);
  return parseProviderResponse(response);
}

async function consumeMatchingRequestGrant(
  session: PipesSession,
  input: ToolInput,
): Promise<RequestGrantResolution> {
  if (!input.requestId) {
    return { kind: "none" };
  }

  if (
    session.activeRequestGrant &&
    session.activeRequestGrant.id !== input.requestId
  ) {
    return {
      kind: "error",
      response: toolError(
        "This request ID is not the current active request grant for this session. " +
          "Request a new per-request approval and use the latest request ID.",
      ),
    };
  }

  const grant = await consumeApprovedRequestGrant(input.requestId, {
    sid: session.sid,
    organizationId: session.organizationId,
    userId: session.userId,
  });

  if (!grant) {
    return {
      kind: "error",
      response: toolError(
        "Per-request approval not found, already consumed, or not yet approved. " +
          "Check the access request with `check_access_request` first.",
      ),
    };
  }

  await clearActiveRequestGrant(session.sid, session.organizationId, grant.id);

  if (grant.request.url !== input.url) {
    return {
      kind: "error",
      response: toolError(
        `API call URL does not match the approved request.\nApproved: ${grant.request.url}\nReceived: ${input.url}`,
      ),
    };
  }

  if (
    grant.request.method.toUpperCase() !==
    (input.method || "POST").toUpperCase()
  ) {
    return {
      kind: "error",
      response: toolError(
        `API call method does not match the approved request.\nApproved: ${grant.request.method}\nReceived: ${input.method || "POST"}`,
      ),
    };
  }

  if (
    grant.request.body &&
    JSON.stringify(grant.request.body) !== JSON.stringify(input.body)
  ) {
    return {
      kind: "error",
      response: toolError("API call body does not match the approved request."),
    };
  }

  return { kind: "grant", grant };
}

export function registerCallIntegrationApiTool(server: any): void {
  server.registerTool(
    "call_integration_api",
    {
      title: "Call Integration API",
      description:
        "Call any integrated provider API (Linear, Notion, Snowflake) with automatic authentication token injection. " +
        "Provider is auto-detected from URL domain. Active Pipes read authority is required for reads. " +
        "GET requests and GraphQL queries require read; POST/PUT/PATCH/DELETE and GraphQL mutations require write.",
      inputSchema: {
        url: z
          .string()
          .url()
          .describe(
            "Full API URL (e.g., 'https://api.linear.app/graphql', 'https://api.notion.com/v1/search')",
          ),
        method: z
          .enum(["GET", "POST", "PUT", "PATCH", "DELETE"])
          .default("POST")
          .describe("HTTP method"),
        body: z
          .record(z.string(), z.unknown())
          .optional()
          .describe("Request body as JSON object"),
        headers: z
          .record(z.string(), z.string())
          .optional()
          .describe(
            "Additional headers (authentication will be added automatically)",
          ),
        requestId: z
          .string()
          .optional()
          .describe(
            'Request ID from request_elevated_access with kind "call". ' +
              "Required for per-request authorized calls. The approval is single-use and consumed on execution.",
          ),
      },
    },
    async (input: ToolInput, { authInfo }: { authInfo: McpAuthInfo }) => {
      const { session, error } = await enforceSession(authInfo);
      if (error) return error;

      if (!authInfo.token) {
        return noAccessTokenError();
      }

      let provider: string | null = null;

      try {
        const broadAuthorization = authorizeBroadIntegrationRequest(
          session,
          input satisfies IntegrationApiAuthorizationInput,
        );

        if (broadAuthorization.kind === "authorized") {
          provider = broadAuthorization.provider;

          const { response, data } = await executeProviderRequest(
            provider,
            authInfo,
            {
              url: input.url,
              method: input.method || "POST",
              body: input.body,
              headers: input.headers,
            },
          );
          // Audit logs can be triggered here after a broad-authorized API call completes.

          if (!response.ok) {
            return toolError(
              `${provider} API returned ${response.status}\n\n\`\`\`json\n${JSON.stringify(data, null, 2)}\n\`\`\``,
            );
          }

          return toolResult(
            `API call successful!\n\n\`\`\`json\n${JSON.stringify(data, null, 2)}\n\`\`\``,
          );
        }

        if (!input.requestId) {
          return toolError(broadAuthorization.error.message);
        }

        const requestGrant = await consumeMatchingRequestGrant(session, input);
        if (requestGrant.kind === "error") {
          return requestGrant.response;
        }

        if (requestGrant.kind === "grant") {
          provider = requestGrant.grant.providers[0] ?? null;
          const effectiveBody = input.body ?? requestGrant.grant.request.body;
          // Audit logs can be triggered here when a per-request approval is consumed.

          const { response, data } = await executeProviderRequest(
            provider!,
            authInfo,
            {
              url: input.url,
              method: input.method || "POST",
              body: effectiveBody,
              headers: input.headers,
            },
          );
          // Audit logs can be triggered here after a per-request API call completes.

          if (!response.ok) {
            return toolError(
              `${provider} API returned ${response.status}\n\n\`\`\`json\n${JSON.stringify(data, null, 2)}\n\`\`\``,
            );
          }

          return toolResult(
            `API call successful! (per-request approval consumed)\n\n\`\`\`json\n${JSON.stringify(data, null, 2)}\n\`\`\``,
          );
        }
      } catch (caughtError) {
        // Audit logs can be triggered here when an integration API call errors.

        if (caughtError instanceof SessionError) {
          // Audit logs can be triggered here when an integration API call is denied.
          return toolError(caughtError.message);
        }

        if (caughtError instanceof NotConnectedError) {
          return toolError(
            `${caughtError.provider} is not connected.\n\n${caughtError.message}\n\nPlease connect it in Settings to use this integration.`,
          );
        }

        if (caughtError instanceof UnsupportedProviderError) {
          return toolError(
            `Unsupported provider: ${caughtError.domain}\n\nSupported providers: Linear (api.linear.app), Notion (api.notion.com), Snowflake (*.snowflakecomputing.com)`,
          );
        }

        return toolError(
          `Failed to call integration API: ${caughtError instanceof Error ? caughtError.message : String(caughtError)}`,
        );
      }
    },
  );
}
