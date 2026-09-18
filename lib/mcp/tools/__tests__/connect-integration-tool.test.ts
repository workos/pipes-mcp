import { describe, expect, it, vi } from "vitest";

const { postMock, getMock } = vi.hoisted(() => ({
  postMock: vi.fn(),
  getMock: vi.fn(),
}));

vi.mock("@/lib/workos-client", () => ({
  getWorkOSClient: () => ({
    post: postMock,
    get: getMock,
  }),
}));

vi.mock("@workos-inc/authkit-nextjs", () => ({
  getWorkOS: () => ({}),
}));

vi.mock("../../with-authkit", () => ({
  getOrganizationIdFromAuthInfo: vi.fn(
    (authInfo: any) => authInfo.extra.organizationId,
  ),
}));

vi.mock("../../session", () => ({
  extractSid: vi.fn(() => "sid_test"),
  getOrCreateSession: vi.fn(async () => ({
    sid: "sid_test",
    userId: "user_1",
    organizationId: "org_1",
    activeGrant: null,
    pendingGrant: null,
    activeRequestGrant: null,
  })),
  getSessionAuthority: vi.fn(() => "none"),
  requireReadMode: vi.fn(),
  SessionError: class SessionError extends Error {},
}));

vi.mock("../../session-store", () => ({
  loadSession: vi.fn(),
  saveSession: vi.fn(),
}));

interface McpAuthInfo {
  token: string;
  clientId: string;
  scopes: string[];
  extra: {
    userId: string;
    userEmail: string;
    organizationId?: string;
    claims: { sub: string; sid: string; jti: string };
  };
}

function createAuthInfo(
  overrides: Partial<McpAuthInfo["extra"]> = {},
): McpAuthInfo {
  return {
    token: "test-token",
    clientId: "test-client",
    scopes: ["pipes:read"],
    extra: {
      userId: "user_1",
      userEmail: "test@example.com",
      organizationId: "org_1",
      claims: { sub: "user_1", sid: "sid_test", jti: "jti_test" },
      ...overrides,
    },
  };
}

function mockIntegrationList(slugs: string[]) {
  getMock.mockResolvedValue({
    data: {
      object: "list",
      data: slugs.map((slug) => ({
        id: `int_${slug}`,
        name: slug.charAt(0).toUpperCase() + slug.slice(1),
        slug,
        integration_type: slug,
        scopes: [],
        connected_account: { scopes: [], state: "connected" },
      })),
    },
  });
}

describe("connect_integration tool — slug validation", () => {
  let registeredHandler: (params: any, context: any) => Promise<any>;

  const setup = async () => {
    const mod = await import("../connect-integration-tool");
    const mockServer = {
      registerTool: vi.fn((_name: string, _config: any, handler: any) => {
        registeredHandler = handler;
      }),
    };
    mod.registerConnectIntegrationTool(mockServer);
  };

  it("rejects slug with path traversal sequences", async () => {
    await setup();

    const result = await registeredHandler(
      { slug: "../user_management/organization_memberships#" },
      { authInfo: createAuthInfo() },
    );

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("Invalid integration slug");
  });

  it("rejects slug containing forward slashes", async () => {
    await setup();

    const result = await registeredHandler(
      { slug: "foo/bar" },
      { authInfo: createAuthInfo() },
    );

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("Invalid integration slug");
  });

  it("rejects slug containing hash character", async () => {
    await setup();

    const result = await registeredHandler(
      { slug: "linear#fragment" },
      { authInfo: createAuthInfo() },
    );

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("Invalid integration slug");
  });

  it("rejects slug containing question mark", async () => {
    await setup();

    const result = await registeredHandler(
      { slug: "linear?param=value" },
      { authInfo: createAuthInfo() },
    );

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("Invalid integration slug");
  });

  it("rejects slug with dot-dot traversal", async () => {
    await setup();

    const result = await registeredHandler(
      { slug: "../webhooks#" },
      { authInfo: createAuthInfo() },
    );

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("Invalid integration slug");
  });

  it("rejects empty slug", async () => {
    await setup();

    const result = await registeredHandler(
      { slug: "" },
      { authInfo: createAuthInfo() },
    );

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("Invalid integration slug");
  });

  it("rejects slug not in the live integration list", async () => {
    await setup();
    mockIntegrationList(["linear", "notion"]);

    const result = await registeredHandler(
      { slug: "unknown-provider" },
      { authInfo: createAuthInfo() },
    );

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("Unknown integration");
    expect(result.content[0].text).toContain("linear, notion");
  });

  it("allows valid slug that exists in integration list", async () => {
    await setup();
    mockIntegrationList(["linear"]);

    postMock.mockResolvedValue({
      data: { url: "https://auth.example.com/authorize" },
    });

    const result = await registeredHandler(
      { slug: "linear" },
      { authInfo: createAuthInfo() },
    );

    expect(result.isError).toBeUndefined();
    expect(result.content[0].text).toContain(
      "https://auth.example.com/authorize",
    );
    expect(postMock).toHaveBeenCalledWith(
      "data-integrations/linear/authorize",
      {
        user_id: "user_1",
        organization_id: "org_1",
      },
    );
  });

  it("allows hyphenated slug that exists in integration list", async () => {
    await setup();
    mockIntegrationList(["my-provider"]);

    postMock.mockResolvedValue({
      data: { url: "https://auth.example.com/authorize" },
    });

    const result = await registeredHandler(
      { slug: "my-provider" },
      { authInfo: createAuthInfo() },
    );

    expect(result.isError).toBeUndefined();
    expect(result.content[0].text).toContain(
      "https://auth.example.com/authorize",
    );
  });

  it("returns error when organization context is missing", async () => {
    await setup();

    const result = await registeredHandler(
      { slug: "linear" },
      { authInfo: createAuthInfo({ organizationId: undefined }) },
    );

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain(
      "Organization context is required",
    );
  });
});
