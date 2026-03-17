import type { ProviderDefinition } from "./types";

export const snowflake: ProviderDefinition = {
  id: "snowflake",
  displayName: "Snowflake",
  matchesUrl(url: URL): boolean {
    return (
      url.protocol === "https:" &&
      url.port === "" &&
      /\.snowflakecomputing\.com$/.test(url.hostname) &&
      url.pathname.startsWith("/api/v2/statements")
    );
  },
  buildHeaders: () => ({
    "X-Snowflake-Authorization-Token-Type": "OAUTH",
    "Content-Type": "application/json",
    Accept: "application/json",
  }),
  isWriteOperation(method: string): boolean {
    if (method === "GET") return false;
    // All Snowflake SQL API POST requests are writes (no read-only POST endpoints)
    return true;
  },
  instructions:
    "- Always use LIMIT clauses\n" +
    '- Body: `{ statement: "SQL", warehouse?, role?, database?, schema?, timeout? }`',
};
