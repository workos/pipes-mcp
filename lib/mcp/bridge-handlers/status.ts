/**
 * Status Handler
 *
 * Fetches the user's integration connection status from WorkOS Pipes API.
 */

import type { AuthInfo } from "@modelcontextprotocol/sdk/server/auth/types.js";
import type { BridgeResponse } from "../bridge-types";

/**
 * Integration status response
 */
export interface IntegrationStatus {
  id: string;
  name: string;
  slug: string;
  type: string;
  status: string;
  isConnected: boolean;
  scopes: string[];
}

/**
 * Handles fetching integration status from WorkOS Pipes API
 *
 * @param authInfo - Authenticated user info from MCP
 * @returns Bridge response with integration status array
 */
export async function handleGetStatus(
  authInfo: AuthInfo,
): Promise<BridgeResponse<{ integrations: IntegrationStatus[] }>> {
  try {
    const response = await fetch(
      "https://api.workos.com/_widgets/DataIntegrations/mine",
      {
        method: "GET",
        headers: {
          Authorization: `Bearer ${authInfo.token}`,
          "Content-Type": "application/json",
          "workos-widgets-type": "pipes",
          "workos-widgets-version": "1",
        },
      },
    );

    if (!response.ok) {
      const errorBody = await response.text();
      return {
        success: false,
        error: {
          code: "WORKOS_API_ERROR",
          message: `WorkOS API error: ${response.status} - ${errorBody}`,
        },
      };
    }

    const data = await response.json();

    // Transform to a simplified format
    const integrations: IntegrationStatus[] = data.data.map(
      (integration: {
        id: string;
        name: string;
        slug: string;
        integrationType: string;
        scopes: string[];
        installation: { state: string; scopes: string[] } | null;
      }) => ({
        id: integration.id,
        name: integration.name,
        slug: integration.slug,
        type: integration.integrationType,
        status: integration.installation?.state ?? "not_connected",
        isConnected: integration.installation?.state === "connected",
        // Use installation scopes if connected (actual granted scopes), otherwise available scopes
        scopes: integration.installation?.scopes ?? integration.scopes,
      }),
    );

    return {
      success: true,
      data: { integrations },
    };
  } catch (error) {
    console.error("Failed to fetch integration status:", error);
    return {
      success: false,
      error: {
        code: "FETCH_ERROR",
        message:
          error instanceof Error
            ? error.message
            : "Failed to fetch integration status",
      },
    };
  }
}
