import { describe, expect, it } from "vitest";
import { readInstructions, selectApprovedProviders } from "./action-utils";
import { buildApprovalReturnTo, formatClientName } from "./helpers";

describe("approval helpers", () => {
  it("formats client names from hyphenated ids", () => {
    expect(formatClientName("claude-code")).toBe("Claude Code");
    expect(formatClientName()).toBe("An AI assistant");
  });

  it("builds the returnTo query in the existing order", () => {
    expect(
      buildApprovalReturnTo({
        token: "tok_123",
        result: "approved",
        error: "expired",
      }),
    ).toBe("/approve?token=tok_123&result=approved&error=expired");
  });

  it("trims instruction text and normalizes empty values to null", () => {
    const formData = new FormData();
    formData.set("instructions", "  keep scope narrow  ");
    expect(readInstructions(formData)).toBe("keep scope narrow");

    const emptyFormData = new FormData();
    emptyFormData.set("instructions", "   ");
    expect(readInstructions(emptyFormData)).toBeNull();
  });

  it("filters selected providers to only those in the token payload", () => {
    const formData = new FormData();
    formData.append("providers", "linear");
    formData.append("providers", "snowflake");
    formData.append("providers", "github");

    const selected = selectApprovedProviders(formData, {
      integrations: [
        { name: "Linear", slug: "linear" },
        { name: "Snowflake", slug: "snowflake" },
      ],
    });

    expect(selected).toEqual(["linear", "snowflake"]);
  });
});
