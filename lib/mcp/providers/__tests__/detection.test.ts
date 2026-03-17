import { describe, expect, it } from "vitest";
import { detectProviderFromUrl } from "../index";
import { linear } from "../linear";
import { notion } from "../notion";
import { snowflake } from "../snowflake";

describe("linear.matchesUrl", () => {
  it("matches the GraphQL endpoint", () => {
    expect(linear.matchesUrl(new URL("https://api.linear.app/graphql"))).toBe(
      true,
    );
  });

  it("rejects http://", () => {
    expect(linear.matchesUrl(new URL("http://api.linear.app/graphql"))).toBe(
      false,
    );
  });

  it("rejects wrong hostname", () => {
    expect(linear.matchesUrl(new URL("https://evil.linear.app/graphql"))).toBe(
      false,
    );
  });

  it("rejects wrong path", () => {
    expect(linear.matchesUrl(new URL("https://api.linear.app/rest"))).toBe(
      false,
    );
  });

  it("rejects non-standard port", () => {
    expect(
      linear.matchesUrl(new URL("https://api.linear.app:8080/graphql")),
    ).toBe(false);
  });
});

describe("notion.matchesUrl", () => {
  it("matches /v1/ paths", () => {
    expect(notion.matchesUrl(new URL("https://api.notion.com/v1/pages"))).toBe(
      true,
    );
  });

  it("matches nested /v1/ paths", () => {
    expect(
      notion.matchesUrl(
        new URL("https://api.notion.com/v1/blocks/abc/children"),
      ),
    ).toBe(true);
  });

  it("rejects http://", () => {
    expect(notion.matchesUrl(new URL("http://api.notion.com/v1/pages"))).toBe(
      false,
    );
  });

  it("rejects wrong hostname", () => {
    expect(notion.matchesUrl(new URL("https://evil.notion.com/v1/pages"))).toBe(
      false,
    );
  });

  it("rejects paths outside /v1/", () => {
    expect(notion.matchesUrl(new URL("https://api.notion.com/v2/pages"))).toBe(
      false,
    );
  });

  it("rejects root path", () => {
    expect(notion.matchesUrl(new URL("https://api.notion.com/"))).toBe(false);
  });
});

describe("snowflake.matchesUrl", () => {
  it("matches a valid statements endpoint", () => {
    expect(
      snowflake.matchesUrl(
        new URL("https://myaccount.snowflakecomputing.com/api/v2/statements"),
      ),
    ).toBe(true);
  });

  it("matches sub-paths under /api/v2/statements", () => {
    expect(
      snowflake.matchesUrl(
        new URL(
          "https://myaccount.snowflakecomputing.com/api/v2/statements/abc-123",
        ),
      ),
    ).toBe(true);
  });

  it("rejects http://", () => {
    expect(
      snowflake.matchesUrl(
        new URL("http://myaccount.snowflakecomputing.com/api/v2/statements"),
      ),
    ).toBe(false);
  });

  it("rejects wrong hostname suffix", () => {
    expect(
      snowflake.matchesUrl(
        new URL("https://evil-snowflakecomputing.com/api/v2/statements"),
      ),
    ).toBe(false);
  });

  it("rejects paths outside /api/v2/statements", () => {
    expect(
      snowflake.matchesUrl(
        new URL("https://myaccount.snowflakecomputing.com/api/v1/queries"),
      ),
    ).toBe(false);
  });
});

describe("detectProviderFromUrl", () => {
  it("detects Linear", () => {
    expect(detectProviderFromUrl("https://api.linear.app/graphql")?.id).toBe(
      "linear",
    );
  });

  it("detects Notion", () => {
    expect(detectProviderFromUrl("https://api.notion.com/v1/search")?.id).toBe(
      "notion",
    );
  });

  it("detects Snowflake", () => {
    expect(
      detectProviderFromUrl(
        "https://acme.snowflakecomputing.com/api/v2/statements",
      )?.id,
    ).toBe("snowflake");
  });

  it("returns null for unknown URLs", () => {
    expect(detectProviderFromUrl("https://example.com/api")).toBeNull();
  });

  it("returns null for malformed URLs", () => {
    expect(detectProviderFromUrl("not-a-url")).toBeNull();
  });

  it("rejects http:// URLs even with valid hostnames", () => {
    expect(detectProviderFromUrl("http://api.linear.app/graphql")).toBeNull();
  });

  it("rejects valid hostnames with wrong paths", () => {
    expect(detectProviderFromUrl("https://api.linear.app/rest")).toBeNull();
  });

  it("providers do not match each other's URLs", () => {
    const linearUrl = new URL("https://api.linear.app/graphql");
    const notionUrl = new URL("https://api.notion.com/v1/pages");
    const snowflakeUrl = new URL(
      "https://acme.snowflakecomputing.com/api/v2/statements",
    );

    expect(notion.matchesUrl(linearUrl)).toBe(false);
    expect(snowflake.matchesUrl(linearUrl)).toBe(false);

    expect(linear.matchesUrl(notionUrl)).toBe(false);
    expect(snowflake.matchesUrl(notionUrl)).toBe(false);

    expect(linear.matchesUrl(snowflakeUrl)).toBe(false);
    expect(notion.matchesUrl(snowflakeUrl)).toBe(false);
  });
});
