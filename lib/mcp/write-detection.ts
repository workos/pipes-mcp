/**
 * Write Detection
 *
 * Determines if an API request is a read or write operation.
 * Provider-specific overrides take precedence; the generic handler
 * covers GraphQL introspection and standard REST semantics.
 */

import { parse } from "graphql";
import { detectProviderFromUrl } from "./providers";

/**
 * Checks if a GraphQL document contains any mutation operations.
 * Uses the reference graphql-js parser to inspect the AST.
 * Fails closed: if parsing fails, assumes write.
 */
export function graphqlContainsMutation(query: string): boolean {
  try {
    const doc = parse(query);
    return doc.definitions.some(
      (def) =>
        def.kind === "OperationDefinition" && def.operation === "mutation",
    );
  } catch {
    // Unparseable document — fail closed, treat as write
    return true;
  }
}

/**
 * Generic write detection (no provider context).
 *
 * - REST: GET = read, PUT/PATCH/DELETE = write
 * - GraphQL (POST with `body.query`): parses AST for mutations
 * - Other POST: write
 */
export function isWriteOperationGeneric(
  method: string,
  body?: Record<string, unknown>,
): boolean {
  const m = method.toUpperCase();
  if (m === "GET") return false;
  if (m === "PUT" || m === "PATCH" || m === "DELETE") return true;

  if (m === "POST" && body) {
    const query = body.query;
    if (typeof query === "string") {
      return graphqlContainsMutation(query);
    }
  }

  // POST without recognized body shape is a write
  return true;
}

/**
 * Provider-aware write detection (primary entry point).
 *
 * Detects the provider from the URL and delegates to its override
 * if defined. Falls back to isWriteOperationGeneric() otherwise.
 * Normalizes HTTP method to uppercase once.
 */
export function isWriteRequest(
  method: string,
  url: string,
  body?: Record<string, unknown>,
): boolean {
  const m = method.toUpperCase();
  const provider = detectProviderFromUrl(url);

  if (provider?.isWriteOperation) {
    return provider.isWriteOperation(m, new URL(url), body);
  }

  return isWriteOperationGeneric(m, body);
}
