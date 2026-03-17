/**
 * Write Detection
 *
 * Determines if an API request is a read or write operation.
 * Provider-specific overrides take precedence; the generic handler
 * uses purely REST semantics (GET = read, everything else = write).
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
 * Purely REST-semantic: GET = read, everything else = write.
 * Provider-specific overrides (e.g. Linear's GraphQL parsing) handle
 * nuances like distinguishing queries from mutations.
 */
export function isWriteOperationGeneric(
  method: string,
  _body?: Record<string, unknown>,
): boolean {
  const m = method.toUpperCase();
  if (m === "GET") return false;
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
