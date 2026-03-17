import { getSignInUrl, withAuth } from "@workos-inc/authkit-nextjs";
import { redirect } from "next/navigation";
import { decryptApprovalToken } from "@/lib/mcp/approval-token";
import { loadAuthorityGrant } from "@/lib/mcp/session-store";
import { ERROR_MESSAGES } from "./config";
import { buildApprovalReturnTo } from "./helpers";
import {
  ApprovalErrorScreen,
  ApprovalResultScreen,
  BroadApprovalScreen,
  RequestApprovalScreen,
} from "./screens";

interface Props {
  searchParams: Promise<{
    token?: string;
    result?: string;
    error?: string;
  }>;
}

export default async function ApprovePage({ searchParams }: Props) {
  const params = await searchParams;
  const { token, result, error } = params;
  const { user } = await withAuth();

  if (!user) {
    redirect(await getSignInUrl({ returnTo: buildApprovalReturnTo(params) }));
  }

  if (result === "approved" || result === "denied") {
    return <ApprovalResultScreen result={result} />;
  }

  if (error) {
    return (
      <ApprovalErrorScreen
        message={ERROR_MESSAGES[error] ?? "An unexpected error occurred."}
      />
    );
  }

  if (!token) {
    return (
      <ApprovalErrorScreen
        title="Invalid Request"
        message="No approval token provided. Please use the link from your AI assistant."
      />
    );
  }

  let payload: Awaited<ReturnType<typeof decryptApprovalToken>>;
  try {
    payload = await decryptApprovalToken(token);
  } catch {
    return (
      <ApprovalErrorScreen message="This approval link is invalid or has expired. Please request a new one from your AI assistant." />
    );
  }

  if (user.id !== payload.userId) {
    return <ApprovalErrorScreen message={ERROR_MESSAGES.user_mismatch} />;
  }

  const grant = await loadAuthorityGrant(payload.jti);

  if (!grant || grant.status !== "pending") {
    return (
      <ApprovalErrorScreen message="This approval link has expired or is no longer valid. Please request a new one from your AI assistant." />
    );
  }

  if (payload.authority === "request" && payload.requestDetails) {
    const requestPayload = payload as typeof payload & {
      authority: "request";
      requestDetails: {
        url: string;
        method: string;
      };
    };

    return (
      <RequestApprovalScreen
        token={token}
        payload={requestPayload}
        requestBody={grant.kind === "request" ? grant.request.body : undefined}
      />
    );
  }

  return (
    <BroadApprovalScreen
      token={token}
      payload={payload as typeof payload & { authority: "read" | "write" }}
    />
  );
}
