import Redis from "ioredis";
import {
  type AuthorityGrantRecord,
  approveGrant,
  denyGrant,
  type RequestAuthorityGrant,
} from "./authority-grants";
import type { LegacySession, StoredPipesSession } from "./session-types";

const SESSION_KEY_PREFIX = "pipes:mcp:session:";
const APPROVAL_TOKEN_KEY_PREFIX = "pipes:mcp:approval-token:";
const AUTHORITY_GRANT_KEY_PREFIX = "pipes:mcp:authority-grant:";

const globalStore = globalThis as unknown as {
  __pipesMcpRedis?: Redis;
};

function getRedisUrl(): string {
  const url = process.env.REDIS_URL;
  if (!url) {
    throw new Error(
      "REDIS_URL is required for MCP session storage. Start Redis locally or point this template at a shared Redis instance.",
    );
  }
  return url;
}

function getRedis(): Redis {
  if (!globalStore.__pipesMcpRedis) {
    const client = new Redis(getRedisUrl(), {
      maxRetriesPerRequest: 1,
    });
    globalStore.__pipesMcpRedis = client;
  }

  return globalStore.__pipesMcpRedis;
}

function getSessionKey(sid: string, orgId?: string): string {
  return `${SESSION_KEY_PREFIX}${sid}:${orgId ?? ""}`;
}

export async function loadSession(
  sid: string,
  orgId?: string,
): Promise<LegacySession | null> {
  const raw = await getRedis().get(getSessionKey(sid, orgId));
  if (!raw) return null;
  return JSON.parse(raw) as LegacySession;
}

export async function saveSession(
  session: StoredPipesSession,
  ttlMs: number,
): Promise<void> {
  await getRedis().set(
    getSessionKey(session.sid, session.organizationId),
    JSON.stringify(session),
    "PX",
    ttlMs,
  );
}

export async function deleteSession(
  sid: string,
  orgId?: string,
): Promise<void> {
  await getRedis().del(getSessionKey(sid, orgId));
}

export async function consumeApprovalToken(
  jti: string,
  ttlMs: number,
): Promise<boolean> {
  const result = await getRedis().set(
    `${APPROVAL_TOKEN_KEY_PREFIX}${jti}`,
    "1",
    "PX",
    ttlMs,
    "NX",
  );
  return result === "OK";
}

function getAuthorityGrantKey(grantId: string): string {
  return `${AUTHORITY_GRANT_KEY_PREFIX}${grantId}`;
}

export async function saveAuthorityGrant(
  grant: AuthorityGrantRecord,
  ttlMs: number,
): Promise<void> {
  await getRedis().set(
    getAuthorityGrantKey(grant.id),
    JSON.stringify(grant),
    "PX",
    ttlMs,
  );
}

export async function loadAuthorityGrant(
  grantId: string,
): Promise<AuthorityGrantRecord | null> {
  const raw = await getRedis().get(getAuthorityGrantKey(grantId));
  if (!raw) return null;
  return JSON.parse(raw) as AuthorityGrantRecord;
}

export async function deleteAuthorityGrant(grantId: string): Promise<void> {
  await getRedis().del(getAuthorityGrantKey(grantId));
}

interface ResolveAuthorityGrantOptions {
  providers?: string[];
  userInstructions: string | null;
}

type GrantMutationResult<T> =
  | {
      action: "set";
      nextGrant: AuthorityGrantRecord;
      value: T;
    }
  | {
      action: "delete";
      value: T;
    };

async function mutateAuthorityGrant<T>(
  grantId: string,
  mutate: (
    grant: AuthorityGrantRecord,
    ttlMs: number,
  ) => GrantMutationResult<T> | null,
): Promise<T | null> {
  const redis = getRedis();
  const key = getAuthorityGrantKey(grantId);

  for (let attempt = 0; attempt < 5; attempt += 1) {
    await redis.watch(key);
    const raw = await redis.get(key);
    if (!raw) {
      await redis.unwatch();
      return null;
    }

    const grant = JSON.parse(raw) as AuthorityGrantRecord;
    const ttl = await redis.pttl(key);
    if (ttl <= 0) {
      await redis.unwatch();
      return null;
    }

    const mutation = mutate(grant, ttl);
    if (!mutation) {
      await redis.unwatch();
      return null;
    }

    const transaction =
      mutation.action === "set"
        ? redis.multi().set(key, JSON.stringify(mutation.nextGrant), "PX", ttl)
        : redis.multi().del(key);

    const result = await transaction.exec();
    if (result !== null) {
      return mutation.value;
    }
  }

  return null;
}

export async function resolveAuthorityGrant(
  grantId: string,
  outcome: "approved" | "denied",
  options: ResolveAuthorityGrantOptions,
): Promise<AuthorityGrantRecord | null> {
  return mutateAuthorityGrant(grantId, (grant) => {
    if (grant.status !== "pending") {
      return null;
    }

    const resolved =
      grant.kind === "broad"
        ? outcome === "approved"
          ? approveGrant(grant, {
              providers: options.providers,
              userInstructions: options.userInstructions,
            })
          : denyGrant(grant, options.userInstructions)
        : outcome === "approved"
          ? approveGrant(grant, {
              providers: options.providers,
              userInstructions: options.userInstructions,
            })
          : denyGrant(grant, options.userInstructions);

    return {
      action: "set",
      nextGrant: resolved,
      value: resolved,
    };
  });
}

/**
 * Consume an approved request grant for call_integration_api.
 * The grant must belong to the caller's session identity.
 */
export async function consumeApprovedRequestGrant(
  grantId: string,
  expected: {
    sid: string;
    organizationId?: string;
    userId: string;
  },
): Promise<RequestAuthorityGrant<"approved"> | null> {
  return mutateAuthorityGrant(grantId, (grant) => {
    if (
      grant.kind !== "request" ||
      grant.status !== "approved" ||
      grant.sid !== expected.sid ||
      grant.userId !== expected.userId ||
      grant.organizationId !== expected.organizationId
    ) {
      return null;
    }

    return {
      action: "delete",
      value: grant,
    };
  }) as Promise<RequestAuthorityGrant<"approved"> | null>;
}
