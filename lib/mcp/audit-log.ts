/**
 * Audit Logging
 *
 * Structured JSON logging for session lifecycle and tool access decisions.
 * Each event is one JSON line to stdout, compatible with any log aggregator.
 * Events are also forwarded to WorkOS Audit Logs when an organizationId is present.
 */

import { getWorkOSClient } from "@/lib/workos-client";

export type AuditEventType =
  | "pipes_session.started"
  | "pipes_authority.requested"
  | "pipes_authority.granted"
  | "pipes_authority.denied"
  | "pipes_authority.released"
  | "api_call.completed"
  | "api_call.denied"
  | "api_call.errored";

export interface AuditEvent {
  timestamp: string;
  event: AuditEventType;
  /** AuthKit JWT `sid` value (session key) */
  sessionId?: string;
  sessionMode?: string;
  userId?: string;
  userEmail?: string;
  organizationId?: string;
  tool?: string;
  method?: string;
  provider?: string;
  reason?: string;
  durationMs?: number;
  userAgent?: string;
  clientIp?: string;
  /** API URL that was called (for call_integration_api) */
  url?: string;
  /** Request body (GraphQL query, SQL statement, search params, etc.) */
  body?: Record<string, unknown>;
  /** Providers authorized in grant events */
  providers?: string[];
}

export function auditLog(event: AuditEvent): void {
  // Structured JSON to stdout
  console.log(JSON.stringify({ _type: "pipes_mcp_audit", ...event }));

  // Fire-and-forget to WorkOS Audit Logs (requires organizationId)
  if (event.organizationId && event.userId) {
    sendToWorkOS(event).catch((err) => {
      console.error(
        "WorkOS audit log failed:",
        JSON.stringify(err, Object.getOwnPropertyNames(err), 2),
      );
    });
  }
}

function buildMetadata(
  event: AuditEvent,
): Record<string, string | number | boolean> {
  const m: Record<string, string | number | boolean> = {};
  if (event.sessionMode) m.level = event.sessionMode;
  if (event.method) m.method = event.method;
  if (event.provider) m.provider = event.provider;
  if (event.url) m.url = event.url;
  if (event.body) m.body = JSON.stringify(event.body);
  if (event.reason) m.reason = event.reason;
  if (event.durationMs !== undefined) m.durationMs = event.durationMs;
  if (event.providers) m.providers = event.providers.join(",");
  return m;
}

async function sendToWorkOS(event: AuditEvent): Promise<void> {
  const workos = getWorkOSClient();

  const targets: {
    id: string;
    type: string;
    metadata?: Record<string, string | number | boolean>;
  }[] = [];

  if (event.tool) {
    targets.push({
      id: event.tool,
      type: "tool",
      ...(event.provider ? { metadata: { provider: event.provider } } : {}),
    });
  }

  if (event.sessionId) {
    targets.push({ id: event.sessionId, type: "session" });
  }

  // WorkOS requires at least one target
  if (targets.length === 0) {
    targets.push({ id: "pipes-mcp", type: "server" });
  }

  await workos.auditLogs.createEvent(event.organizationId!, {
    action: `pipes_mcp.${event.event}`,
    occurredAt: new Date(event.timestamp),
    actor: {
      id: event.userId!,
      type: "user",
      name: event.userEmail,
      metadata: {},
    },
    targets,
    context: {
      location: event.clientIp || "unknown",
      userAgent: event.userAgent,
    },
    metadata: buildMetadata(event),
  });
}

/**
 * Register all Pipes MCP audit log event schemas with WorkOS.
 * Must be called once before events can be emitted.
 * Safe to call multiple times — WorkOS will version the schema if it changes.
 */
export async function registerAuditLogSchemas(): Promise<void> {
  const workos = getWorkOSClient();

  const targetTypes = {
    tool: { type: "tool" },
    session: { type: "session" },
    server: { type: "server" },
  };

  const metadataSchema: Record<string, string | boolean | number> = {
    level: "string",
    method: "string",
    provider: "string",
    url: "string",
    body: "string",
    reason: "string",
    durationMs: "number",
  };

  const schemas: {
    action: string;
    targets: { type: string }[];
    metadata?: Record<string, string | boolean | number>;
  }[] = [
    {
      action: "pipes_mcp.pipes_session.started",
      targets: [targetTypes.session],
      metadata: metadataSchema,
    },
    {
      action: "pipes_mcp.pipes_authority.requested",
      targets: [targetTypes.session],
      metadata: metadataSchema,
    },
    {
      action: "pipes_mcp.pipes_authority.granted",
      targets: [targetTypes.session],
      metadata: metadataSchema,
    },
    {
      action: "pipes_mcp.pipes_authority.denied",
      targets: [targetTypes.session],
      metadata: metadataSchema,
    },
    {
      action: "pipes_mcp.pipes_authority.released",
      targets: [targetTypes.session],
      metadata: metadataSchema,
    },
    {
      action: "pipes_mcp.api_call.completed",
      targets: [targetTypes.tool, targetTypes.session],
      metadata: metadataSchema,
    },
    {
      action: "pipes_mcp.api_call.denied",
      targets: [targetTypes.tool, targetTypes.session],
      metadata: metadataSchema,
    },
    {
      action: "pipes_mcp.api_call.errored",
      targets: [targetTypes.tool, targetTypes.session],
      metadata: metadataSchema,
    },
  ];

  for (const schema of schemas) {
    try {
      await workos.auditLogs.createSchema(schema);
      console.log(`Audit log schema registered: ${schema.action}`);
    } catch (err) {
      // Schema may already exist — log and continue
      console.error(`Failed to register schema ${schema.action}:`, err);
    }
  }
}
