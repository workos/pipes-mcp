export const PROVIDER_ICONS: Record<string, string> = {
  linear:
    "https://images.workoscdn.com/images/ea736232-215d-4925-8bf3-c3d7a4b24078.svg",
  notion: "https://cdn.workos.com/provider-icons/light/notion.svg",
  snowflake:
    "https://images.workoscdn.com/images/de5bb010-a1d4-4ed1-8395-099db5149efc.svg",
};

export const PERMISSIONS: Record<string, string[]> = {
  read: ["Read data from these services", "Query APIs on your behalf"],
  write: [
    "Read and write data on these services",
    "Create, update, and delete resources",
    "Execute mutations on your behalf",
  ],
};

export const ERROR_MESSAGES: Record<string, string> = {
  missing_token:
    "No approval token provided. Please use the link from your AI assistant.",
  invalid_token:
    "This approval link is invalid. Please request a new one from your AI assistant.",
  expired:
    "This approval link has expired. Please request a new one from your AI assistant.",
  user_mismatch: "This approval link was generated for a different user.",
  auth_required: "You must be signed in to approve or deny this request.",
  no_providers_selected:
    "No integrations were selected. At least one must be selected to grant authority.",
};
