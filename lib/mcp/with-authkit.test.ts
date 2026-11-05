import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  process.env.AUTHKIT_DOMAIN = "example.authkit.app";
  process.env.WORKOS_CLIENT_ID = "client_123";
  return {
    jwtVerify: vi.fn(),
    getUser: vi.fn(),
    getOrCreateSession: vi.fn(),
  };
});

vi.mock("jose", () => ({
  createRemoteJWKSet: vi.fn(() => ({})),
  jwtVerify: mocks.jwtVerify,
}));

vi.mock("@workos-inc/authkit-nextjs", () => ({
  getWorkOS: () => ({ userManagement: { getUser: mocks.getUser } }),
}));

vi.mock("./session", () => ({
  getOrCreateSession: mocks.getOrCreateSession,
  getSessionAuthority: vi.fn(() => "none"),
}));

import { verifyToken } from "./with-authkit";

const userClaims = {
  sub: "user_123",
  sid: "session_123",
  jti: "jti_123",
  exp: 4_102_444_800,
};

describe("verifyToken", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, "error").mockImplementation(() => {});
    mocks.getUser.mockResolvedValue({
      id: "user_123",
      email: "user@example.com",
    });
    mocks.getOrCreateSession.mockResolvedValue({});
  });

  it("verifies the issuer and audience", async () => {
    mocks.jwtVerify.mockResolvedValue({ payload: userClaims });

    const authInfo = await verifyToken(new Request("https://x"), "token");

    expect(authInfo?.extra.userId).toBe("user_123");
    expect(mocks.jwtVerify).toHaveBeenCalledWith("token", expect.anything(), {
      audience: "client_123",
      issuer: "https://example.authkit.app",
    });
  });

  it("accepts tokens with sub_profile user", async () => {
    mocks.jwtVerify.mockResolvedValue({
      payload: { ...userClaims, sub_profile: "user" },
    });

    expect(await verifyToken(new Request("https://x"), "token")).toBeDefined();
  });

  it("rejects agent tokens", async () => {
    mocks.jwtVerify.mockResolvedValue({
      payload: { ...userClaims, sub_profile: "ai_agent" },
    });

    expect(
      await verifyToken(new Request("https://x"), "token"),
    ).toBeUndefined();
    expect(mocks.getUser).not.toHaveBeenCalled();
  });
});
