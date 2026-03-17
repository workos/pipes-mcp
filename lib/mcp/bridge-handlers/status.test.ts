import { describe, expect, it, vi } from "vitest";
import type { McpAuthInfo } from "../with-authkit";

const { getMock } = vi.hoisted(() => ({
  getMock: vi.fn(),
}));

vi.mock("@/lib/workos-client", () => ({
  getWorkOSClient: () => ({
    get: getMock,
  }),
}));

describe("handleGetStatus", () => {
  it("uses the public data providers endpoint and maps connected account state", async () => {
    getMock.mockResolvedValue({
      data: {
        object: "list",
        data: [
          {
            id: "data_integration_1",
            name: "GitHub",
            slug: "github",
            integration_type: "github",
            scopes: ["repo"],
            connected_account: {
              scopes: ["repo", "user:email"],
              state: "connected",
            },
          },
          {
            id: "data_integration_2",
            name: "Slack",
            slug: "slack",
            integration_type: "slack",
            scopes: ["channels:read"],
            connected_account: null,
          },
        ],
      },
    });

    const { handleGetStatus } = await import("./status");
    const authInfo = {
      extra: {
        userId: "user_123",
        userEmail: "user@example.com",
        organizationId: "org_123",
        claims: {
          sid: "sid_123",
          sub: "user_123",
          jti: "jti_123",
        },
      },
    } as McpAuthInfo;

    const result = await handleGetStatus(authInfo);

    expect(getMock).toHaveBeenCalledWith(
      "user_management/users/user_123/data_providers",
      {
        query: { organization_id: "org_123" },
      },
    );
    expect(result).toEqual({
      success: true,
      data: {
        integrations: [
          {
            id: "data_integration_1",
            name: "GitHub",
            slug: "github",
            type: "github",
            status: "connected",
            isConnected: true,
            scopes: ["repo", "user:email"],
          },
          {
            id: "data_integration_2",
            name: "Slack",
            slug: "slack",
            type: "slack",
            status: "not_connected",
            isConnected: false,
            scopes: ["channels:read"],
          },
        ],
      },
    });
  });
});
