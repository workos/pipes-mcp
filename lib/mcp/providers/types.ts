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
  /**
   * Static instructions for this provider (shown in server_info),
   * **Keep lightweight and concise and create skills for more detailed instructions.**
   */
  instructions: string;
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
