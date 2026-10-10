import { describe, expect, it, vi } from "vitest";
import type { PipesSession } from "../../session";

vi.mock("@/lib/mcp/bridge-handlers/status", () => ({
  handleGetStatus: vi.fn(),
}));
vi.mock("@/lib/mcp/with-authkit", () => ({ requireMcpAuthInfo: vi.fn() }));

import { handleBroadAuthority } from "../request-elevated-access-tool";

describe("handleBroadAuthority", () => {
  it("rejects unknown providers before creating an approval request", async () => {
    const session: PipesSession = {
      sid: "sid_123",
      userId: "user_123",
      organizationId: "org_123",
      userEmail: "user@example.com",
      createdAt: Date.now(),
      activeGrant: null,
      pendingGrant: null,
      activeRequestGrant: null,
    };

    const result = await handleBroadAuthority(
      { authority: "read", providers: ["made-up"] },
      { session, auth: {} as never },
    );

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toBe(
      "Unsupported provider(s): made-up. Supported providers: linear, notion, snowflake.",
    );
  });
});
