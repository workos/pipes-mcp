import { UnsupportedProviderError } from "../bridge-types";
import { detectProviderFromUrl } from "../providers";
import {
  type PipesSession,
  requireProviderAccess,
  requireReadMode,
  requireWriteMode,
  SessionError,
} from "../session";
import { isWriteRequest } from "../write-detection";

export interface IntegrationApiAuthorizationInput {
  url: string;
  method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  body?: Record<string, unknown>;
}

export type BroadAuthorizationResult =
  | { kind: "authorized"; provider: string }
  | { kind: "denied"; error: SessionError };

export function authorizeBroadIntegrationRequest(
  session: PipesSession,
  input: IntegrationApiAuthorizationInput,
): BroadAuthorizationResult {
  try {
    requireReadMode(session);
    if (isWriteRequest(input.method, input.url, input.body)) {
      requireWriteMode(session);
    }

    const detected = detectProviderFromUrl(input.url);
    if (!detected) {
      const domain = new URL(input.url).hostname;
      throw new UnsupportedProviderError(domain);
    }

    requireProviderAccess(session, detected.id);
    return {
      kind: "authorized",
      provider: detected.id,
    };
  } catch (error) {
    if (error instanceof SessionError) {
      return {
        kind: "denied",
        error,
      };
    }

    throw error;
  }
}
