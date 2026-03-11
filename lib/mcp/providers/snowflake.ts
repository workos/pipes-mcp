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
  instructions:
    "- Default: READONLY_ROLE on STUDIO_WH warehouse\n" +
    "- Always use LIMIT clauses\n" +
    '- Body: `{ statement: "SQL", warehouse?, role?, database?, schema?, timeout? }`',
  documentation: {
    summary:
      "**Snowflake** (SQL API) - `https://{account}.snowflakecomputing.com/api/v2/statements`",
  },
};
