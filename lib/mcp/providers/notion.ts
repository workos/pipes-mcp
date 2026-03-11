import type { ProviderDefinition } from "./types";

export const notion: ProviderDefinition = {
  id: "notion",
  displayName: "Notion",
  matchesUrl(url: URL): boolean {
    return (
      url.protocol === "https:" &&
      url.hostname === "api.notion.com" &&
      url.port === "" &&
      url.pathname.startsWith("/v1/")
    );
  },
  buildHeaders: () => ({
    "Notion-Version": "2025-09-03",
    "Content-Type": "application/json",
  }),
  isWriteOperation(method: string, url: URL): boolean {
    if (method === "GET") return false;
    if (method === "POST") {
      const path = url.pathname;
      // Notion read endpoints that use POST
      if (path === "/v1/search") return false;
      if (/^\/v1\/databases\/[^/]+\/query$/.test(path)) return false;
      return true;
    }
    // PUT, PATCH, DELETE
    return true;
  },
  instructions:
    "- Notion-Version header added automatically\n" +
    "- Common endpoints: `/search`, `/pages/{id}`, `/blocks/{id}/children`, `/databases/{id}/query`",
  documentation: {
    summary: "**Notion** (REST) - `https://api.notion.com/v1/*`",
  },
};
