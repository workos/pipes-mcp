/**
 * Session Management
 *
 * Redis-backed MCP sessions keyed by the AuthKit JWT `sid` claim.
 * Session identity is stable across access-token refreshes; authority is not.
 */

import * as jose from "jose";
import { authorityIncludes, type PipesAuthority } from "./authority";
import { deleteSession, loadSession, saveSession } from "./session-store";
import type { McpAuthInfo } from "./with-authkit";

export interface PendingApproval {
  token: string;
  tokenJti: string;
  createdAt: number;
  expiresAt: number;
  authority: "read" | "write";
}

/** A pipes session scoping tool access */
export interface PipesSession {
  sid: string;
  userId: string;
  organizationId?: string;
  userEmail: string;
  createdAt: number;
  authority: PipesAuthority;
  authorityGrantedAt: number | null;
  authorityExpiresAt: number | null;
  /** Provider slugs the current authority applies to (e.g. ["linear", "notion"]) */
  allowedProviders: string[];
  pendingApproval: PendingApproval | null;
}

export class SessionError extends Error {
  constructor(
    public code:
      | "NO_SESSION"
      | "SESSION_EXPIRED"
      | "READ_NOT_ALLOWED"
      | "WRITE_NOT_ALLOWED"
      | "PROVIDER_NOT_ALLOWED",
    message: string,
  ) {
    super(message);
    this.name = "SessionError";
  }
}

function getSessionStoreTtlMs(): number {
  return Number(process.env.SESSION_TTL_MS) || 7 * 24 * 60 * 60 * 1000;
}

export function getAuthorityTtlMs(): number {
  return Number(process.env.SESSION_AUTHORITY_TTL_MS) || 5 * 60 * 1000;
}

export function extractSid(
  authInfo: Pick<McpAuthInfo, "extra">,
): string | null {
  const sid = authInfo.extra.claims.sid;
  return typeof sid === "string" ? sid : null;
}

export async function extractSidFromAccessToken(
  accessToken: string,
): Promise<string | null> {
  try {
    const payload = jose.decodeJwt(accessToken);
    return typeof payload.sid === "string" ? payload.sid : null;
  } catch {
    return null;
  }
}

async function persistSession(session: PipesSession): Promise<PipesSession> {
  await saveSession(session, getSessionStoreTtlMs());
  return session;
}

/** Delete from Redis if the session is idle (no authority, no pending approval). */
async function cleanupIfIdle(session: PipesSession): Promise<void> {
  if (session.authority === "none" && !session.pendingApproval) {
    await deleteSession(session.sid);
  }
}

function normalizeExpiredSession(session: PipesSession): {
  changed: boolean;
  session: PipesSession;
} {
  let changed = false;
  let nextSession = session;
  const now = Date.now();

  if (
    nextSession.authority !== "none" &&
    nextSession.authorityExpiresAt !== null &&
    nextSession.authorityExpiresAt <= now
  ) {
    nextSession = {
      ...nextSession,
      authority: "none",
      authorityGrantedAt: null,
      authorityExpiresAt: null,
      allowedProviders: [],
    };
    changed = true;
  }

  if (
    nextSession.pendingApproval &&
    nextSession.pendingApproval.expiresAt <= now
  ) {
    nextSession = {
      ...nextSession,
      pendingApproval: null,
    };
    changed = true;
  }

  return { changed, session: nextSession };
}

export async function getOrCreateSession(
  sid: string,
  userId: string,
  organizationId?: string,
  userEmail?: string,
): Promise<PipesSession> {
  const existing = await getSession(sid);
  if (existing) {
    if (
      existing.userId === userId &&
      existing.organizationId === organizationId &&
      existing.userEmail === (userEmail ?? "")
    ) {
      return existing;
    }

    return persistSession({
      ...existing,
      userId,
      organizationId,
      userEmail: userEmail ?? "",
    });
  }

  return persistSession({
    sid,
    userId,
    organizationId,
    userEmail: userEmail ?? "",
    createdAt: Date.now(),
    authority: "none",
    authorityGrantedAt: null,
    authorityExpiresAt: null,
    allowedProviders: [],
    pendingApproval: null,
  });
}

