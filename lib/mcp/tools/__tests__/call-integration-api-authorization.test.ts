import { describe, expect, it } from "vitest";
import type { PipesSession } from "../../session";
import { SessionError } from "../../session";
import { authorizeBroadIntegrationRequest } from "../call-integration-api-authorization";

function createSession(overrides: Partial<PipesSession> = {}): PipesSession {
  return {
    sid: "sid_123",
    userId: "user_123",
    organizationId: "org_123",
    userEmail: "user@example.com",
    createdAt: Date.now(),
    activeGrant: null,
    pendingGrant: null,
    activeRequestGrant: null,
    ...overrides,
  };
}

describe("authorizeBroadIntegrationRequest", () => {
  it("allows a request already covered by the broad grant", () => {
    const session = createSession({
      activeGrant: {
        id: "grant_broad",
        kind: "broad",
        status: "approved",
        sid: "sid_123",
        userId: "user_123",
        userEmail: "user@example.com",
        organizationId: "org_123",
        authority: "write",
        providers: ["linear"],
        createdAt: Date.now(),
        expiresAt: Date.now() + 300_000,
        userInstructions: null,
        resolvedAt: Date.now(),
        request: null,
      },
    });

    const result = authorizeBroadIntegrationRequest(session, {
      method: "POST",
      url: "https://api.linear.app/graphql",
      body: { query: "mutation { issueCreate { success } }" },
    });

    expect(result).toEqual({
      kind: "authorized",
      provider: "linear",
    });
  });

  it("denies when the broad grant does not include the provider", () => {
    const session = createSession({
      activeGrant: {
        id: "grant_broad",
        kind: "broad",
        status: "approved",
        sid: "sid_123",
        userId: "user_123",
        userEmail: "user@example.com",
        organizationId: "org_123",
        authority: "write",
        providers: ["notion"],
        createdAt: Date.now(),
        expiresAt: Date.now() + 300_000,
        userInstructions: null,
        resolvedAt: Date.now(),
        request: null,
      },
    });

    const result = authorizeBroadIntegrationRequest(session, {
      method: "POST",
      url: "https://api.linear.app/graphql",
      body: { query: "mutation { issueCreate { success } }" },
    });

    expect(result.kind).toBe("denied");
    if (result.kind !== "denied") {
      throw new Error("Expected broad authorization to be denied");
    }
    expect(result.error).toBeInstanceOf(SessionError);
    expect(result.error.code).toBe("PROVIDER_NOT_ALLOWED");
  });

  it("denies write requests when the broad grant is read-only", () => {
    const session = createSession({
      activeGrant: {
        id: "grant_broad",
        kind: "broad",
        status: "approved",
        sid: "sid_123",
        userId: "user_123",
        userEmail: "user@example.com",
        organizationId: "org_123",
        authority: "read",
        providers: ["linear"],
        createdAt: Date.now(),
        expiresAt: Date.now() + 300_000,
        userInstructions: null,
        resolvedAt: Date.now(),
        request: null,
      },
    });

    const result = authorizeBroadIntegrationRequest(session, {
      method: "POST",
      url: "https://api.linear.app/graphql",
      body: { query: "mutation { issueCreate { success } }" },
    });

    expect(result.kind).toBe("denied");
    if (result.kind !== "denied") {
      throw new Error("Expected broad authorization to be denied");
    }
    expect(result.error).toBeInstanceOf(SessionError);
    expect(result.error.code).toBe("WRITE_NOT_ALLOWED");
  });
});
