import { handleAuth } from "@workos-inc/authkit-nextjs";
import type { NextRequest } from "next/server";
import { auditLog } from "@/lib/mcp/audit-log";
import {
  extractSidFromAccessToken,
  hydrateSessionOnLogin,
} from "@/lib/mcp/session";

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
  return callbackHandler(request);
}
