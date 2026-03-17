import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createPendingGrant } from "../../authority-grants";
import {
  clearActiveRequestGrant,
  getOrCreateSession,
  setActiveRequestGrant,
} from "../../session";
import { saveAuthorityGrant } from "../../session-store";

/**
 * In-memory store that mimics Redis keyed by sid:orgId (composite key).
 * We mock the session-store module so no Redis connection is needed.
 */
const store = new Map<string, string>();
const grantStore = new Map<string, string>();

vi.mock("../../session-store", () => ({
  loadSession: vi.fn(async (sid: string, orgId?: string) => {
    const key = `pipes:mcp:session:${sid}:${orgId ?? ""}`;
    const raw = store.get(key);
    return raw ? JSON.parse(raw) : null;
  }),
  saveSession: vi.fn(async (session: any, _ttlMs: number) => {
    const key = `pipes:mcp:session:${session.sid}:${session.organizationId ?? ""}`;
    store.set(key, JSON.stringify(session));
  }),
  deleteSession: vi.fn(async (sid: string, orgId?: string) => {
    const key = `pipes:mcp:session:${sid}:${orgId ?? ""}`;
    store.delete(key);
  }),
  loadAuthorityGrant: vi.fn(async (grantId: string) => {
    const raw = grantStore.get(grantId);
    return raw ? JSON.parse(raw) : null;
  }),
  saveAuthorityGrant: vi.fn(async (grant: any, _ttlMs: number) => {
    grantStore.set(grant.id, JSON.stringify(grant));
  }),
  deleteAuthorityGrant: vi.fn(async (grantId: string) => {
    grantStore.delete(grantId);
  }),
}));

