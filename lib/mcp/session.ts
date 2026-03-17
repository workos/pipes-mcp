/**
 * Session Management
 *
 * Redis-backed MCP sessions keyed by `sid + organizationId`.
 * Different orgs get separate sessions, so authority never leaks across orgs.
 */

import * as jose from "jose";
import type {
  ApprovedBroadAuthorityGrant,
  AuthorityGrantRecord,
  PendingBroadAuthorityGrant,
  RequestAuthorityGrant,
} from "./authority-grants";
import {
  isSessionIdle,
  normalizeExpiredSession,
  normalizeSessionFields,
} from "./session-normalization";
import {
  deleteSession,
  loadAuthorityGrant,
  loadSession,
  saveAuthorityGrant,
  saveSession,
} from "./session-store";
import type {
  LegacySession,
  PipesSession,
  SessionRequestGrant,
  StoredPipesSession,
} from "./session-types";
import type { McpAuthInfo } from "./with-authkit";

export {
  getSessionAuthority,
  getSessionAuthorityExpiresAt,
  getSessionProviders,
  hasAuthority,
  requireProviderAccess,
  requireReadMode,
  requireWriteMode,
  SessionError,
} from "./session-access";
export type { PipesSession } from "./session-types";

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

function getGrantStoreTtlMs(expiresAt: number): number {
  return Math.max(expiresAt - Date.now(), 1000);
}

function serializeSession(session: PipesSession): StoredPipesSession {
  return {
    sid: session.sid,
    userId: session.userId,
    organizationId: session.organizationId,
    userEmail: session.userEmail,
    createdAt: session.createdAt,
    activeGrantId: session.activeGrant?.id ?? null,
    pendingGrantId: session.pendingGrant?.id ?? null,
    activeRequestGrantId: session.activeRequestGrant?.id ?? null,
  };
}

function toSessionRequestGrant(
  grant: RequestAuthorityGrant<"pending"> | RequestAuthorityGrant<"approved">,
): SessionRequestGrant {
  return {
    id: grant.id,
    status: grant.status,
    authority: grant.authority,
    providers: grant.providers,
    expiresAt: grant.expiresAt,
    request: {
      url: grant.request.url,
      method: grant.request.method,
    },
  };
}

function isApprovedBroadGrant(
  grant: AuthorityGrantRecord | null,
): grant is ApprovedBroadAuthorityGrant {
  return grant?.kind === "broad" && grant.status === "approved";
}

function isPendingBroadGrant(
  grant: AuthorityGrantRecord | null,
): grant is PendingBroadAuthorityGrant {
  return grant?.kind === "broad" && grant.status === "pending";
}

function isSessionRequestGrantRecord(
  grant: AuthorityGrantRecord | null,
): grant is
  | RequestAuthorityGrant<"pending">
  | RequestAuthorityGrant<"approved"> {
  return (
    grant?.kind === "request" &&
    (grant.status === "pending" || grant.status === "approved")
  );
}

async function persistGrantRecord(
  grant: ApprovedBroadAuthorityGrant | PendingBroadAuthorityGrant,
): Promise<void> {
  if (grant.expiresAt <= Date.now()) {
    return;
  }
  await saveAuthorityGrant(grant, getGrantStoreTtlMs(grant.expiresAt));
}

async function hydrateSessionGrants(
  session: StoredPipesSession,
): Promise<{ changed: boolean; session: PipesSession }> {
  const [activeGrantRecord, pendingGrantRecord, activeRequestGrantRecord] =
    await Promise.all([
      session.activeGrantId ? loadAuthorityGrant(session.activeGrantId) : null,
      session.pendingGrantId
        ? loadAuthorityGrant(session.pendingGrantId)
        : null,
      session.activeRequestGrantId
        ? loadAuthorityGrant(session.activeRequestGrantId)
        : null,
    ]);

  let changed = false;

  const activeGrant = isApprovedBroadGrant(activeGrantRecord)
    ? activeGrantRecord
    : null;
  if (session.activeGrantId && !activeGrant) {
    changed = true;
  }

  const pendingGrant = isPendingBroadGrant(pendingGrantRecord)
    ? pendingGrantRecord
    : null;
  if (session.pendingGrantId && !pendingGrant) {
    changed = true;
  }

  const activeRequestGrant = isSessionRequestGrantRecord(
    activeRequestGrantRecord,
  )
    ? toSessionRequestGrant(activeRequestGrantRecord)
    : null;
  if (session.activeRequestGrantId && !activeRequestGrant) {
    changed = true;
  }

  return {
    changed,
    session: {
      sid: session.sid,
      userId: session.userId,
      organizationId: session.organizationId,
      userEmail: session.userEmail,
      createdAt: session.createdAt,
      activeGrant,
      pendingGrant,
      activeRequestGrant,
    },
  };
}

async function persistSession(session: PipesSession): Promise<PipesSession> {
  await saveSession(serializeSession(session), getSessionStoreTtlMs());
  return session;
}

