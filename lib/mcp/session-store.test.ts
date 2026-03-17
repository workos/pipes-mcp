import { beforeEach, describe, expect, it, vi } from "vitest";
import { createPendingGrant } from "./authority-grants";

const { MockRedis } = vi.hoisted(() => {
  class MockMulti {
    private readonly operations: Array<() => void> = [];

    set(key: string, value: string, _mode: "PX", ttlMs: number) {
      this.operations.push(() => {
        MockRedis.write(key, value, ttlMs);
      });
      return this;
    }

    del(key: string) {
      this.operations.push(() => {
        MockRedis.deleteKey(key);
      });
      return this;
    }

    async exec() {
      for (const operation of this.operations) {
        operation();
      }
      return [];
    }
  }

  class MockRedis {
    private static readonly records = new Map<
      string,
      { value: string; expiresAt: number | null }
    >();

    static reset() {
      MockRedis.records.clear();
    }

    static write(key: string, value: string, ttlMs?: number) {
      MockRedis.records.set(key, {
        value,
        expiresAt: typeof ttlMs === "number" ? Date.now() + ttlMs : null,
      });
    }

    static deleteKey(key: string) {
      MockRedis.records.delete(key);
    }

    private static read(key: string) {
      const record = MockRedis.records.get(key);
      if (!record) {
        return null;
      }

      if (record.expiresAt !== null && record.expiresAt <= Date.now()) {
        MockRedis.records.delete(key);
        return null;
      }

      return record;
    }

    async get(key: string) {
      return MockRedis.read(key)?.value ?? null;
    }

    async set(
      key: string,
      value: string,
      mode?: "PX",
      ttlMs?: number,
      condition?: "NX",
    ) {
      if (condition === "NX" && MockRedis.read(key)) {
        return null;
      }

      MockRedis.write(key, value, mode === "PX" ? ttlMs : undefined);
      return "OK";
    }

    async del(key: string) {
      MockRedis.deleteKey(key);
      return 1;
    }

    async pttl(key: string) {
      const record = MockRedis.read(key);
      if (!record) return -2;
      if (record.expiresAt === null) return -1;
      return Math.max(record.expiresAt - Date.now(), 0);
    }

    async watch(_key: string) {
      return "OK";
    }

    async unwatch() {
      return "OK";
    }

    multi() {
      return new MockMulti();
    }
  }

  return { MockRedis };
});

vi.mock("ioredis", () => ({
  default: MockRedis,
}));

import {
  consumeApprovedRequestGrant,
  loadAuthorityGrant,
  resolveAuthorityGrant,
  saveAuthorityGrant,
} from "./session-store";

describe("session-store authority grant helpers", () => {
  beforeEach(() => {
    process.env.REDIS_URL = "redis://example";
    MockRedis.reset();
    delete (globalThis as { __pipesMcpRedis?: unknown }).__pipesMcpRedis;
  });

  it("resolves a pending broad grant in place", async () => {
    const pendingGrant = createPendingGrant({
      id: "grant_broad",
      kind: "broad",
      sid: "sid_123",
      userId: "user_123",
      userEmail: "user@example.com",
      organizationId: "org_123",
      authority: "read",
      expiresAt: Date.now() + 60_000,
    });

    await saveAuthorityGrant(pendingGrant, 60_000);

    const resolvedGrant = await resolveAuthorityGrant(
      pendingGrant.id,
      "approved",
      {
        providers: ["linear"],
        userInstructions: "Only use read access",
      },
    );

    expect(resolvedGrant?.status).toBe("approved");
    expect(resolvedGrant?.providers).toEqual(["linear"]);
    expect(resolvedGrant?.userInstructions).toBe("Only use read access");

    const storedGrant = await loadAuthorityGrant(pendingGrant.id);
    expect(storedGrant).toEqual(resolvedGrant);
  });

  it("consumes approved request grants only for the matching identity", async () => {
    const pendingGrant = createPendingGrant({
      id: "grant_request",
      kind: "request",
      sid: "sid_123",
      userId: "user_123",
      userEmail: "user@example.com",
      organizationId: "org_123",
      authority: "write",
      providers: ["linear"],
      expiresAt: Date.now() + 60_000,
      request: {
        url: "https://api.linear.app/graphql",
        method: "POST",
        body: { query: "mutation { issueCreate { success } }" },
      },
    });

    await saveAuthorityGrant(pendingGrant, 60_000);
    await resolveAuthorityGrant(pendingGrant.id, "approved", {
      userInstructions: "Proceed carefully",
    });

    const deniedConsumption = await consumeApprovedRequestGrant(
      pendingGrant.id,
      {
        sid: "sid_other",
        userId: "user_123",
        organizationId: "org_123",
      },
    );
    expect(deniedConsumption).toBeNull();

    const approvedConsumption = await consumeApprovedRequestGrant(
      pendingGrant.id,
      {
        sid: "sid_123",
        userId: "user_123",
        organizationId: "org_123",
      },
    );
    expect(approvedConsumption?.id).toBe(pendingGrant.id);
    expect(approvedConsumption?.status).toBe("approved");

    const secondConsumption = await consumeApprovedRequestGrant(
      pendingGrant.id,
      {
        sid: "sid_123",
        userId: "user_123",
        organizationId: "org_123",
      },
    );
    expect(secondConsumption).toBeNull();
  });
});
