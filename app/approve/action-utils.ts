import type { ApprovalTokenPayload } from "@/lib/mcp/approval-token";

export function readInstructions(formData: FormData): string | null {
  const rawInstructions = (
    formData.get("instructions") as string | null
  )?.trim();
  return rawInstructions || null;
}

export function selectApprovedProviders(
  formData: FormData,
  payload: Pick<ApprovalTokenPayload, "integrations">,
): string[] {
  const tokenSlugs = new Set(
    (payload.integrations ?? []).map((item) => item.slug),
  );

  return (formData.getAll("providers") as string[]).filter((provider) =>
    tokenSlugs.has(provider),
  );
}
