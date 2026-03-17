import { graphqlContainsMutation } from "../write-detection";
import type { ProviderDefinition } from "./types";

export const linear: ProviderDefinition = {
  id: "linear",
  displayName: "Linear",
  matchesUrl(url: URL): boolean {
    return (
      url.protocol === "https:" &&
      url.hostname === "api.linear.app" &&
      url.port === "" &&
      url.pathname === "/graphql"
    );
  },
  buildHeaders: () => ({
    "Content-Type": "application/json",
  }),
  isWriteOperation(
    method: string,
    _url: URL,
    body?: Record<string, unknown>,
  ): boolean {
    if (method === "GET") return false;
    const query = body?.query;
    if (typeof query === "string") {
      return graphqlContainsMutation(query);
    }
    // No parseable query string — fail closed
    return true;
  },
  instructions:
    "- Returns only 50 results by default (use `first: N` for more)",
};
