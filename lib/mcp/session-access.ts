import type { PipesAuthority } from "./authority";
import { grantAllowsProvider, grantIncludes } from "./authority-grants";
import type { PipesSession } from "./session-types";

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

export function getSessionAuthority(session: PipesSession): PipesAuthority {
  return session.activeGrant?.authority ?? "none";
}

export function getSessionProviders(session: PipesSession): string[] {
  return session.activeGrant?.providers ?? [];
}

export function getSessionAuthorityExpiresAt(
  session: PipesSession,
): number | null {
  return session.activeGrant?.expiresAt ?? null;
}

export function hasAuthority(
  session: PipesSession,
  required: "read" | "write",
): boolean {
  return session.activeGrant
    ? grantIncludes(session.activeGrant, required)
    : false;
}

export function requireReadMode(session: PipesSession): void {
  if (!hasAuthority(session, "read")) {
    throw new SessionError(
      "READ_NOT_ALLOWED",
      'This operation requires Pipes read authority. Call request_elevated_access with kind "session" and level "read" to continue.',
    );
  }
}

export function requireWriteMode(session: PipesSession): void {
  if (!hasAuthority(session, "write")) {
    throw new SessionError(
      "WRITE_NOT_ALLOWED",
      'This operation requires Pipes write authority. Call request_elevated_access with kind "session" and level "write" to continue.',
    );
  }
}

export function requireProviderAccess(
  session: PipesSession,
  providerSlug: string,
): void {
  const grant = session.activeGrant;
  const providers = grant?.providers ?? [];

  if (!grant || providers.length === 0) {
    throw new SessionError(
      "PROVIDER_NOT_ALLOWED",
      "Authority was not granted for any providers. Call request_elevated_access to request access.",
    );
  }

  if (!grantAllowsProvider(grant, providerSlug)) {
    throw new SessionError(
      "PROVIDER_NOT_ALLOWED",
      `Authority was not granted for "${providerSlug}". ` +
        `Currently authorized providers: ${providers.join(", ")}. ` +
        `Call request_elevated_access to request access for additional providers.`,
    );
  }
}
