import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { handleAuthMock } = vi.hoisted(() => ({
  handleAuthMock: vi.fn(),
}));

vi.mock("@workos-inc/authkit-nextjs", () => ({
  handleAuth: handleAuthMock,
}));

vi.mock("@/lib/mcp/session", () => ({
  extractSidFromAccessToken: vi.fn(),
  hydrateSessionOnLogin: vi.fn(),
}));

describe("callback route", () => {
  beforeEach(() => {
    vi.resetModules();
    handleAuthMock.mockReset();
  });

  it("passes through the AuthKit callback response", async () => {
    const callbackResponse = Response.redirect(
      "http://localhost:5711/approve?token=tok_123",
      307,
    );
    handleAuthMock.mockReturnValue(async () => callbackResponse);

    const { GET } = await import("./route");
    const request = new NextRequest("http://localhost:5711/callback?code=abc");
    const response = await GET(request);

    expect(response).toBe(callbackResponse);
  });

  it("falls back to the encoded returnPathname when the handler returns nothing", async () => {
    handleAuthMock.mockReturnValue(async () => undefined);

    const { GET } = await import("./route");
    const state = Buffer.from(
      JSON.stringify({ returnPathname: "/approve?token=tok_123" }),
      "utf8",
    ).toString("base64url");
    const request = new NextRequest(
      `http://localhost:5711/callback?code=abc&state=${state}`,
    );

    const response = await GET(request);

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe(
      "http://localhost:5711/approve?token=tok_123",
    );
  });
});
