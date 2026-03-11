"use client";

import type { CSSProperties } from "react";
import { useState } from "react";
import { handleApprove, handleDeny } from "./actions";

interface Integration {
  name: string;
  slug: string;
}

interface ApprovalFormProps {
  token: string;
  authority: "read" | "write";
  integrations: Integration[];
  permissions: string[];
  providerIcons: Record<string, string>;
  styles: {
    sectionLabel: CSSProperties;
    integrationList: CSSProperties;
    integrationItem: CSSProperties;
    integrationIcon: CSSProperties;
    integrationName: CSSProperties;
    checkbox: CSSProperties;
    checkboxLabel: CSSProperties;
    permissionList: CSSProperties;
    permissionItem: CSSProperties;
    checkIcon: CSSProperties;
    textarea: CSSProperties;
    meta: CSSProperties;
    buttonRow: CSSProperties;
    denyButton: CSSProperties;
    approveButton: CSSProperties;
    finePrint: CSSProperties;
    errorText: CSSProperties;
  };
}

function getProviderIconUrl(
  slug: string,
  providerIcons: Record<string, string>,
): string {
  return (
    providerIcons[slug] ??
    `https://cdn.workos.com/provider-icons/light/${slug}.svg`
  );
}

export function ApprovalForm({
  token,
  authority,
  integrations,
  permissions,
  providerIcons,
  styles,
}: ApprovalFormProps) {
  const [selectedCount, setSelectedCount] = useState(integrations.length);

  const canApprove = integrations.length > 0 && selectedCount > 0;

  return (
    <form action={handleApprove}>
      <input type="hidden" name="token" value={token} />

      {integrations.length > 0 ? (
        <>
          <p style={styles.sectionLabel}>Integrations</p>
          <ul style={styles.integrationList}>
            {integrations.map((integration) => (
              <li key={integration.slug} style={styles.integrationItem}>
                <input
                  type="checkbox"
                  name="providers"
                  value={integration.slug}
                  defaultChecked
                  id={`provider-${integration.slug}`}
                  style={styles.checkbox}
                  onChange={(event) => {
                    setSelectedCount((count) =>
                      event.target.checked ? count + 1 : count - 1,
                    );
                  }}
                />
                <label
                  htmlFor={`provider-${integration.slug}`}
                  style={styles.checkboxLabel}
                >
                  <div
                    role="img"
                    aria-label={integration.name}
                    style={{
                      ...styles.integrationIcon,
                      backgroundImage: `url(${getProviderIconUrl(integration.slug, providerIcons)})`,
                      backgroundSize: "contain",
                      backgroundRepeat: "no-repeat",
                      backgroundPosition: "center",
                    }}
                  />
                  <span style={styles.integrationName}>{integration.name}</span>
                </label>
              </li>
            ))}
          </ul>
        </>
      ) : (
        <p style={{ ...styles.meta, marginBottom: "1.25rem" }}>
          No integrations are currently connected.
        </p>
      )}

      <p style={styles.sectionLabel}>Permissions</p>
      <ul style={styles.permissionList}>
        {permissions.map((perm) => (
          <li key={perm} style={styles.permissionItem}>
            <span style={styles.checkIcon}>&#10003;</span>
            {perm}
          </li>
        ))}
      </ul>

      <p style={styles.sectionLabel}>Notes (optional)</p>
      <textarea
        name="instructions"
        placeholder="Instructions if approving, or a reason if denying..."
        style={styles.textarea}
      />

      {!canApprove && integrations.length > 0 ? (
        <p
          style={{
            ...styles.errorText,
            marginTop: "-0.75rem",
            marginBottom: "1rem",
          }}
        >
          Select at least one integration to approve access.
        </p>
      ) : null}

      <div style={styles.buttonRow}>
        <button type="submit" formAction={handleDeny} style={styles.denyButton}>
          Deny
        </button>
        <button
          type="submit"
          disabled={!canApprove}
          aria-disabled={!canApprove}
          style={{
            ...styles.approveButton,
            ...(canApprove
              ? null
              : {
                  opacity: 0.5,
                  cursor: "not-allowed",
                }),
          }}
        >
          Approve
        </button>
      </div>

      <p style={styles.finePrint}>
        By approving, you grant temporary {authority} access to the selected
        integrations for 5 minutes.
      </p>
    </form>
  );
}
