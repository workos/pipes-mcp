import type { AuthInfo } from "@modelcontextprotocol/sdk/server/auth/types.js";
import { getWorkOS } from "@workos-inc/authkit-nextjs";
import * as jose from "jose";
import { getOrCreateSession, type PipesSession } from "./session";

export interface AuthKitClaims extends jose.JWTPayload {
  sub: string;
  sid: string;
  jti: string;
  org_id?: string;
}

export interface McpAuthInfo extends AuthInfo {
  extra: {
    userId: string;
    userEmail: string;
    organizationId?: string;
    claims: AuthKitClaims;
  };
}

function getScopesForAuthority(authority: PipesSession["authority"]): string[] {
  if (authority === "write") {
    return ["pipes:read", "pipes:write"];
  }

  if (authority === "read") {
    return ["pipes:read"];
  }

  return [];
}

export function getOrganizationIdFromAuthInfo(
  authInfo: McpAuthInfo,
): string | undefined {
  return authInfo.extra.organizationId;
}

export function requireMcpAuthInfo(
  authInfo: AuthInfo | undefined,
): McpAuthInfo {
  if (!authInfo?.extra) {
    throw new Error(
      "Authentication required. Please authenticate to use this tool.",
    );
  }

  const extra = authInfo.extra as Partial<McpAuthInfo["extra"]>;
  if (
    typeof extra.userId !== "string" ||
    typeof extra.userEmail !== "string" ||
    !extra.claims ||
    typeof extra.claims.sid !== "string"
  ) {
    throw new Error(
      "Authentication context is missing required MCP session data.",
    );
  }

  return authInfo as McpAuthInfo;
}

// Initialize JWKS client for AuthKit public key verification
// This client fetches and caches AuthKit's public keys used to verify JWT signatures
const authkitDomain = process.env.AUTHKIT_DOMAIN;
const authkitAudience = process.env.WORKOS_CLIENT_ID;

if (!authkitDomain) {
  throw new Error("AUTHKIT_DOMAIN environment variable is required");
}

if (!authkitAudience) {
  throw new Error(
    "WORKOS_CLIENT_ID environment variable is required for audience validation",
  );
}

const jwks = jose.createRemoteJWKSet(
  new URL(`https://${authkitDomain}/oauth2/jwks`),
);

// Token verification function for MCP authentication
export const verifyToken = async (
  _req: Request,
  bearerToken?: string,
): Promise<McpAuthInfo | undefined> => {
  if (!bearerToken) {
    console.error("No bearer token provided");
    return undefined;
  }

  try {
    // Verify the JWT access token issued by AuthKit
    // This validates the signature, audience, issuer, and expiration
    const { payload } = await jose.jwtVerify<AuthKitClaims>(bearerToken, jwks, {
      audience: authkitAudience,
      issuer: `https://${authkitDomain}`,
    });

    // Ensure the subject claim exists
    if (!payload.sub || typeof payload.sub !== "string") {
      console.error("Invalid or missing subject claim in JWT");
      return undefined;
    }
    if (!payload.sid || typeof payload.sid !== "string") {
      console.error("Invalid or missing sid claim in JWT");
      return undefined;
    }
    if (!payload.jti || typeof payload.jti !== "string") {
      console.error("Invalid or missing jti claim in JWT");
      return undefined;
    }

    // Fetch the full user profile from WorkOS using the subject claim
    // This provides additional user context beyond what's in the JWT
    const workos = getWorkOS();
    const user = await workos.userManagement.getUser(payload.sub);

    // Extract organizationId from JWT claims (org_id)
    let organizationId =
      typeof payload.org_id === "string" ? payload.org_id : undefined;

    // Fallback: If JWT doesn't have org_id, get it from user's organization memberships
    if (!organizationId) {
      try {
        const orgMemberships =
          await workos.userManagement.listOrganizationMemberships({
            userId: user.id,
          });
        // Use the first organization membership if available
        if (orgMemberships.data.length > 0) {
          organizationId = orgMemberships.data[0].organizationId;
        }
      } catch (error) {
        console.error("Failed to fetch organization memberships:", error);
      }
    }

    const session = await getOrCreateSession(
      payload.sid,
      user.id,
      organizationId,
      user.email,
    );

    return {
      token: bearerToken,
      scopes: getScopesForAuthority(session.authority),
      clientId: user.id,
      expiresAt: typeof payload.exp === "number" ? payload.exp : undefined,
      extra: {
        userId: user.id,
        userEmail: user.email,
        organizationId,
        claims: payload,
      },
    };
  } catch (error) {
    // Catch all errors and return undefined (auth failed)
    // This includes JWTExpired, JWTClaimValidationFailed, JWSInvalid, etc.
    if (error instanceof Error) {
      console.error("Token verification failed:", error.message);
    } else {
      console.error("Token verification failed:", error);
    }
    return undefined;
  }
};