describe("getOrCreateSession — composite key (sid + orgId)", () => {
  beforeEach(() => {
    store.clear();
    grantStore.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("creates a new session with no authority", async () => {
    const session = await getOrCreateSession(
      "sid_1",
      "user_1",
      "org_A",
      "user@example.com",
    );

    expect(session.sid).toBe("sid_1");
    expect(session.organizationId).toBe("org_A");
    expect(session.activeGrant).toBeNull();
    expect(session.pendingGrant).toBeNull();
    expect(session.activeRequestGrant).toBeNull();
  });

  it("returns existing session when sid+org match", async () => {
    // Create initial session
    const _first = await getOrCreateSession(
      "sid_1",
      "user_1",
      "org_A",
      "user@example.com",
    );

    // Manually grant authority in store to verify it's preserved
    const key = `pipes:mcp:session:sid_1:org_A`;
    const stored = JSON.parse(store.get(key)!);
    stored.activeGrant = {
      id: "grant_1",
      kind: "broad",
      status: "approved",
      sid: "sid_1",
      userId: "user_1",
      userEmail: "user@example.com",
      organizationId: "org_A",
      authority: "write",
      providers: ["linear"],
      createdAt: Date.now(),
      expiresAt: Date.now() + 300_000,
      userInstructions: null,
      resolvedAt: Date.now(),
      request: null,
    };
    store.set(key, JSON.stringify(stored));

    // Same sid + org → returns existing with authority preserved
    const second = await getOrCreateSession(
      "sid_1",
      "user_1",
      "org_A",
      "user@example.com",
    );

    expect(second.activeGrant?.authority).toBe("write");
    expect(second.activeGrant?.providers).toEqual(["linear"]);
  });

  it("different org creates a separate session with no authority", async () => {
    // Create session for org A
    await getOrCreateSession("sid_1", "user_1", "org_A", "user@example.com");

    // Grant authority in org A's session
    const keyA = `pipes:mcp:session:sid_1:org_A`;
    const storedA = JSON.parse(store.get(keyA)!);
    storedA.activeGrant = {
      id: "grant_A",
      kind: "broad",
      status: "approved",
      sid: "sid_1",
      userId: "user_1",
      userEmail: "user@example.com",
      organizationId: "org_A",
      authority: "write",
      providers: ["linear"],
      createdAt: Date.now(),
      expiresAt: Date.now() + 300_000,
      userInstructions: null,
      resolvedAt: Date.now(),
      request: null,
    };
    store.set(keyA, JSON.stringify(storedA));

    // Switch to org B — different composite key, fresh session
    const sessionB = await getOrCreateSession(
      "sid_1",
      "user_1",
      "org_B",
      "user@example.com",
    );

    expect(sessionB.organizationId).toBe("org_B");
    expect(sessionB.activeGrant).toBeNull();

    // Org A's session is untouched
    const orgASession = JSON.parse(store.get(keyA)!);
    expect(orgASession.activeGrant.authority).toBe("write");
    expect(orgASession.activeGrant.providers).toEqual(["linear"]);
  });

  it("email-only change preserves authority", async () => {
    await getOrCreateSession("sid_1", "user_1", "org_A", "old@example.com");

    // Grant authority
    const key = `pipes:mcp:session:sid_1:org_A`;
    const stored = JSON.parse(store.get(key)!);
    stored.activeGrant = {
      id: "grant_email",
      kind: "broad",
      status: "approved",
      sid: "sid_1",
      userId: "user_1",
      userEmail: "old@example.com",
      organizationId: "org_A",
      authority: "write",
      providers: ["notion"],
      createdAt: Date.now(),
      expiresAt: Date.now() + 300_000,
      userInstructions: null,
      resolvedAt: Date.now(),
      request: null,
    };
    store.set(key, JSON.stringify(stored));

    // Same sid+org, different email
    const updated = await getOrCreateSession(
      "sid_1",
      "user_1",
      "org_A",
      "new@example.com",
    );

    expect(updated.userEmail).toBe("new@example.com");
    expect(updated.activeGrant?.authority).toBe("write");
    expect(updated.activeGrant?.providers).toEqual(["notion"]);
  });

  it("undefined org gets its own session separate from named orgs", async () => {
    // Session with no org
    const noOrg = await getOrCreateSession(
      "sid_1",
      "user_1",
      undefined,
      "user@example.com",
    );
    expect(noOrg.organizationId).toBeUndefined();

    // Session with org A
    const withOrg = await getOrCreateSession(
      "sid_1",
      "user_1",
      "org_A",
      "user@example.com",
    );
    expect(withOrg.organizationId).toBe("org_A");

    // They should be stored under different keys
    const noOrgKey = `pipes:mcp:session:sid_1:`;
    const orgAKey = `pipes:mcp:session:sid_1:org_A`;
    expect(store.has(noOrgKey)).toBe(true);
    expect(store.has(orgAKey)).toBe(true);
    expect(store.size).toBe(2);
  });

  it("tracks only one active request grant summary per session", async () => {
    await getOrCreateSession("sid_1", "user_1", "org_A", "user@example.com");

    await saveAuthorityGrant(
      createPendingGrant({
        id: "req_1",
        kind: "request",
        sid: "sid_1",
        userId: "user_1",
        userEmail: "user@example.com",
        organizationId: "org_A",
        authority: "write",
        providers: ["linear"],
        expiresAt: Date.now() + 300_000,
        request: {
          method: "POST",
          url: "https://api.linear.app/graphql",
        },
      }),
      300_000,
    );

    const first = await setActiveRequestGrant("sid_1", "org_A", {
      id: "req_1",
      status: "pending",
      authority: "write",
      providers: ["linear"],
      expiresAt: Date.now() + 300_000,
      request: {
        method: "POST",
        url: "https://api.linear.app/graphql",
      },
    });
    expect(first).toBeNull();

    await saveAuthorityGrant(
      {
        id: "req_2",
        kind: "request",
        status: "approved",
        sid: "sid_1",
        userId: "user_1",
        userEmail: "user@example.com",
        organizationId: "org_A",
        authority: "read",
        providers: ["notion"],
        createdAt: Date.now(),
        expiresAt: Date.now() + 300_000,
        userInstructions: null,
        resolvedAt: Date.now(),
        request: {
          method: "GET",
          url: "https://api.notion.com/v1/search",
        },
      },
      300_000,
    );

    const replaced = await setActiveRequestGrant("sid_1", "org_A", {
      id: "req_2",
      status: "approved",
      authority: "read",
      providers: ["notion"],
      expiresAt: Date.now() + 300_000,
      request: {
        method: "GET",
        url: "https://api.notion.com/v1/search",
      },
    });

    expect(replaced?.id).toBe("req_1");

    const key = `pipes:mcp:session:sid_1:org_A`;
    const stored = JSON.parse(store.get(key)!);
    expect(stored.activeRequestGrantId).toBe("req_2");
  });

  it("clears the active request grant only when the id matches", async () => {
    await getOrCreateSession("sid_1", "user_1", "org_A", "user@example.com");
    await saveAuthorityGrant(
      {
        id: "req_1",
        kind: "request",
        status: "approved",
        sid: "sid_1",
        userId: "user_1",
        userEmail: "user@example.com",
        organizationId: "org_A",
        authority: "write",
        providers: ["linear"],
        createdAt: Date.now(),
        expiresAt: Date.now() + 300_000,
        userInstructions: null,
        resolvedAt: Date.now(),
        request: {
          method: "POST",
          url: "https://api.linear.app/graphql",
        },
      },
      300_000,
    );
    await setActiveRequestGrant("sid_1", "org_A", {
      id: "req_1",
      status: "approved",
      authority: "write",
      providers: ["linear"],
      expiresAt: Date.now() + 300_000,
      request: {
        method: "POST",
        url: "https://api.linear.app/graphql",
      },
    });

    await clearActiveRequestGrant("sid_1", "org_A", "req_other");

    const key = `pipes:mcp:session:sid_1:org_A`;
    const stored = JSON.parse(store.get(key)!);
    expect(stored.activeRequestGrantId).toBe("req_1");

    await clearActiveRequestGrant("sid_1", "org_A", "req_1");

    expect(store.has(key)).toBe(false);
  });
});
