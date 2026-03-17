"use server";

import { redirect } from "next/navigation";
import { readInstructions, selectApprovedProviders } from "./action-utils";
import {
  approveBroadGrant,
  approveRequestGrant,
  denyBroadGrant,
  denyRequestGrant,
} from "./action-workflows";
import { validateAndConsumeApproval } from "./validate-approval";

export async function handleApprove(formData: FormData): Promise<void> {
  const payload = await validateAndConsumeApproval(formData);
  const userInstructions = readInstructions(formData);

  if (payload.authority === "request" && payload.requestDetails) {
    await approveRequestGrant(payload, userInstructions);
    return;
  }

  const selectedProviders = selectApprovedProviders(formData, payload);
  if (selectedProviders.length === 0) {
    redirect("/approve?error=no_providers_selected");
  }

  await approveBroadGrant(
    payload as typeof payload & { authority: "read" | "write" },
    selectedProviders,
    userInstructions,
  );
}

export async function handleDeny(formData: FormData): Promise<void> {
  const payload = await validateAndConsumeApproval(formData);
  const userInstructions = readInstructions(formData);

  if (payload.authority === "request" && payload.requestDetails) {
    await denyRequestGrant(payload, userInstructions);
    return;
  }

  await denyBroadGrant(
    payload as typeof payload & { authority: "read" | "write" },
    userInstructions,
  );
}
