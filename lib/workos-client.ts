import { getWorkOS as getAuthkitWorkOS } from "@workos-inc/authkit-nextjs";

type WorkOSClient = ReturnType<typeof getAuthkitWorkOS>;

const g = globalThis as unknown as { __pipesMcpWorkOS?: WorkOSClient };

/**
 * Lazily initialize and reuse the WorkOS client.
 * Uses globalThis to survive Turbopack HMR reloads.
 */
export function getWorkOSClient(): WorkOSClient {
  if (!g.__pipesMcpWorkOS) {
    g.__pipesMcpWorkOS = getAuthkitWorkOS();
  }
  return g.__pipesMcpWorkOS;
}
