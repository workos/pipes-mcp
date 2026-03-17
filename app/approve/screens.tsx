import type { ReactNode } from "react";
import type { ApprovalTokenPayload } from "@/lib/mcp/approval-token";
import { ApprovalForm } from "./approval-form";
import { PERMISSIONS, PROVIDER_ICONS } from "./config";
import { formatClientName } from "./helpers";
import { WorkOSLogo } from "./logo";
import { RequestApprovalForm } from "./request-approval-form";
import { approvePageStyles as s } from "./styles";

interface ScreenFrameProps {
  children: ReactNode;
  showLogo?: boolean;
  centeredCard?: boolean;
}

interface ApprovalErrorScreenProps {
  message: string;
  title?: string;
}

interface ApprovalResultScreenProps {
  result: "approved" | "denied";
}

interface RequestApprovalScreenProps {
  token: string;
  payload: ApprovalTokenPayload & {
    authority: "request";
    requestDetails: {
      url: string;
      method: string;
    };
  };
  requestBody?: Record<string, unknown>;
}

interface BroadApprovalScreenProps {
  token: string;
  payload: ApprovalTokenPayload & {
    authority: "read" | "write";
  };
}

function ScreenFrame({
  children,
  showLogo = false,
  centeredCard = false,
}: ScreenFrameProps) {
  return (
    <main style={s.page}>
      {showLogo ? (
        <div style={s.appLogo}>
          <WorkOSLogo />
        </div>
      ) : null}
      <div
        style={
          centeredCard ? { ...s.card, textAlign: "center" as const } : s.card
        }
      >
        {children}
      </div>
    </main>
  );
}

export function ApprovalResultScreen({ result }: ApprovalResultScreenProps) {
  const approved = result === "approved";

  return (
    <ScreenFrame centeredCard>
      <div
        style={{
          ...s.resultIcon,
          backgroundColor: approved ? "#f0fdf4" : "#fef2f2",
          color: approved ? "#16a34a" : "#dc2626",
        }}
      >
        {approved ? "✓" : "✕"}
      </div>
      <p style={s.resultTitle}>
        {approved ? "Authority granted" : "Authority denied"}
      </p>
      <p style={s.resultHint}>
        {approved
          ? "The AI assistant now has the requested access for 5 minutes. You can close this tab."
          : "The request was declined. The AI assistant remains without access. You can close this tab."}
      </p>
    </ScreenFrame>
  );
}

export function ApprovalErrorScreen({
  message,
  title = "Something went wrong",
}: ApprovalErrorScreenProps) {
  return (
    <ScreenFrame>
      <div style={s.header}>
        <h1
          style={{
            ...s.heading,
            ...(title === "Something went wrong" ? { color: "#dc2626" } : null),
          }}
        >
          {title}
        </h1>
      </div>
      <p style={s.errorText}>{message}</p>
    </ScreenFrame>
  );
}

export function RequestApprovalScreen({
  token,
  payload,
  requestBody,
}: RequestApprovalScreenProps) {
  return (
    <ScreenFrame showLogo>
      <div style={s.header}>
        <h1 style={s.heading}>
          {formatClientName(payload.clientName)} is requesting to make this API
          call
        </h1>
      </div>

      {payload.reason ? (
        <div style={s.reasonBlock}>
          <span style={s.reasonLabel}>Reason</span>
          {payload.reason}
        </div>
      ) : null}

      <hr style={s.divider} />

      <RequestApprovalForm
        token={token}
        method={payload.requestDetails.method}
        url={payload.requestDetails.url}
        body={requestBody}
        providerIcons={PROVIDER_ICONS}
        styles={{
          sectionLabel: s.sectionLabel,
          textarea: s.textarea,
          buttonRow: s.buttonRow,
          denyButton: s.denyButton,
          approveButton: s.approveButton,
          finePrint: s.finePrint,
        }}
      />
    </ScreenFrame>
  );
}

export function BroadApprovalScreen({
  token,
  payload,
}: BroadApprovalScreenProps) {
  const integrations = payload.integrations ?? [];
  const permissions = PERMISSIONS[payload.authority] ?? PERMISSIONS.read;

  return (
    <ScreenFrame showLogo>
      <div style={s.header}>
        <h1 style={s.heading}>
          {formatClientName(payload.clientName)} is requesting{" "}
          {payload.authority} access
        </h1>
      </div>

      {payload.reason ? (
        <div style={s.reasonBlock}>
          <span style={s.reasonLabel}>Reason</span>
          {payload.reason}
        </div>
      ) : null}

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
    </ScreenFrame>
  );
}
