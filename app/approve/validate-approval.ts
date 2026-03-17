"use server";

import { withAuth } from "@workos-inc/authkit-nextjs";
import { redirect } from "next/navigation";
import {
  type ApprovalTokenPayload,
  decryptApprovalToken,
} from "@/lib/mcp/approval-token";
import { consumeApprovalToken } from "@/lib/mcp/session-store";

export type ValidatedApprovalPayload = ApprovalTokenPayload & {
  jti: string;
  expiresAt: number;
  sid: string;
};

/**
 * Validate, authenticate, and consume an approval token from form data.
 * Redirects on any failure (missing token, expired, wrong user, already consumed).
 * Returns the decrypted payload on success.
 */
export async function validateAndConsumeApproval(
  formData: FormData,
): Promise<ValidatedApprovalPayload> {
  const token = formData.get("token") as string | null;
  if (!token) {
    redirect("/approve?error=missing_token");
  }

  let payload: Awaited<ReturnType<typeof decryptApprovalToken>>;
  try {
    payload = await decryptApprovalToken(token);
  } catch (err) {
    const message =
      err instanceof Error && err.message.includes("expired")
        ? "expired"
        : "invalid_token";
    redirect(`/approve?error=${message}`);
  }

  const { user } = await withAuth();
  if (!user) {
    redirect("/approve?error=auth_required");
  }
  if (user.id !== payload.userId) {
    redirect("/approve?error=user_mismatch");
  }

  const consumed = await consumeApprovalToken(
    payload.jti,
    Math.max(payload.expiresAt - Date.now(), 1000),
  );
  if (!consumed) {
    redirect("/approve?error=invalid_token");
  }

  return payload;
}
