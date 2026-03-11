"use server";

import { redirect } from "next/navigation";
import { auditLog } from "@/lib/mcp/audit-log";
import {
  clearPendingApproval,
  getAuthorityTtlMs,
  getOrCreateSession,
  grantAuthority,
} from "@/lib/mcp/session";
import { saveApprovalResult } from "@/lib/mcp/session-store";
import { validateAndConsumeApproval } from "./validate-approval";

export async function handleApprove(formData: FormData): Promise<void> {
  const payload = await validateAndConsumeApproval(formData);

  // Extract selected providers and user instructions from the form
  const selectedProviders = formData.getAll("providers") as string[];
  const rawInstructions = (formData.get("instructions") as string)?.trim();
  const userInstructions = rawInstructions || null;

  if (selectedProviders.length === 0) {
    redirect("/approve?error=no_providers_selected");
  }

  await getOrCreateSession(
    payload.sid,
    payload.userId,
    payload.organizationId,
    payload.userEmail,
  );

  await grantAuthority(payload.sid, payload.authority, selectedProviders);
  await clearPendingApproval(payload.sid);

  // Store the approval outcome so get_approval_status can retrieve it
  await saveApprovalResult(
    {
      approvalId: payload.jti,
      outcome: "approved",
      authority: payload.authority,
      providers: selectedProviders,
      userInstructions,
      resolvedAt: Date.now(),
    },
    getAuthorityTtlMs(),
  );

  auditLog({
    timestamp: new Date().toISOString(),
    event: "pipes_authority.granted",
    sessionId: payload.sid,
    sessionMode: payload.authority,
    userId: payload.userId,
    userEmail: payload.userEmail,
    organizationId: payload.organizationId,
    providers: selectedProviders,
  });

  redirect("/approve?result=approved");
}

export async function handleDeny(formData: FormData): Promise<void> {
  const payload = await validateAndConsumeApproval(formData);
  const rawInstructions = (formData.get("instructions") as string)?.trim();
  const denyReason = rawInstructions || null;

  await clearPendingApproval(payload.sid);

  // Store the denial outcome so get_approval_status can retrieve it
  await saveApprovalResult(
    {
      approvalId: payload.jti,
      outcome: "denied",
      authority: payload.authority,
      providers: [],
      userInstructions: denyReason,
      resolvedAt: Date.now(),
    },
    getAuthorityTtlMs(),
  );

  auditLog({
    timestamp: new Date().toISOString(),
    event: "pipes_authority.denied",
    sessionId: payload.sid,
    sessionMode: payload.authority,
    userId: payload.userId,
    userEmail: payload.userEmail,
    organizationId: payload.organizationId,
  });

  redirect("/approve?result=denied");
}
