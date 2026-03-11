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
  instructions:
    "- Returns only 50 results by default (use `first: N` for more)",
  documentation: {
    summary: "**Linear** (GraphQL) - `https://api.linear.app/graphql`",
  },
};
