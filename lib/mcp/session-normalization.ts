import type {
  ApprovedBroadAuthorityGrant,
  PendingBroadAuthorityGrant,
} from "./authority-grants";
import { createPendingGrant, isGrantExpired } from "./authority-grants";
import type {
  LegacySession,
  PipesSession,
  StoredPipesSession,
} from "./session-types";

export function isSessionIdle(session: PipesSession): boolean {
  return (
    !session.activeGrant && !session.pendingGrant && !session.activeRequestGrant
  );
}

export function normalizeExpiredSession(session: PipesSession): {
  changed: boolean;
  session: PipesSession;
} {
  let changed = false;
  let nextSession = session;
  const now = Date.now();

  if (nextSession.activeGrant && isGrantExpired(nextSession.activeGrant, now)) {
    nextSession = {
      ...nextSession,
      activeGrant: null,
    };
    changed = true;
  }

  if (
    nextSession.pendingGrant &&
    isGrantExpired(nextSession.pendingGrant, now)
  ) {
    nextSession = {
      ...nextSession,
      pendingGrant: null,
    };
    changed = true;
  }

  if (
    nextSession.activeRequestGrant &&
    nextSession.activeRequestGrant.expiresAt <= now
  ) {
    nextSession = {
      ...nextSession,
      activeRequestGrant: null,
    };
    changed = true;
  }

  return { changed, session: nextSession };
}

function getLegacyActiveGrant(
  raw: LegacySession,
): ApprovedBroadAuthorityGrant | null {
  return (
    raw.activeGrant ??
    (raw.authority &&
    raw.authority !== "none" &&
    typeof raw.authorityExpiresAt === "number"
      ? {
          id:
            raw.authorityGrantedAt !== undefined &&
            raw.authorityGrantedAt !== null
              ? `legacy-active:${raw.sid}:${raw.authorityGrantedAt}`
              : `legacy-active:${raw.sid}:${raw.authorityExpiresAt}`,
          kind: "broad" as const,
          status: "approved" as const,
          sid: raw.sid,
          userId: raw.userId,
          userEmail: raw.userEmail,
          organizationId: raw.organizationId,
          authority: raw.authority,
          providers: raw.allowedProviders ?? [],
          createdAt: raw.authorityGrantedAt ?? raw.createdAt,
          expiresAt: raw.authorityExpiresAt,
          userInstructions: null,
          resolvedAt: raw.authorityGrantedAt ?? raw.createdAt,
          request: null,
        }
      : null)
  );
}

function getLegacyPendingGrant(
  raw: LegacySession,
): PendingBroadAuthorityGrant | null {
  return (
    raw.pendingGrant ??
    (raw.pendingApproval
      ? createPendingGrant({
          id: raw.pendingApproval.tokenJti,
          kind: "broad",
          sid: raw.sid,
          userId: raw.userId,
          userEmail: raw.userEmail,
          organizationId: raw.organizationId,
          authority: raw.pendingApproval.authority,
          expiresAt: raw.pendingApproval.expiresAt,
          createdAt: raw.pendingApproval.createdAt,
        })
      : null)
  );
}

interface NormalizeSessionFieldsResult {
  changed: boolean;
  grantSeeds: {
    activeGrant: ApprovedBroadAuthorityGrant | null;
    pendingGrant: PendingBroadAuthorityGrant | null;
  };
  session: StoredPipesSession;
}

export function normalizeSessionFields(
  raw: LegacySession,
): NormalizeSessionFieldsResult {
  const activeGrant = getLegacyActiveGrant(raw);
  const pendingGrant = getLegacyPendingGrant(raw);
  const activeGrantId = raw.activeGrantId ?? activeGrant?.id ?? null;
  const pendingGrantId = raw.pendingGrantId ?? pendingGrant?.id ?? null;
  const activeRequestGrantId =
    raw.activeRequestGrantId ?? raw.activeRequestGrant?.id ?? null;

  const changed =
    raw.activeGrantId === undefined ||
    raw.pendingGrantId === undefined ||
    raw.activeRequestGrantId === undefined ||
    raw.activeGrant !== undefined ||
    raw.pendingGrant !== undefined ||
    raw.activeRequestGrant !== undefined ||
    raw.authority !== undefined ||
    raw.authorityGrantedAt !== undefined ||
    raw.authorityExpiresAt !== undefined ||
    raw.allowedProviders !== undefined ||
    raw.pendingApproval !== undefined;

  return {
    changed,
    grantSeeds: {
      activeGrant,
      pendingGrant,
    },
    session: {
      sid: raw.sid,
      userId: raw.userId,
      organizationId: raw.organizationId,
      userEmail: raw.userEmail,
      createdAt: raw.createdAt,
      activeGrantId,
      pendingGrantId,
      activeRequestGrantId,
    },
  };
}
