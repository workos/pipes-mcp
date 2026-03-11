"use server";

import { signOut } from "@workos-inc/authkit-nextjs";

export async function handleSignOut(_formData?: FormData) {
  await signOut();
}
