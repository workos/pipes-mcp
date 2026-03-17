import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  withAuthMock,
  getSignInUrlMock,
  decryptApprovalTokenMock,
  loadAuthorityGrantMock,
  ApprovalErrorScreenMock,
  ApprovalResultScreenMock,
  BroadApprovalScreenMock,
  RequestApprovalScreenMock,
  redirectMock,
} = vi.hoisted(() => ({
  withAuthMock: vi.fn(),
  getSignInUrlMock: vi.fn(),
  decryptApprovalTokenMock: vi.fn(),
  loadAuthorityGrantMock: vi.fn(),
  ApprovalErrorScreenMock: vi.fn(() => null),
  ApprovalResultScreenMock: vi.fn(() => null),
  BroadApprovalScreenMock: vi.fn(() => null),
  RequestApprovalScreenMock: vi.fn(() => null),
  redirectMock: vi.fn(),
}));

vi.mock("@workos-inc/authkit-nextjs", () => ({
  getSignInUrl: getSignInUrlMock,
  withAuth: withAuthMock,
}));

vi.mock("next/navigation", () => ({
  redirect: redirectMock,
}));

vi.mock("@/lib/mcp/approval-token", () => ({
  decryptApprovalToken: decryptApprovalTokenMock,
}));

vi.mock("@/lib/mcp/session-store", () => ({
  loadAuthorityGrant: loadAuthorityGrantMock,
}));

vi.mock("./screens", () => ({
  ApprovalErrorScreen: ApprovalErrorScreenMock,
  ApprovalResultScreen: ApprovalResultScreenMock,
  BroadApprovalScreen: BroadApprovalScreenMock,
  RequestApprovalScreen: RequestApprovalScreenMock,
}));

(globalThis as typeof globalThis & { React: typeof React }).React = React;

describe("approve page", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it("blocks mismatched users before loading request grant details", async () => {
    withAuthMock.mockResolvedValue({
      user: { id: "user_current" },
    });
    decryptApprovalTokenMock.mockResolvedValue({
      userId: "user_expected",
      authority: "request",
      requestDetails: {
        method: "POST",
        url: "https://api.linear.app/graphql",
      },
      jti: "grant_123",
    });

    const { default: ApprovePage } = await import("./page");
    const result = await ApprovePage({
      searchParams: Promise.resolve({ token: "tok_123" }),
    });

    expect(result.type).toBe(ApprovalErrorScreenMock);
    expect(result.props.message).toBe(
      "This approval link was generated for a different user.",
    );
    expect(loadAuthorityGrantMock).not.toHaveBeenCalled();
    expect(RequestApprovalScreenMock).not.toHaveBeenCalled();
  });
});
