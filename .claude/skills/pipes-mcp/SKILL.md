---
name: pipes-mcp
description: Procedure for creating Pipes elevated-access approvals, polling request status, and respecting user instructions. Use whenever calling request_elevated_access, check_access_request, or working with Pipes integration APIs.
user-invocable: false
---

# Pipes Authority Flow

When you need to call integration APIs via Pipes, follow this procedure exactly.

## 1. Inspect current authority first

Call `whoami` before requesting any new authority.

- If the current broad authority already covers the user's requested task and providers, use it.
- If the current broad authority is insufficient, request broader `read` or `write` authority based on the user's task.
- Only use per-request authority if the user explicitly asks for exact-call approval or per-request approval.

## 2. Request authority only if needed

Default to broad session authority. Call `request_elevated_access` with:
- `kind`: "session"
- `level`: "read" or "write" depending on the operation
- `providers`: array of provider slugs you need (e.g. `["linear"]`). Only request what you need.
- `reason`: a clear justification for why you need this access

Only use `request_elevated_access` with `kind: "call"` when the user explicitly asks for per-request approval of a single exact API call. In that case, include the exact request details (`url`, `method`, and optional `body`).

## 3. Present the approval URL

Show the approval URL to the user and tell them to open it. Do not truncate or hide the URL.

## 4. Poll for the result

After requesting authority, you MUST poll autonomously using this loop:

1. Call `check_access_request` with the `requestId` from step 1
2. If status is **"pending"**: run `sleep 10` in a shell, then call `check_access_request` again
3. Repeat until the status is **"approved"**, **"denied"**, or **"not_found"**
4. Stop polling after 5 minutes (30 attempts) — the approval link expires after 5 minutes

Do NOT ask the user to tell you when they've approved. Poll autonomously.

## 5. Handle the result

### If approved:
- Note which **providers** were authorized — you can only call APIs for those providers
- Read and **strictly follow any user instructions** returned in the response. These are mandatory constraints from the human approver. Do not ignore them.
- Proceed with your task using only the authorized providers

### If denied:
- Read the **reason** if one was provided
- Respect the denial. Do not immediately re-request the same authority
- If the reason suggests a different approach (e.g. "only request linear"), adjust your next request accordingly

### If not_found:
- The approval may have expired. You can make a new request if needed.
