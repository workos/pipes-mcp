/**
 * Bridge Types
 *
 * Shared types and error classes for integration API calls.
 */

/**
 * Standardized success/error response wrapper
 */
export interface BridgeResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
    requiresConnection?: boolean;
    provider?: string;
  };
}

/**
 * Error for when a provider is not connected
 */
export class NotConnectedError extends Error {
  constructor(
    public provider: string,
    public pipesError?: string,
  ) {
    super(`Provider ${provider} is not connected. ${pipesError || ""}`);
    this.name = "NotConnectedError";
  }
}

/**
 * Error for when a provider is not supported
 */
export class UnsupportedProviderError extends Error {
  constructor(public domain: string) {
    super(`Provider not supported for domain: ${domain}`);
    this.name = "UnsupportedProviderError";
  }
}
