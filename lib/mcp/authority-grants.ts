import { authorityIncludes } from "./authority";

export type GrantKind = "broad" | "request";
export type GrantStatus = "pending" | "approved" | "denied";
export type GrantAuthority = "read" | "write";

export interface GrantRequest {
  url: string;
  method: string;
  body?: Record<string, unknown>;
}

interface AuthorityGrantBase<
  TKind extends GrantKind,
  TStatus extends GrantStatus,
> {
  id: string;
  kind: TKind;
  status: TStatus;
  sid: string;
  userId: string;
  userEmail: string;
  organizationId?: string;
  authority: GrantAuthority;
  providers: string[];
  createdAt: number;
  expiresAt: number;
  userInstructions: string | null;
  resolvedAt: number | null;
}

export type BroadAuthorityGrant<TStatus extends GrantStatus = GrantStatus> =
  AuthorityGrantBase<"broad", TStatus> & {
    request: null;
  };

export type RequestAuthorityGrant<TStatus extends GrantStatus = GrantStatus> =
  AuthorityGrantBase<"request", TStatus> & {
    request: GrantRequest;
  };

export type AuthorityGrantRecord = BroadAuthorityGrant | RequestAuthorityGrant;

export type PendingAuthorityGrant =
  | BroadAuthorityGrant<"pending">
  | RequestAuthorityGrant<"pending">;
export type ApprovedAuthorityGrant =
  | BroadAuthorityGrant<"approved">
  | RequestAuthorityGrant<"approved">;
export type ApprovedBroadAuthorityGrant = BroadAuthorityGrant<"approved">;
export type PendingBroadAuthorityGrant = BroadAuthorityGrant<"pending">;

interface CreateGrantOptions {
  id: string;
  kind: GrantKind;
  sid: string;
  userId: string;
  userEmail: string;
  organizationId?: string;
  authority: GrantAuthority;
  providers?: string[];
  createdAt?: number;
  expiresAt: number;
  request?: GrantRequest;
}

interface CreateBroadGrantOptions extends CreateGrantOptions {
  kind: "broad";
}

interface CreateRequestGrantOptions extends CreateGrantOptions {
  kind: "request";
  request: GrantRequest;
}

export function createPendingGrant(
  options: CreateBroadGrantOptions,
): PendingBroadAuthorityGrant;
export function createPendingGrant(
  options: CreateRequestGrantOptions,
): RequestAuthorityGrant<"pending">;
export function createPendingGrant(
  options: CreateGrantOptions,
): PendingAuthorityGrant {
  const createdAt = options.createdAt ?? Date.now();
  const base = {
    id: options.id,
    kind: options.kind,
    status: "pending" as const,
    sid: options.sid,
    userId: options.userId,
    userEmail: options.userEmail,
    organizationId: options.organizationId,
    authority: options.authority,
    providers: options.providers ?? [],
    createdAt,
    expiresAt: options.expiresAt,
    userInstructions: null,
    resolvedAt: null,
  };

  if (options.kind === "request") {
    if (!options.request) {
      throw new Error("Request grants require request details.");
    }

    return {
      ...base,
      kind: "request",
      request: options.request,
    };
  }

  return {
    ...base,
    kind: "broad",
    request: null,
  };
}

interface ResolveGrantOptions {
  providers?: string[];
  userInstructions: string | null;
  resolvedAt?: number;
}

export function approveGrant(
  grant: BroadAuthorityGrant,
  options: ResolveGrantOptions,
): BroadAuthorityGrant<"approved">;
export function approveGrant(
  grant: RequestAuthorityGrant,
  options: ResolveGrantOptions,
): RequestAuthorityGrant<"approved">;
export function approveGrant(
  grant: AuthorityGrantRecord,
  options: ResolveGrantOptions,
): ApprovedAuthorityGrant {
  const resolvedAt = options.resolvedAt ?? Date.now();
  const approved: ApprovedAuthorityGrant = {
    ...grant,
    status: "approved" as const,
    providers: options.providers ?? grant.providers,
    userInstructions: options.userInstructions,
    resolvedAt,
  };

  return approved;
}

export function denyGrant(
  grant: BroadAuthorityGrant,
  userInstructions: string | null,
  resolvedAt?: number,
): BroadAuthorityGrant<"denied">;
export function denyGrant(
  grant: RequestAuthorityGrant,
  userInstructions: string | null,
  resolvedAt?: number,
): RequestAuthorityGrant<"denied">;
export function denyGrant(
  grant: AuthorityGrantRecord,
  userInstructions: string | null,
  resolvedAt = Date.now(),
): BroadAuthorityGrant<"denied"> | RequestAuthorityGrant<"denied"> {
  const denied = {
    ...grant,
    status: "denied" as const,
    userInstructions,
    resolvedAt,
  };

  return denied;
}

export function grantIncludes(
  grant: Pick<AuthorityGrantRecord, "authority">,
  required: GrantAuthority,
): boolean {
  return authorityIncludes(grant.authority, required);
}

export function isGrantExpired(
  grant: Pick<AuthorityGrantRecord, "expiresAt">,
  now = Date.now(),
): boolean {
  return grant.expiresAt <= now;
}

export function grantAllowsProvider(
  grant: Pick<AuthorityGrantRecord, "providers">,
  provider: string,
): boolean {
  return grant.providers.includes(provider);
}

export function grantMatchesRequest(
  grant: RequestAuthorityGrant,
  input: { url: string; method: string; body?: Record<string, unknown> },
): boolean {
  if (grant.request.url !== input.url) return false;
  if (grant.request.method.toUpperCase() !== input.method.toUpperCase()) {
    return false;
  }

  const approvedBody = grant.request.body;
  if (!approvedBody && !input.body) return true;

  return (
    JSON.stringify(approvedBody ?? null) === JSON.stringify(input.body ?? null)
  );
}
