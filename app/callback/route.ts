import { handleAuth } from "@workos-inc/authkit-nextjs";
import type { NextRequest } from "next/server";
import { auditLog } from "@/lib/mcp/audit-log";
import {
  extractSidFromAccessToken,
  hydrateSessionOnLogin,
} from "@/lib/mcp/session";

function decodeStatePayload(input: string): string | null {
  try {
    const normalized = input.replace(/-/g, "+").replace(/_/g, "/");
    return Buffer.from(normalized, "base64").toString("utf8");
  } catch {
    return null;
  }
}

function extractReturnPathname(state: string | null): string | null {
  if (!state) {
    return null;
  }

  const internalState = state.includes(".") ? state.split(".")[0] : state;
  const decoded = decodeStatePayload(internalState);
  if (!decoded) {
    return null;
  }

  try {
    const payload = JSON.parse(decoded) as { returnPathname?: unknown };
    return typeof payload.returnPathname === "string"
      ? payload.returnPathname
      : null;
  } catch {
    return null;
  }
}

function buildFallbackRedirect(request: NextRequest): Response {
  const url = request.nextUrl.clone();
  const returnPathname =
    extractReturnPathname(request.nextUrl.searchParams.get("state")) ?? "/";
  const parsedReturnUrl = new URL(returnPathname, request.nextUrl.origin);

  url.pathname = parsedReturnUrl.pathname;
  url.search = parsedReturnUrl.search;

  return new Response(null, {
    status: 307,
    headers: {
      Location: url.toString(),
      Vary: "Cookie",
      "Cache-Control":
        "private, no-cache, no-store, must-revalidate, max-age=0",
      "x-middleware-cache": "no-cache",
    },
  });
}

const callbackHandler = handleAuth({
  onSuccess: async ({ accessToken, user, organizationId }) => {
    const sid = await extractSidFromAccessToken(accessToken);
    if (!sid) return;

    await hydrateSessionOnLogin(sid, user.id, organizationId, user.email);

    auditLog({
      timestamp: new Date().toISOString(),
      event: "pipes_session.started",
      sessionId: sid,
      sessionMode: "read",
      userId: user.id,
      userEmail: user.email,
      organizationId,
    });
  },
});

export async function GET(request: NextRequest): Promise<Response> {
  const response = await callbackHandler(request);
  return response ?? buildFallbackRedirect(request);
}
