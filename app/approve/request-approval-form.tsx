"use client";

import type { CSSProperties } from "react";
import { handleApprove, handleDeny } from "./actions";

interface RequestApprovalFormProps {
  token: string;
  method: string;
  url: string;
  body?: Record<string, unknown>;
  providerIcons: Record<string, string>;
  styles: {
    sectionLabel: CSSProperties;
    textarea: CSSProperties;
    buttonRow: CSSProperties;
    denyButton: CSSProperties;
    approveButton: CSSProperties;
    finePrint: CSSProperties;
  };
}

const METHOD_COLORS: Record<string, string> = {
  GET: "#16a34a",
  POST: "#2563eb",
  PUT: "#d97706",
  PATCH: "#d97706",
  DELETE: "#dc2626",
};

const methodBadge = (method: string): CSSProperties => ({
  display: "inline-block",
  padding: "0.125rem 0.5rem",
  fontSize: "0.6875rem",
  fontWeight: 700,
  fontFamily: "monospace",
  color: "#fff",
  backgroundColor: METHOD_COLORS[method.toUpperCase()] ?? "#71717a",
  borderRadius: "0.25rem",
  letterSpacing: "0.025em",
  textTransform: "uppercase",
});

const requestCard: CSSProperties = {
  margin: "0 0 1.25rem 0",
  padding: "0.75rem",
  backgroundColor: "#fafafa",
  border: "1px solid #e4e4e7",
  borderRadius: "0.5rem",
};

const urlStyle: CSSProperties = {
  fontSize: "0.8125rem",
  fontFamily: "monospace",
  color: "#18181b",
  wordBreak: "break-all",
  marginLeft: "0.5rem",
};

const bodyBlock: CSSProperties = {
  marginTop: "0.75rem",
  padding: "0.625rem",
  backgroundColor: "#f4f4f5",
  borderRadius: "0.375rem",
  fontSize: "0.75rem",
  fontFamily: "monospace",
  color: "#3f3f46",
  whiteSpace: "pre-wrap",
  wordBreak: "break-all",
  maxHeight: "16rem",
  overflow: "auto",
  lineHeight: 1.5,
};

export function RequestApprovalForm({
  token,
  method,
  url,
  body,
  styles,
}: RequestApprovalFormProps) {
  const formattedBody = body ? JSON.stringify(body, null, 2) : null;

  return (
    <form action={handleApprove}>
      <input type="hidden" name="token" value={token} />

      {/* Request details card */}
      <p style={styles.sectionLabel}>API Request</p>
      <div style={requestCard}>
        <div style={{ display: "flex", alignItems: "center" }}>
          <span style={methodBadge(method)}>{method}</span>
          <span style={urlStyle}>{url}</span>
        </div>

        {formattedBody && <div style={bodyBlock}>{formattedBody}</div>}
      </div>

      <p style={styles.sectionLabel}>Notes (optional)</p>
      <textarea
        name="instructions"
        placeholder="Instructions if approving, or a reason if denying..."
        style={styles.textarea}
      />

      <div style={styles.buttonRow}>
        <button type="submit" formAction={handleDeny} style={styles.denyButton}>
          Deny
        </button>
        <button type="submit" style={styles.approveButton}>
          Approve
        </button>
      </div>

      <p style={styles.finePrint}>
        By approving, you authorize this single API call. The approval cannot be
        reused.
      </p>
    </form>
  );
}
