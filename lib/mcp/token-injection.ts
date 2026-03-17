/**
 * Token Injection Utility
 *
 * Handles provider-specific authentication token injection.
 * Gets OAuth tokens from WorkOS Pipes and injects them in the correct format for each provider.
 */

import { getWorkOSClient } from "../workos-client";
import { NotConnectedError } from "./bridge-types";
import { getProvider } from "./providers";
import {
  getOrganizationIdFromAuthInfo,
  type McpAuthInfo,
} from "./with-authkit";

/**
 * Request configuration before token injection
 */
export interface RequestConfig {
  url: string;
  method: string;
  body?: unknown;
  headers?: Record<string, string>;
}

/**
 * Request configuration after token injection (ready to send)
 */
export interface AuthenticatedRequestConfig extends RequestConfig {
  headers: Record<string, string>;
}

/**
 * Injects provider-specific authentication headers into a request
 *
 * @param provider - Provider name (linear, notion, snowflake)
 * @param authInfo - Authenticated user info from MCP
 * @param requestConfig - Original request configuration
 * @returns Request configuration with authentication headers injected
 * @throws NotConnectedError if provider is not connected
 */
export async function injectProviderAuth(
  provider: string,
  authInfo: McpAuthInfo,
  requestConfig: RequestConfig,
): Promise<AuthenticatedRequestConfig> {
  const organizationId = getOrganizationIdFromAuthInfo(authInfo);

  // Get Pipes token for provider
  let pipesResult;
  try {
    pipesResult = await getWorkOSClient().pipes.getAccessToken({
      provider,
      userId: authInfo.extra.userId,
      organizationId,
    });
  } catch (pipesError) {
    const errorMessage =
      pipesError instanceof Error ? pipesError.message : "Unknown error";
    throw new NotConnectedError(provider, errorMessage);
  }

  if (!pipesResult.active) {
    throw new NotConnectedError(provider, pipesResult.error);
  }

  const { accessToken } = pipesResult;

  const headers = buildProviderHeaders(
    provider,
    accessToken,
    requestConfig.headers,
  );

  return {
    ...requestConfig,
    headers,
  };
}

function buildProviderHeaders(
  provider: string,
  accessToken: { accessToken: string },
  baseHeaders?: Record<string, string>,
): Record<string, string> {
  const definition = getProvider(provider);
  return {
    ...baseHeaders,
    Authorization: `Bearer ${accessToken.accessToken}`,
    ...definition.buildHeaders(),
  };
}

/**
 * Makes an authenticated request to a provider API
 *
 * @param config - Authenticated request configuration (with headers injected)
 * @returns Fetch response
 */
export async function makeAuthenticatedRequest(
  config: AuthenticatedRequestConfig,
): Promise<Response> {
  const { url, method, headers, body } = config;

  return fetch(url, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
}
