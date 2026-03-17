/**
 * Provider Registry
 *
 * Central registry for all supported providers.
 * To add a new provider: import it and add to ALL_PROVIDERS.
 */

import { linear } from "./linear";
import { notion } from "./notion";
import { snowflake } from "./snowflake";

export type { ProviderDefinition } from "./types";

const ALL_PROVIDERS = [linear, notion, snowflake];

/** O(1) lookup by provider id */
const providerById = new Map(ALL_PROVIDERS.map((p) => [p.id, p]));

/** Get all registered providers */
export function getAllProviders() {
  return ALL_PROVIDERS;
}

/** Get a provider by id. Throws if not found. */
export function getProvider(id: string) {
  const provider = providerById.get(id);
  if (!provider) {
    throw new Error(`Unsupported provider: ${id}`);
  }
  return provider;
}

/**
 * Detect the provider from a URL.
 * Each provider validates scheme, hostname, and path.
 * Returns the provider definition or null if unrecognized.
 */
export function detectProviderFromUrl(
  url: string,
): (typeof ALL_PROVIDERS)[number] | null {
  try {
    const parsed = new URL(url);
    for (const provider of ALL_PROVIDERS) {
      if (provider.matchesUrl(parsed)) return provider;
    }
    return null;
  } catch {
    return null;
  }
}
