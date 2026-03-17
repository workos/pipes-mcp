import { describe, expect, it } from "vitest";
import {
  graphqlContainsMutation,
  isWriteOperationGeneric,
  isWriteRequest,
} from "../../write-detection";

// ---------------------------------------------------------------------------
// graphqlContainsMutation
// ---------------------------------------------------------------------------
describe("graphqlContainsMutation", () => {
  // ---- Queries (should return false) ----

  it("simple named query", () => {
    expect(graphqlContainsMutation(`query { viewer { id } }`)).toBe(false);
  });

  it("shorthand query (no keyword)", () => {
    expect(graphqlContainsMutation(`{ viewer { id name } }`)).toBe(false);
  });

  it("named query with variables", () => {
    expect(
      graphqlContainsMutation(
        `query GetIssues($first: Int!) { issues(first: $first) { nodes { id } } }`,
      ),
    ).toBe(false);
  });

  it("query with fragments", () => {
    expect(
      graphqlContainsMutation(`
        fragment UserFields on User {
          id
          name
          email
        }

        query {
          viewer {
            ...UserFields
          }
        }
      `),
    ).toBe(false);
  });

  it("query with leading comments", () => {
    expect(
      graphqlContainsMutation(`
        # This fetches the current user
        # Not a mutation at all
        query {
          viewer { id }
        }
      `),
    ).toBe(false);
  });

  it("subscription is not a mutation", () => {
    expect(
      graphqlContainsMutation(`subscription { issueUpdated { id title } }`),
    ).toBe(false);
  });

  it("introspection query", () => {
    expect(graphqlContainsMutation(`{ __schema { types { name } } }`)).toBe(
      false,
    );
  });

  it("query with 'mutation' in a field name", () => {
    expect(
      graphqlContainsMutation(`query { mutationLog { id timestamp } }`),
    ).toBe(false);
  });

  it("query with 'mutation' in a string argument", () => {
    expect(
      graphqlContainsMutation(`query { search(query: "mutation") { id } }`),
    ).toBe(false);
  });

  // ---- Mutations (should return true) ----

  it("simple mutation", () => {
    expect(
      graphqlContainsMutation(
        `mutation { createIssue(input: { title: "Bug" }) { id } }`,
      ),
    ).toBe(true);
  });

  it("named mutation", () => {
    expect(
      graphqlContainsMutation(
        `mutation CreateIssue($input: IssueCreateInput!) { issueCreate(input: $input) { issue { id } } }`,
      ),
    ).toBe(true);
  });

  it("mutation with leading whitespace", () => {
    expect(
      graphqlContainsMutation(`
        mutation {
          deleteIssue(id: "123") { success }
        }
      `),
    ).toBe(true);
  });

  it("mutation with leading comments", () => {
    expect(
      graphqlContainsMutation(`
        # Create a new issue
        mutation CreateIssue {
          issueCreate(input: { title: "Test" }) { issue { id } }
        }
      `),
    ).toBe(true);
  });

  it("mutation with fragments", () => {
    expect(
      graphqlContainsMutation(`
        fragment IssueFields on Issue {
          id
          title
        }

        mutation {
          issueCreate(input: { title: "Test" }) {
            issue {
              ...IssueFields
            }
          }
        }
      `),
    ).toBe(true);
  });

  it("document with both query and mutation returns true", () => {
    expect(
      graphqlContainsMutation(`
        query GetViewer {
          viewer { id }
        }

        mutation CreateIssue {
          issueCreate(input: { title: "Test" }) { issue { id } }
        }
      `),
    ).toBe(true);
  });

  // ---- Malformed / edge cases (should fail closed → true) ----

  it("empty string fails closed", () => {
    expect(graphqlContainsMutation("")).toBe(true);
  });

  it("garbage input fails closed", () => {
    expect(graphqlContainsMutation("not valid graphql at all!!!")).toBe(true);
  });

  it("partial document fails closed", () => {
    expect(graphqlContainsMutation("mutation { createIssue(")).toBe(true);
  });

  // ---- Adversarial / tricky GraphQL ----

  it("multiple queries, no mutations", () => {
    expect(
      graphqlContainsMutation(`
        query A { viewer { id } }
        query B { users { id } }
      `),
    ).toBe(false);
  });

  it("mutation buried after many queries", () => {
    expect(
      graphqlContainsMutation(`
        query A { viewer { id } }
        query B { users { id } }
        query C { teams { id } }
        mutation D { deleteUser(id: "1") { success } }
      `),
    ).toBe(true);
  });

  it("only fragments, no operations", () => {
    // A document with only fragments and no operations — no mutation
    expect(
      graphqlContainsMutation(`
        fragment F on User { id name }
      `),
    ).toBe(false);
  });

  it("deeply nested query is still just a query", () => {
    expect(
      graphqlContainsMutation(`
        query {
          viewer {
            teams {
              projects {
                issues {
                  comments {
                    body
                  }
                }
              }
            }
          }
        }
      `),
    ).toBe(false);
  });

  it("query with alias that looks like mutation keyword", () => {
    expect(graphqlContainsMutation(`query { mutation: viewer { id } }`)).toBe(
      false,
    );
  });

  it("inline fragment does not affect operation type", () => {
    expect(
      graphqlContainsMutation(`
        query {
          viewer {
            ... on User { id name }
          }
        }
      `),
    ).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// isWriteOperationGeneric
// ---------------------------------------------------------------------------
describe("isWriteOperationGeneric", () => {
  // ---- REST methods ----

  it("GET is always read", () => {
    expect(isWriteOperationGeneric("GET")).toBe(false);
    expect(isWriteOperationGeneric("GET", { anything: true })).toBe(false);
  });

  it("DELETE is always write", () => {
    expect(isWriteOperationGeneric("DELETE")).toBe(true);
  });

  it("PATCH is always write", () => {
    expect(isWriteOperationGeneric("PATCH")).toBe(true);
    expect(isWriteOperationGeneric("PATCH", { data: "x" })).toBe(true);
  });

  it("POST without body is write (REST)", () => {
    expect(isWriteOperationGeneric("POST")).toBe(true);
  });

  it("POST with non-recognized body is write (REST)", () => {
    expect(isWriteOperationGeneric("POST", { data: "some payload" })).toBe(
      true,
    );
  });

  it("POST with numeric query field is write (not a GraphQL string)", () => {
    expect(isWriteOperationGeneric("POST", { query: 123 })).toBe(true);
  });

  // ---- POST with body.query (no longer inspected by generic handler) ----

  it("POST with GraphQL query body is write (generic ignores body)", () => {
    expect(
      isWriteOperationGeneric("POST", {
        query: "{ viewer { id } }",
      }),
    ).toBe(true);
  });

  it("POST with named GraphQL query body is write (generic ignores body)", () => {
    expect(
      isWriteOperationGeneric("POST", {
        query: "query GetUser { viewer { id name } }",
      }),
    ).toBe(true);
  });

  it("POST with GraphQL mutation body is write", () => {
    expect(
      isWriteOperationGeneric("POST", {
        query: 'mutation { issueCreate(input: { title: "Bug" }) { id } }',
      }),
    ).toBe(true);
  });

  // ---- Snowflake-style bodies via generic handler (always write) ----

  it("POST with Snowflake SELECT body is write (generic ignores body)", () => {
    expect(
      isWriteOperationGeneric("POST", {
        statement: "SELECT * FROM users LIMIT 10",
        warehouse: "WH",
      }),
    ).toBe(true);
  });

  it("POST with Snowflake INSERT body is write", () => {
    expect(
      isWriteOperationGeneric("POST", {
        statement: "INSERT INTO users (name) VALUES ('test')",
        warehouse: "WH",
      }),
    ).toBe(true);
  });

  // ---- Method case normalization ----

  it("normalizes lowercase method", () => {
    expect(isWriteOperationGeneric("get")).toBe(false);
    expect(isWriteOperationGeneric("post")).toBe(true);
    expect(isWriteOperationGeneric("delete")).toBe(true);
  });

  it("normalizes mixed-case method", () => {
    expect(isWriteOperationGeneric("Get")).toBe(false);
    expect(isWriteOperationGeneric("Post")).toBe(true);
  });

  // ---- Edge cases ----

  it("POST with empty string query fails closed (write)", () => {
    expect(isWriteOperationGeneric("POST", { query: "" })).toBe(true);
  });

  it("POST with null query falls through to write", () => {
    expect(isWriteOperationGeneric("POST", { query: null })).toBe(true);
  });

  it("POST with empty object body is write", () => {
    expect(isWriteOperationGeneric("POST", {})).toBe(true);
  });

  it("POST with boolean query field is write", () => {
    expect(isWriteOperationGeneric("POST", { query: true })).toBe(true);
  });

  it("POST with array query field is write", () => {
    expect(
      isWriteOperationGeneric("POST", { query: ["not", "a", "string"] }),
    ).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// isWriteRequest (provider-aware entry point)
// ---------------------------------------------------------------------------
describe("isWriteRequest", () => {
  // ---- Notion provider override ----

  it("Notion POST /v1/search is read", () => {
    expect(
      isWriteRequest("POST", "https://api.notion.com/v1/search", {
        query: "test",
        page_size: 1,
      }),
    ).toBe(false);
  });

  it("Notion POST /v1/databases/:id/query is read", () => {
    expect(
      isWriteRequest(
        "POST",
        "https://api.notion.com/v1/databases/abc123/query",
        { filter: {} },
      ),
    ).toBe(false);
  });

  it("Notion POST /v1/pages is write", () => {
    expect(
      isWriteRequest("POST", "https://api.notion.com/v1/pages", {
        parent: { database_id: "abc" },
        properties: {},
      }),
    ).toBe(true);
  });

  it("Notion PATCH /v1/pages/:id is write", () => {
    expect(
      isWriteRequest("PATCH", "https://api.notion.com/v1/pages/abc123", {
        properties: {},
      }),
    ).toBe(true);
  });

  it("Notion DELETE /v1/blocks/:id is write", () => {
    expect(
      isWriteRequest("DELETE", "https://api.notion.com/v1/blocks/abc123"),
    ).toBe(true);
  });

  it("Notion GET /v1/pages/:id is read", () => {
    expect(
      isWriteRequest("GET", "https://api.notion.com/v1/pages/abc123"),
    ).toBe(false);
  });

  it("Notion POST /v1/comments is write", () => {
    expect(
      isWriteRequest("POST", "https://api.notion.com/v1/comments", {
        parent: { page_id: "abc" },
        rich_text: [],
      }),
    ).toBe(true);
  });

  // ---- Linear provider override (GraphQL) ----

  it("Linear GraphQL query is read", () => {
    expect(
      isWriteRequest("POST", "https://api.linear.app/graphql", {
        query: "{ viewer { id } }",
      }),
    ).toBe(false);
  });

  it("Linear GraphQL mutation is write", () => {
    expect(
      isWriteRequest("POST", "https://api.linear.app/graphql", {
        query:
          'mutation { issueCreate(input: { title: "Bug" }) { issue { id } } }',
      }),
    ).toBe(true);
  });

  it("Linear POST with no query body fails closed (write)", () => {
    expect(
      isWriteRequest("POST", "https://api.linear.app/graphql", {
        data: "payload",
      }),
    ).toBe(true);
  });

  it("Linear POST with query + extra statement field classifies via GraphQL", () => {
    expect(
      isWriteRequest("POST", "https://api.linear.app/graphql", {
        query: "{ viewer { id } }",
        statement: "DROP TABLE users",
      }),
    ).toBe(false);
  });

  // ---- Snowflake provider override ----

  it("Snowflake POST with statement is write", () => {
    expect(
      isWriteRequest(
        "POST",
        "https://myaccount.snowflakecomputing.com/api/v2/statements",
        { statement: "SELECT * FROM users LIMIT 10" },
      ),
    ).toBe(true);
  });

  it("Snowflake POST with statement + smuggled query field is still write", () => {
    expect(
      isWriteRequest(
        "POST",
        "https://myaccount.snowflakecomputing.com/api/v2/statements",
        {
          statement: "DROP TABLE users",
          query: "{ __typename }",
        },
      ),
    ).toBe(true);
  });

  it("Snowflake GET is read", () => {
    expect(
      isWriteRequest(
        "GET",
        "https://myaccount.snowflakecomputing.com/api/v2/statements/01234",
      ),
    ).toBe(false);
  });

  // ---- Unknown provider falls through to generic ----

  it("unknown provider POST without GraphQL is write", () => {
    expect(
      isWriteRequest("POST", "https://api.example.com/resource", {
        data: "payload",
      }),
    ).toBe(true);
  });

  it("unknown provider GET is read", () => {
    expect(isWriteRequest("GET", "https://api.example.com/resource")).toBe(
      false,
    );
  });

  // ---- Method case normalization ----

  it("normalizes lowercase method for Notion", () => {
    expect(
      isWriteRequest("post", "https://api.notion.com/v1/search", {
        query: "test",
      }),
    ).toBe(false);
  });

  it("normalizes lowercase method for generic", () => {
    expect(isWriteRequest("get", "https://api.linear.app/graphql")).toBe(false);
  });

  it("normalizes mixed-case method", () => {
    expect(
      isWriteRequest("Post", "https://api.notion.com/v1/search", {
        query: "test",
      }),
    ).toBe(false);
  });
});
