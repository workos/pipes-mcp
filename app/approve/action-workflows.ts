import { redirect } from "next/navigation";
import type {
  BroadAuthorityGrant,
  RequestAuthorityGrant,
} from "@/lib/mcp/authority-grants";
import {
  clearActiveRequestGrant,
  clearPendingGrant,
  getOrCreateSession,
  grantAuthority,
  setActiveRequestGrant,
} from "@/lib/mcp/session";
import { resolveAuthorityGrant } from "@/lib/mcp/session-store";
import type { ValidatedApprovalPayload } from "./validate-approval";

function redirectInvalidToken(): never {
  redirect("/approve?error=invalid_token");
}

async function resolveRequestGrantOrRedirect(
  approvalId: string,
  outcome: "approved" | "denied",
  options: {
    userInstructions: string | null;
  },
): Promise<
  RequestAuthorityGrant<"approved"> | RequestAuthorityGrant<"denied">
> {
  const grant = await resolveAuthorityGrant(approvalId, outcome, options);

  if (!grant || grant.kind !== "request") {
    redirectInvalidToken();
  }

  return grant as
    | RequestAuthorityGrant<"approved">
    | RequestAuthorityGrant<"denied">;
}

async function resolveBroadGrantOrRedirect(
  approvalId: string,
  outcome: "approved" | "denied",
  options: {
    providers?: string[];
    userInstructions: string | null;
  },
): Promise<BroadAuthorityGrant<"approved"> | BroadAuthorityGrant<"denied">> {
  const grant = await resolveAuthorityGrant(approvalId, outcome, options);

  if (!grant || grant.kind !== "broad") {
    redirectInvalidToken();
  }

  return grant as
    | BroadAuthorityGrant<"approved">
    | BroadAuthorityGrant<"denied">;
}

export async function approveRequestGrant(
  payload: ValidatedApprovalPayload,
  userInstructions: string | null,
): Promise<never> {
  const grant = (await resolveRequestGrantOrRedirect(payload.jti, "approved", {
    userInstructions,
  })) as RequestAuthorityGrant<"approved">;

  await setActiveRequestGrant(payload.sid, payload.organizationId, {
    id: grant.id,
    status: grant.status,
    authority: grant.authority,
    providers: grant.providers,
    expiresAt: grant.expiresAt,
    request: {
      url: grant.request.url,
      method: grant.request.method,
    },
  });
  // Audit logs can be triggered here when a per-request grant is approved.

  redirect("/approve?result=approved");
}

export async function approveBroadGrant(
  payload: ValidatedApprovalPayload & { authority: "read" | "write" },
  selectedProviders: string[],
  userInstructions: string | null,
): Promise<never> {
  const session = await getOrCreateSession(
    payload.sid,
    payload.userId,
    payload.organizationId,
    payload.userEmail,
  );

  const grant = await resolveBroadGrantOrRedirect(payload.jti, "approved", {
    providers: selectedProviders,
    userInstructions,
  });

  // Pass the session directly to avoid re-fetching via getSession(), which
  // aggressively cleans up "idle" sessions. During the pending→approved
  // transition the session temporarily has no valid grants and looks idle.
  await grantAuthority(payload.authority, selectedProviders, session, {
    grantId: grant.id,
    createdAt: grant.createdAt,
    expiresAt: grant.expiresAt,
    userInstructions: grant.userInstructions,
    resolvedAt: grant.resolvedAt ?? Date.now(),
  });
  // Audit logs can be triggered here when broad authority is granted.

  redirect("/approve?result=approved");
}

export async function denyRequestGrant(
  payload: ValidatedApprovalPayload,
  userInstructions: string | null,
): Promise<never> {
  const grant = await resolveRequestGrantOrRedirect(payload.jti, "denied", {
    userInstructions,
  });
  await clearActiveRequestGrant(payload.sid, payload.organizationId, grant.id);
  // Audit logs can be triggered here when a per-request grant is denied.

  redirect("/approve?result=denied");
}

export async function denyBroadGrant(
  payload: ValidatedApprovalPayload & { authority: "read" | "write" },
  userInstructions: string | null,
): Promise<never> {
  await clearPendingGrant(payload.sid, payload.organizationId);
  await resolveBroadGrantOrRedirect(payload.jti, "denied", {
    userInstructions,
  });
  // Audit logs can be triggered here when broad authority is denied.

  redirect("/approve?result=denied");
}