export async function hydrateSessionOnLogin(
  sid: string,
  userId: string,
  organizationId?: string,
  userEmail?: string,
): Promise<PipesSession> {
  const session = await getOrCreateSession(
    sid,
    userId,
    organizationId,
    userEmail,
  );
  return grantAuthority(session.sid, "read");
}

export async function grantAuthority(
  sid: string,
  authority: "read" | "write",
  allowedProviders?: string[],
): Promise<PipesSession> {
  const session = await getSession(sid);
  if (!session) {
    throw new SessionError(
      "NO_SESSION",
      "No active session found. Authentication may have failed.",
    );
  }

  const now = Date.now();
  return persistSession({
    ...session,
    authority,
    authorityGrantedAt: now,
    authorityExpiresAt: now + getAuthorityTtlMs(),
    allowedProviders: allowedProviders ?? [],
    pendingApproval: null,
  });
}

export async function releaseAuthority(
  sid: string,
): Promise<PipesSession | null> {
  const session = await getSession(sid);
  if (!session) return null;
  if (session.authority === "none") return null;

  const previousAuthority = session.authority;

  const released = {
    ...session,
    authority: "none" as const,
    authorityGrantedAt: null,
    authorityExpiresAt: null,
    allowedProviders: [] as string[],
    pendingApproval: null,
  };

  await cleanupIfIdle(released);

  return {
    ...session,
    authority: previousAuthority,
  };
}

export function hasAuthority(
  session: PipesSession,
  required: "read" | "write",
): boolean {
  return authorityIncludes(session.authority, required);
}

export function requireReadMode(session: PipesSession): void {
  if (!hasAuthority(session, "read")) {
    throw new SessionError(
      "READ_NOT_ALLOWED",
      'This operation requires Pipes read authority. Call request_pipes_authority with authority "read" to continue.',
    );
  }
}

export function requireWriteMode(session: PipesSession): void {
  if (!hasAuthority(session, "write")) {
    throw new SessionError(
      "WRITE_NOT_ALLOWED",
      'This operation requires Pipes write authority. Call request_pipes_authority with authority "write" to continue.',
    );
  }
}

export function requireProviderAccess(
  session: PipesSession,
  providerSlug: string,
): void {
  const providers = session.allowedProviders;
  if (providers.length === 0) {
    throw new SessionError(
      "PROVIDER_NOT_ALLOWED",
      "Authority was not granted for any providers. Call request_pipes_authority to request access.",
    );
  }
  if (!providers.includes(providerSlug)) {
    throw new SessionError(
      "PROVIDER_NOT_ALLOWED",
      `Authority was not granted for "${providerSlug}". ` +
        `Currently authorized providers: ${providers.join(", ")}. ` +
        `Call request_pipes_authority to request access for additional providers.`,
    );
  }
}

/** Normalize legacy sessions from Redis that lack newer fields. */
function normalizeSessionFields(session: PipesSession): PipesSession {
  if (!session.allowedProviders) {
    return { ...session, allowedProviders: [] };
  }
  return session;
}

export async function getSession(sid: string): Promise<PipesSession | null> {
  const raw = await loadSession(sid);
  if (!raw) return null;
  const session = normalizeSessionFields(raw);

  const normalized = normalizeExpiredSession(session);
  if (normalized.changed) {
    await cleanupIfIdle(normalized.session);
    if (
      normalized.session.authority === "none" &&
      !normalized.session.pendingApproval
    ) {
      return null;
    }
    return persistSession(normalized.session);
  }

  return normalized.session;
}

export async function setPendingApproval(
  sid: string,
  pendingApproval: PendingApproval,
): Promise<void> {
  const session = await getSession(sid);
  if (!session) return;

  await persistSession({
    ...session,
    pendingApproval,
  });
}

export async function clearPendingApproval(sid: string): Promise<void> {
  const session = await getSession(sid);
  if (!session) return;

  await persistSession({
    ...session,
    pendingApproval: null,
  });
}

export function hasPendingApproval(
  session: PipesSession,
  authority?: "read" | "write",
): boolean {
  if (!session.pendingApproval) return false;
  if (!authority) return true;
  return session.pendingApproval.authority === authority;
}
