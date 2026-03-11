/**
 * Approval Token (JWE)
 *
 * Creates and decrypts encrypted JWT tokens for the human-approval flow.
 * Tokens carry session info (sid, userId, authority) and are encrypted with
 * A256GCM using a key derived from WORKOS_COOKIE_PASSWORD.
 */

import * as jose from "jose";

export interface ApprovalTokenPayload {
  sid: string;
  userId: string;
  organizationId?: string;
  userEmail: string;
  authority: "read" | "write";
  /** Connected integrations with display name and slug for icon lookup */
  integrations?: { name: string; slug: string }[];
  /** MCP client name (e.g. "Claude Code") */
  clientName?: string;
  /** Agent's justification for requesting access */
  reason?: string;
}

const ISSUER = "pipes-mcp";
const TOKEN_TTL = "5m";

/**
 * Derive a 256-bit encryption key from WORKOS_COOKIE_PASSWORD via SHA-256.
 */
async function getEncryptionKey(): Promise<Uint8Array> {
  const secret = process.env.WORKOS_COOKIE_PASSWORD;
  if (!secret) {
    throw new Error(
      "WORKOS_COOKIE_PASSWORD is required for approval token encryption",
    );
  }
  const encoded = new TextEncoder().encode(secret);
  const hash = await crypto.subtle.digest("SHA-256", encoded);
  return new Uint8Array(hash);
}

/**
 * Create an encrypted approval token (JWE) with a 5-minute expiry.
 */
export async function createApprovalToken(
  payload: ApprovalTokenPayload,
): Promise<string> {
  const key = await getEncryptionKey();

  // Truncate reason to prevent oversized URLs (token is a query param)
  const reason = payload.reason?.slice(0, 500);

  const jwe = await new jose.EncryptJWT({
    sid: payload.sid,
    userId: payload.userId,
    organizationId: payload.organizationId,
    userEmail: payload.userEmail,
    authority: payload.authority,
    integrations: payload.integrations,
    clientName: payload.clientName,
    reason,
  })
    .setProtectedHeader({ alg: "dir", enc: "A256GCM" })
    .setIssuedAt()
    .setIssuer(ISSUER)
    .setJti(crypto.randomUUID())
    .setExpirationTime(TOKEN_TTL)
    .encrypt(key);

  return jwe;
}

/**
 * Decrypt and validate an approval token.
 * Throws on invalid/expired tokens.
 */
export async function decryptApprovalToken(token: string): Promise<
  ApprovalTokenPayload & {
    jti: string;
    expiresAt: number;
  }
> {
  const key = await getEncryptionKey();

  const { payload } = await jose.jwtDecrypt(token, key, {
    issuer: ISSUER,
  });

  return {
    sid: payload.sid as string,
    userId: payload.userId as string,
    organizationId: payload.organizationId as string | undefined,
    userEmail: payload.userEmail as string,
    authority: payload.authority as "read" | "write",
    integrations:
      (payload.integrations as { name: string; slug: string }[] | undefined) ??
      [],
    clientName: (payload.clientName as string | undefined) ?? undefined,
    reason: (payload.reason as string | undefined) ?? undefined,
    jti: payload.jti as string,
    expiresAt: Number(payload.exp) * 1000,
  };
}

/**
 * Derive the approval page base URL from WORKOS_REDIRECT_URI origin.
 */
export function getApprovalBaseUrl(): string {
  const redirectUri =
    process.env.WORKOS_REDIRECT_URI ??
    process.env.NEXT_PUBLIC_WORKOS_REDIRECT_URI;
  if (!redirectUri) {
    throw new Error(
      "WORKOS_REDIRECT_URI is required to generate approval URLs",
    );
  }
  const url = new URL(redirectUri);
  return url.origin;
}