async function cleanupIfIdle(session: PipesSession): Promise<void> {
  if (isSessionIdle(session)) {
    await deleteSession(session.sid, session.organizationId);
  }
}

export async function getOrCreateSession(
  sid: string,
  userId: string,
  organizationId?: string,
  userEmail?: string,
): Promise<PipesSession> {
  const existing = await getSession(sid, organizationId);
  if (existing) {
    if (
      existing.userId === userId &&
      existing.userEmail === (userEmail ?? "")
    ) {
      return existing;
    }

    return persistSession({
      ...existing,
      userId,
      userEmail: userEmail ?? "",
    });
  }

  return persistSession({
    sid,
    userId,
    organizationId,
    userEmail: userEmail ?? "",
    createdAt: Date.now(),
    activeGrant: null,
    pendingGrant: null,
    activeRequestGrant: null,
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
  return grantAuthority("read", undefined, session);
}

interface GrantAuthorityOptions {
  grantId?: string;
  createdAt?: number;
  expiresAt?: number;
  userInstructions?: string | null;
  resolvedAt?: number;
}

export async function grantAuthority(
  authority: "read" | "write",
  allowedProviders: string[] | undefined,
  session: PipesSession,
  options: GrantAuthorityOptions = {},
): Promise<PipesSession> {
  const now = Date.now();
  const grant: ApprovedBroadAuthorityGrant = {
    id: options.grantId ?? crypto.randomUUID(),
    kind: "broad",
    status: "approved",
    sid: session.sid,
    userId: session.userId,
    userEmail: session.userEmail,
    organizationId: session.organizationId,
    authority,
    providers: allowedProviders ?? [],
    createdAt: options.createdAt ?? now,
    expiresAt: options.expiresAt ?? now + getAuthorityTtlMs(),
    userInstructions: options.userInstructions ?? null,
    resolvedAt: options.resolvedAt ?? now,
    request: null,
  };

  await persistGrantRecord(grant);

  return persistSession({
    ...session,
    activeGrant: grant,
    pendingGrant: null,
  });
}

export async function getSession(
  sid: string,
  orgId?: string,
): Promise<PipesSession | null> {
  const raw = await loadSession(sid, orgId);
  if (!raw) return null;

  const normalizedFields = normalizeSessionFields(raw as LegacySession);
  await Promise.all([
    normalizedFields.grantSeeds.activeGrant
      ? persistGrantRecord(normalizedFields.grantSeeds.activeGrant)
      : null,
    normalizedFields.grantSeeds.pendingGrant
      ? persistGrantRecord(normalizedFields.grantSeeds.pendingGrant)
      : null,
  ]);

  const hydrated = await hydrateSessionGrants(normalizedFields.session);
  const normalized = normalizeExpiredSession(hydrated.session);

  if (normalizedFields.changed || hydrated.changed || normalized.changed) {
    await cleanupIfIdle(normalized.session);
    if (isSessionIdle(normalized.session)) {
      return null;
    }
    return persistSession(normalized.session);
  }

  return normalized.session;
}

export async function setPendingGrant(
  sid: string,
  orgId: string | undefined,
  pendingGrant: PendingBroadAuthorityGrant,
): Promise<void> {
  const session = await getSession(sid, orgId);
  if (!session) return;

  await persistGrantRecord(pendingGrant);

  await persistSession({
    ...session,
    pendingGrant,
  });
}

export async function clearPendingGrant(
  sid: string,
  orgId?: string,
): Promise<void> {
  const session = await getSession(sid, orgId);
  if (!session) return;

  const nextSession = {
    ...session,
    pendingGrant: null,
  };

  if (isSessionIdle(nextSession)) {
    await cleanupIfIdle(nextSession);
    return;
  }

  await persistSession(nextSession);
}

export async function setActiveRequestGrant(
  sid: string,
  orgId: string | undefined,
  requestGrant: SessionRequestGrant,
): Promise<SessionRequestGrant | null> {
  const session = await getSession(sid, orgId);
  if (!session) return null;

  const previousRequestGrant = session.activeRequestGrant;
  await persistSession({
    ...session,
    activeRequestGrant: requestGrant,
  });

  return previousRequestGrant;
}

export async function clearActiveRequestGrant(
  sid: string,
  orgId?: string,
  requestGrantId?: string,
): Promise<void> {
  const session = await getSession(sid, orgId);
  if (!session?.activeRequestGrant) return;
  if (requestGrantId && session.activeRequestGrant.id !== requestGrantId) {
    return;
  }

  const nextSession = {
    ...session,
    activeRequestGrant: null,
  };

  if (isSessionIdle(nextSession)) {
    await cleanupIfIdle(nextSession);
    return;
  }

  await persistSession(nextSession);
}

export function hasPendingGrant(
  session: PipesSession,
  authority?: "read" | "write",
): boolean {
  if (!session.pendingGrant) return false;
  if (!authority) return true;
  return session.pendingGrant.authority === authority;
}
