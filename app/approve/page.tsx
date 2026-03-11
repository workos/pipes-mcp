import { getSignInUrl, withAuth } from "@workos-inc/authkit-nextjs";
import { redirect } from "next/navigation";
import { decryptApprovalToken } from "@/lib/mcp/approval-token";
import { ApprovalForm } from "./approval-form";

interface Props {
  searchParams: Promise<{
    token?: string;
    result?: string;
    error?: string;
  }>;
}

/* ------------------------------------------------------------------ */
/*  Provider icon URLs from WorkOS CDN                                 */
/* ------------------------------------------------------------------ */

const PROVIDER_ICONS: Record<string, string> = {
  linear:
    "https://images.workoscdn.com/images/ea736232-215d-4925-8bf3-c3d7a4b24078.svg",
  notion: "https://cdn.workos.com/provider-icons/light/notion.svg",
  snowflake:
    "https://images.workoscdn.com/images/de5bb010-a1d4-4ed1-8395-099db5149efc.svg",
};

/* ------------------------------------------------------------------ */
/*  Permission descriptions by authority level                         */
/* ------------------------------------------------------------------ */

const PERMISSIONS: Record<string, string[]> = {
  read: ["Read data from these services", "Query APIs on your behalf"],
  write: [
    "Read and write data on these services",
    "Create, update, and delete resources",
    "Execute mutations on your behalf",
  ],
};

/* ------------------------------------------------------------------ */
/*  Error messages                                                     */
/* ------------------------------------------------------------------ */

