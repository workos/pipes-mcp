/**
 * Status Handler
 *
 * Fetches the user's integration connection status from WorkOS Pipes API.
 */

import { getWorkOSClient } from "@/lib/workos-client";
import type { BridgeResponse } from "../bridge-types";
import type { McpAuthInfo } from "../with-authkit";

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

interface ConnectedAccount {
  scopes: string[];
  state: "connected" | "needs_reauthorization" | "disconnected";
}

interface DataProvider {
  id: string;
  name: string;
  slug: string;
  integration_type: string;
  scopes: string[] | null;
  connected_account: ConnectedAccount | null;
}

/**
 * Handles fetching integration status from WorkOS Pipes API
 *
 * @param authInfo - Authenticated user info from MCP
 * @returns Bridge response with integration status array
 */
export async function handleGetStatus(
  authInfo: McpAuthInfo,
): Promise<BridgeResponse<{ integrations: IntegrationStatus[] }>> {
  try {
    const { data } = await getWorkOSClient().get<{
      object: "list";
      data: DataProvider[];
    }>(`user_management/users/${authInfo.extra.userId}/data_providers`, {
      query: authInfo.extra.organizationId
        ? { organization_id: authInfo.extra.organizationId }
        : undefined,
    });

    // Transform to a simplified format
    const integrations: IntegrationStatus[] = data.data.map((integration) => ({
      id: integration.id,
      name: integration.name,
      slug: integration.slug,
      type: integration.integration_type,
      status: integration.connected_account?.state ?? "not_connected",
      isConnected: integration.connected_account?.state === "connected",
      // Use connected-account scopes when present; otherwise show configured provider scopes.
      scopes: integration.connected_account?.scopes ?? integration.scopes ?? [],
    }));

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
