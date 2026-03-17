import type { PipesAuthority } from "./authority";
import type {
  ApprovedBroadAuthorityGrant,
  GrantAuthority,
  PendingBroadAuthorityGrant,
} from "./authority-grants";

/** A pipes session scoping tool access */
export interface SessionRequestGrant {
  id: string;
  status: "pending" | "approved";
  authority: GrantAuthority;
  providers: string[];
  expiresAt: number;
  request: {
    url: string;
    method: string;
  };
}

export interface PipesSession {
  sid: string;
  userId: string;
  organizationId?: string;
  userEmail: string;
  createdAt: number;
  activeGrant: ApprovedBroadAuthorityGrant | null;
  pendingGrant: PendingBroadAuthorityGrant | null;
  activeRequestGrant: SessionRequestGrant | null;
}

export interface StoredPipesSession {
  sid: string;
  userId: string;
  organizationId?: string;
  userEmail: string;
  createdAt: number;
  activeGrantId: string | null;
  pendingGrantId: string | null;
  activeRequestGrantId: string | null;
}

export type LegacySession = Partial<StoredPipesSession> & {
  sid: string;
  userId: string;
  organizationId?: string;
  userEmail: string;
  createdAt: number;
  activeGrant?: ApprovedBroadAuthorityGrant | null;
  pendingGrant?: PendingBroadAuthorityGrant | null;
  activeRequestGrant?: SessionRequestGrant | null;
  authority?: PipesAuthority;
  authorityGrantedAt?: number | null;
  authorityExpiresAt?: number | null;
  allowedProviders?: string[];
  pendingApproval?: {
    tokenJti: string;
    createdAt: number;
    expiresAt: number;
    authority: "read" | "write";
  } | null;
};