const ERROR_MESSAGES: Record<string, string> = {
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

/* ------------------------------------------------------------------ */
/*  Styles                                                             */
/* ------------------------------------------------------------------ */

const s = {
  page: {
    minHeight: "100vh",
    display: "flex",
    flexDirection: "column" as const,
    alignItems: "center",
    justifyContent: "center",
    fontFamily:
      '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
    backgroundColor: "#f4f4f5",
    padding: 0,
    margin: 0,
  },
  card: {
    backgroundColor: "#fff",
    borderRadius: "1rem",
    boxShadow:
      "0 4px 6px -1px rgba(0,0,0,0.07), 0 2px 4px -2px rgba(0,0,0,0.05), 0 0 0 1px rgba(0,0,0,0.05)",
    padding: "2rem",
    maxWidth: "26rem",
    width: "100%",
  },

  /* Header */
  header: {
    textAlign: "left" as const,
    marginBottom: "1.5rem",
  },
  appLogo: {
    marginBottom: "1.25rem",
  },
  heading: {
    fontSize: "1.25rem",
    fontWeight: 600 as const,
    color: "#18181b",
    margin: 0,
    lineHeight: 1.4,
  },

  /* Divider */
  divider: {
    height: "1px",
    backgroundColor: "#e4e4e7",
    border: "none",
    margin: "0 0 1.25rem 0",
  },

  /* Integration list */
  integrationList: {
    listStyle: "none" as const,
    margin: "0 0 1.25rem 0",
    padding: 0,
    display: "flex",
    flexDirection: "column" as const,
    gap: "0.375rem",
  },
  integrationItem: {
    display: "flex",
    alignItems: "center",
    gap: "0.625rem",
    padding: "0.375rem 0.625rem",
    backgroundColor: "#fafafa",
    borderRadius: "0.375rem",
  },
  integrationIcon: {
    width: "20px",
    height: "20px",
    flexShrink: 0,
  },
  integrationName: {
    fontSize: "0.8125rem",
    fontWeight: 500 as const,
    color: "#18181b",
  },

  /* Section label */
  sectionLabel: {
    fontSize: "0.75rem",
    fontWeight: 500 as const,
    color: "#a1a1aa",
    textTransform: "uppercase" as const,
    letterSpacing: "0.05em",
    margin: "0 0 0.5rem 0",
  },

  /* Permissions */
  permissionList: {
    listStyle: "none" as const,
    margin: "0 0 1.25rem 0",
    padding: 0,
    display: "flex",
    flexDirection: "column" as const,
    gap: "0.375rem",
  },
  permissionItem: {
    display: "flex",
    alignItems: "center",
    gap: "0.5rem",
    fontSize: "0.8125rem",
    color: "#3f3f46",
    lineHeight: 1.5,
  },
  checkIcon: {
    color: "#22c55e",
    fontSize: "0.875rem",
    flexShrink: 0,
    fontWeight: 700 as const,
  },

  /* Meta info */
  meta: {
    display: "flex",
    flexDirection: "column" as const,
    gap: "0.25rem",
    marginBottom: "1.5rem",
    fontSize: "0.8125rem",
    color: "#71717a",
  },

  /* Buttons */
  buttonRow: {
    display: "flex",
    gap: "0.75rem",
    marginBottom: "1rem",
  },
  approveButton: {
    flex: 1,
    padding: "0.625rem 1rem",
    fontSize: "0.875rem",
    fontWeight: 600 as const,
    color: "#fff",
    backgroundColor: "#18181b",
    border: "none",
    borderRadius: "0.5rem",
    cursor: "pointer",
    lineHeight: 1.5,
  },
  denyButton: {
    flex: 1,
    padding: "0.625rem 1rem",
    fontSize: "0.875rem",
    fontWeight: 500 as const,
    color: "#3f3f46",
    backgroundColor: "#fff",
    border: "1px solid #d4d4d8",
    borderRadius: "0.5rem",
    cursor: "pointer",
    lineHeight: 1.5,
  },

  /* Fine print */
  finePrint: {
    fontSize: "0.75rem",
    color: "#a1a1aa",
    textAlign: "center" as const,
    lineHeight: 1.6,
    margin: 0,
  },

  /* Reason block */
  reasonBlock: {
    margin: "0 0 1.25rem 0",
    padding: "0.625rem 0.75rem",
    borderLeft: "3px solid #d4d4d8",
    backgroundColor: "#fafafa",
    borderRadius: "0 0.375rem 0.375rem 0",
    fontSize: "0.8125rem",
    fontStyle: "italic" as const,
    color: "#52525b",
    lineHeight: 1.6,
  },
  reasonLabel: {
    display: "block",
    fontSize: "0.6875rem",
    fontWeight: 600 as const,
    fontStyle: "normal" as const,
    color: "#a1a1aa",
    textTransform: "uppercase" as const,
    letterSpacing: "0.05em",
    marginBottom: "0.25rem",
  },

  /* Checkbox items */
  checkboxLabel: {
    display: "flex",
    alignItems: "center",
    gap: "0.625rem",
    cursor: "pointer",
    flex: 1,
  },
  checkbox: {
    width: "16px",
    height: "16px",
    flexShrink: 0,
    accentColor: "#18181b",
    cursor: "pointer",
  },

  /* Notes textarea */
  textarea: {
    width: "100%",
    minHeight: "4rem",
    padding: "0.5rem 0.625rem",
    fontSize: "0.8125rem",
    fontFamily:
      '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
    border: "1px solid #e4e4e7",
    borderRadius: "0.375rem",
    resize: "vertical" as const,
    outline: "none",
    color: "#18181b",
    lineHeight: 1.5,
    boxSizing: "border-box" as const,
    marginBottom: "1.25rem",
  },

  /* Result / Error screens */
  resultIcon: {
    width: "3rem",
    height: "3rem",
    borderRadius: "50%",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: "1.25rem",
    marginBottom: "0.75rem",
  },
  resultTitle: {
    fontSize: "1.125rem",
    fontWeight: 600 as const,
    color: "#18181b",
    margin: "0 0 0.375rem 0",
  },
  resultHint: {
    fontSize: "0.875rem",
    color: "#71717a",
    margin: 0,
    lineHeight: 1.6,
  },
  errorText: {
    fontSize: "0.875rem",
    color: "#dc2626",
    lineHeight: 1.6,
  },
};

/* ------------------------------------------------------------------ */
/*  Page component                                                     */
/* ------------------------------------------------------------------ */

export default async function ApprovePage({ searchParams }: Props) {
  const params = await searchParams;
  const { token, result, error } = params;
  const { user } = await withAuth();

  if (!user) {
    const returnParams = new URLSearchParams();
    if (token) returnParams.set("token", token);
    if (result) returnParams.set("result", result);
    if (error) returnParams.set("error", error);

    const returnTo =
      returnParams.size > 0
        ? `/approve?${returnParams.toString()}`
        : "/approve";
    redirect(await getSignInUrl({ returnTo }));
  }

  /* ---- Result: Approved ---- */
  if (result === "approved") {
    return (
      <main style={s.page}>
        <div style={{ ...s.card, textAlign: "center" as const }}>
          <div
            style={{
              ...s.resultIcon,
              backgroundColor: "#f0fdf4",
              color: "#16a34a",
            }}
          >
            &#10003;
          </div>
          <p style={s.resultTitle}>Authority granted</p>
          <p style={s.resultHint}>
            The AI assistant now has the requested access for 5 minutes. You can
            close this tab.
          </p>
        </div>
      </main>
    );
  }

  /* ---- Result: Denied ---- */
  if (result === "denied") {
    return (
      <main style={s.page}>
        <div style={{ ...s.card, textAlign: "center" as const }}>
          <div
            style={{
              ...s.resultIcon,
              backgroundColor: "#fef2f2",
              color: "#dc2626",
            }}
          >
            &#10005;
          </div>
          <p style={s.resultTitle}>Authority denied</p>
          <p style={s.resultHint}>
            The request was declined. The AI assistant remains without access.
            You can close this tab.
          </p>
        </div>
      </main>
    );
  }

  /* ---- Error state ---- */
  if (error) {
    return (
      <main style={s.page}>
        <div style={s.card}>
          <div style={s.header}>
            <h1 style={{ ...s.heading, color: "#dc2626" }}>
              Something went wrong
            </h1>
          </div>
          <p style={s.errorText}>
            {ERROR_MESSAGES[error] ?? "An unexpected error occurred."}
          </p>
        </div>
      </main>
    );
  }

  /* ---- No token ---- */
  if (!token) {
    return (
      <main style={s.page}>
        <div style={s.card}>
          <div style={s.header}>
            <h1 style={s.heading}>Invalid Request</h1>
          </div>
          <p style={s.errorText}>
            No approval token provided. Please use the link from your AI
            assistant.
          </p>
        </div>
      </main>
    );
  }

  /* ---- Decrypt token ---- */
  let payload: Awaited<ReturnType<typeof decryptApprovalToken>>;
  try {
    payload = await decryptApprovalToken(token);
  } catch {
    return (
      <main style={s.page}>
        <div style={s.card}>
          <div style={s.header}>
            <h1 style={{ ...s.heading, color: "#dc2626" }}>
              Something went wrong
            </h1>
          </div>
          <p style={s.errorText}>
            This approval link is invalid or has expired. Please request a new
            one from your AI assistant.
          </p>
        </div>
      </main>
    );
  }

  const integrations = payload.integrations ?? [];
  const permissions = PERMISSIONS[payload.authority] ?? PERMISSIONS.read;

  /* ---- Consent screen ---- */
  return (
    <main style={s.page}>
      <div style={s.appLogo}>
        <svg
          fill="color(display-p3 0.547 0.553 0.592)"
          viewBox="0 0 95 18"
          xmlns="http://www.w3.org/2000/svg"
          role="img"
          aria-label="WorkOS"
          height="22"
          width="116"
        >
          <path d="M86.9247 11.1805H84.2805C84.2805 13.8233 86.403 15.5804 89.4292 15.5804C92.4034 15.5804 94.4214 14.015 94.4214 11.6997C94.4214 8.92578 92.477 8.51952 90.0334 8.00899C89.9029 7.98176 89.771 7.95415 89.638 7.92596C87.8639 7.56064 87.2898 7.17851 87.2898 6.18719C87.2898 5.24801 88.1077 4.60483 89.4292 4.60483C90.7336 4.60483 91.6206 5.31829 91.6206 6.46621H94.2648C94.2648 4.10125 92.4202 2.53607 89.4292 2.53607C86.5594 2.53607 84.681 4.20571 84.681 6.41407C84.681 9.05823 86.8202 9.73656 88.8382 10.1368C91.0479 10.5713 91.7432 10.8505 91.7432 11.9109C91.7432 12.8503 90.838 13.5116 89.5165 13.5116C87.9513 13.5116 86.9247 12.6767 86.9247 11.1805Z" />
          <path
            clipRule="evenodd"
            d="M71.2191 9.105C71.2191 5.19166 73.6545 2.58264 77.307 2.58264C80.9595 2.58264 83.3947 5.19166 83.3947 9.105C83.3947 13.0183 80.9595 15.6272 77.307 15.6272C73.6545 15.6272 71.2191 13.0183 71.2191 9.105ZM80.872 9.105C80.872 6.44384 79.4463 4.65159 77.3057 4.65159C75.1651 4.65159 73.7407 6.44384 73.7407 9.105C73.7407 11.766 75.1664 13.5584 77.3057 13.5584C79.4449 13.5584 80.872 11.766 80.872 9.105Z"
            fillRule="evenodd"
          />
          <path d="M29.9986 2.70985H27.3898L30.7644 15.4072H33.7553L35.6339 7.71896C36.016 6.04913 36.0512 5.30168 36.0512 5.30168H36.0865C36.0865 5.30168 36.1216 6.04913 36.5391 7.71896L38.5387 15.4072H41.4438L44.7479 2.70966H42.1391L40.3298 10.4504C39.9828 11.9634 39.9477 12.7814 39.9477 12.7814H39.8954C39.8954 12.7814 39.8081 11.9634 39.4428 10.4504L37.5474 2.70985H34.5903L32.7994 10.4504C32.451 11.9295 32.3296 12.7814 32.3296 12.7814H32.2944C32.2944 12.7814 32.2253 11.9113 31.877 10.4504L29.9986 2.70985Z" />
          <path
            clipRule="evenodd"
            d="M49.0265 6.01123C46.1908 6.01123 44.3123 7.8896 44.3123 10.7946C44.3123 13.7164 46.192 15.6118 49.0265 15.6132C51.8443 15.6132 53.7226 13.7164 53.7226 10.7946C53.7226 7.8896 51.8443 6.01123 49.0265 6.01123ZM49.0265 7.85427C50.3832 7.85427 51.2872 8.91625 51.2872 10.7946C51.2872 12.5855 50.4876 13.7688 49.0265 13.7688C47.6517 13.7688 46.7477 12.7081 46.7477 10.7946C46.7477 9.03751 47.5656 7.85427 49.0265 7.85427Z"
            fillRule="evenodd"
          />
          <path d="M54.8873 6.1534H57.2001V7.85837H57.2523C57.6528 6.97132 58.6089 6.08427 60.2434 6.08427C60.5213 6.08427 60.696 6.11942 60.8175 6.1534V8.46622H60.7484C60.7484 8.46622 60.5396 8.39709 59.9656 8.39709C58.1747 8.39709 57.2001 9.45754 57.2001 11.4402V15.4058H54.8873V6.1534ZM64.2089 2.70966H61.8961V15.4058H64.2089V12.4317L65.079 11.5798L68.4536 15.407H71.185L66.5061 10.154L70.5393 6.15321H67.6526L64.2089 9.61394H64.1738C64.1738 9.61394 64.2089 9.17949 64.2089 6.77939V2.70966Z" />
          <path d="M0.000366211 8.99964C0.000366211 9.39431 0.104248 9.78899 0.305061 10.1282L3.94672 16.4353C4.32035 17.0791 4.88803 17.6052 5.59416 17.8406C6.98575 18.3044 8.42581 17.7091 9.11127 16.5183L9.99041 14.9952L6.52195 8.99983L11.0634 1.12817C11.3266 0.67132 11.6797 0.297499 12.0951 -0.000244141H6.44568C5.45571 -0.000244141 4.54182 0.525923 4.05041 1.3842L0.305061 7.87161C0.104248 8.21048 0.000366211 8.60516 0.000366211 8.99964Z" />
          <path d="M20.7698 8.9999C20.7698 8.60541 20.6661 8.21074 20.4653 7.87148L16.7752 1.48159C16.0899 0.297758 14.6499 -0.297729 13.2583 0.15912C12.5521 0.394689 11.9845 0.920856 11.6106 1.56462L10.7798 2.99772L14.2482 9.00009L9.70677 16.8716C9.44626 17.3161 9.09476 17.7007 8.67529 18H14.3245C15.3145 18 16.2284 17.474 16.72 16.6155L20.4653 10.1285C20.6661 9.78924 20.7698 9.39457 20.7698 8.9999Z" />
        </svg>
      </div>
      <div style={s.card}>
        {/* App identity */}
        <div style={s.header}>
          <h1 style={s.heading}>
            {payload.clientName
              ? payload.clientName
                  .split("-")
                  .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
                  .join(" ")
              : "An AI assistant"}{" "}
            is requesting {payload.authority} access
          </h1>
        </div>

        {/* Agent reason */}
        {payload.reason && (
          <div style={s.reasonBlock}>
            <span style={s.reasonLabel}>Reason</span>
            {payload.reason}
          </div>
        )}

        <hr style={s.divider} />

        <ApprovalForm
          token={token}
          authority={payload.authority}
          integrations={integrations}
          permissions={permissions}
          providerIcons={PROVIDER_ICONS}
          styles={{
            sectionLabel: s.sectionLabel,
            integrationList: s.integrationList,
            integrationItem: s.integrationItem,
            integrationIcon: s.integrationIcon,
            integrationName: s.integrationName,
            checkbox: s.checkbox,
            checkboxLabel: s.checkboxLabel,
            permissionList: s.permissionList,
            permissionItem: s.permissionItem,
            checkIcon: s.checkIcon,
            textarea: s.textarea,
            meta: s.meta,
            buttonRow: s.buttonRow,
            denyButton: s.denyButton,
            approveButton: s.approveButton,
            finePrint: s.finePrint,
            errorText: s.errorText,
          }}
        />
      </div>
    </main>
  );
}
