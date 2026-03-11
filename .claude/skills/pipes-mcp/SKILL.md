---
name: pipes-mcp
description: Procedure for requesting Pipes authority, polling approval status, and respecting user instructions. Use whenever calling request_pipes_authority, get_approval_status, or working with Pipes integration APIs.
user-invocable: false
---

# Pipes Authority Flow

When you need to call integration APIs via Pipes, follow this procedure exactly.

## 1. Request authority

Call `request_pipes_authority` with:
- `authority`: "read" or "write" depending on the operation
- `providers`: array of provider slugs you need (e.g. `["linear"]`). Only request what you need.
- `reason`: a clear justification for why you need this access

## 2. Present the approval URL

Show the approval URL to the user and tell them to open it. Do not truncate or hide the URL.

## 3. Poll for the result

After requesting authority, you MUST poll autonomously using this loop:

1. Call `get_approval_status` with the `approvalId` from step 1
2. If status is **"pending"**: run `sleep 10` in a shell, then call `get_approval_status` again
3. Repeat until the status is **"approved"**, **"denied"**, or **"not_found"**
4. Stop polling after 5 minutes (30 attempts) — the approval link expires after 5 minutes

Do NOT ask the user to tell you when they've approved. Poll autonomously.

## 4. Handle the result

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

## 5. Release when done

Call `release_pipes_authority` when you no longer need access. Do not hold authority longer than necessary.
