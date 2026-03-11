import Redis from "ioredis";
import type { PipesSession } from "./session";

const SESSION_KEY_PREFIX = "pipes:mcp:session:";
const APPROVAL_TOKEN_KEY_PREFIX = "pipes:mcp:approval-token:";
const APPROVAL_RESULT_KEY_PREFIX = "pipes:mcp:approval-result:";

/** Stored outcome of an approval request (approve or deny). */
export interface ApprovalResult {
  approvalId: string;
  outcome: "approved" | "denied";
  authority: "read" | "write";
  /** Provider slugs the user selected (only for approved) */
  providers: string[];
  /** Custom instructions from the human approver (only for approved) */
  userInstructions: string | null;
  resolvedAt: number;
}

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
    globalStore.__pipesMcpRedis = new Redis(getRedisUrl(), {
      enableOfflineQueue: false,
      lazyConnect: true,
      maxRetriesPerRequest: 1,
    });
  }

  return globalStore.__pipesMcpRedis;
}

function getSessionKey(sid: string): string {
  return `${SESSION_KEY_PREFIX}${sid}`;
}

export async function loadSession(sid: string): Promise<PipesSession | null> {
  const raw = await getRedis().get(getSessionKey(sid));
  if (!raw) return null;
  return JSON.parse(raw) as PipesSession;
}

export async function saveSession(
  session: PipesSession,
  ttlMs: number,
): Promise<void> {
  await getRedis().set(
    getSessionKey(session.sid),
    JSON.stringify(session),
    "PX",
    ttlMs,
  );
}

export async function deleteSession(sid: string): Promise<void> {
  await getRedis().del(getSessionKey(sid));
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

/** Store the outcome of an approval request. TTL matches authority TTL. */
export async function saveApprovalResult(
  result: ApprovalResult,
  ttlMs: number,
): Promise<void> {
  await getRedis().set(
    `${APPROVAL_RESULT_KEY_PREFIX}${result.approvalId}`,
    JSON.stringify(result),
    "PX",
    ttlMs,
  );
}

/** Load the outcome of an approval request by its ID. */
export async function loadApprovalResult(
  approvalId: string,
): Promise<ApprovalResult | null> {
  const raw = await getRedis().get(
    `${APPROVAL_RESULT_KEY_PREFIX}${approvalId}`,
  );
  if (!raw) return null;
  return JSON.parse(raw) as ApprovalResult;
}
