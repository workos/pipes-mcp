/**
 * Provider Definition Types
 *
 * Each supported provider implements this interface.
 * Adding a new provider = one new file exporting a ProviderDefinition.
 */

export interface ProviderDefinition {
  /** Provider slug — also the WorkOS Pipes integration key */
  id: string;
  /** Human-readable name */
  displayName: string;
  /** Returns true if this provider handles the given URL. Validates scheme, hostname, and path. */
  matchesUrl(url: URL): boolean;
  /** Additional headers to inject (Authorization is added by the framework) */
  buildHeaders(): Record<string, string>;
  /** Static instructions for this provider (used by get_integration_instructions and get_mcp_server_info) */
  instructions: string;
  /** Documentation shown in get_mcp_server_info */
  documentation: {
    /** One-line summary for the integrations list */
    summary: string;
  };
  /**
   * Optional per-provider write detection override.
   * If defined, called instead of the generic handler.
   * Receives the normalized (uppercase) HTTP method, parsed URL, and optional body.
   * If not defined, falls back to isWriteOperationGeneric().
   */
  isWriteOperation?(
    method: string,
    url: URL,
    body?: Record<string, unknown>,
  ): boolean;
}
