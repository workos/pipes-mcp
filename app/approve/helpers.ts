interface ApprovalPageParams {
  token?: string;
  result?: string;
  error?: string;
}

function capitalizeWord(word: string): string {
  return word.charAt(0).toUpperCase() + word.slice(1);
}

export function formatClientName(clientName?: string): string {
  if (!clientName) {
    return "An AI assistant";
  }

  return clientName.split("-").map(capitalizeWord).join(" ");
}

export function buildApprovalReturnTo(params: ApprovalPageParams): string {
  const returnParams = new URLSearchParams();

  if (params.token) returnParams.set("token", params.token);
  if (params.result) returnParams.set("result", params.result);
  if (params.error) returnParams.set("error", params.error);

  if (returnParams.size === 0) {
    return "/approve";
  }

  return `/approve?${returnParams.toString()}`;
}
