import { registerCheckAccessRequestTool } from "./check-access-request-tool";
import { registerRequestElevatedAccessTool } from "./request-elevated-access-tool";

const globalStore = globalThis as unknown as { __mcpClientName?: string };

function getClientName(server: any): string | undefined {
  return (
    globalStore.__mcpClientName ??
    server.server?.getClientVersion?.()?.name ??
    undefined
  );
}

export function registerAuthorityTools(server: any): void {
  const previousOnInitialized = server.server?.oninitialized;

  if (server.server) {
    server.server.oninitialized = () => {
      const clientVersion = server.server.getClientVersion?.();
      if (clientVersion?.name) {
        globalStore.__mcpClientName = clientVersion.name;
      }
      previousOnInitialized?.();
    };
  }

  registerRequestElevatedAccessTool(server, () => getClientName(server));
  registerCheckAccessRequestTool(server);
}
