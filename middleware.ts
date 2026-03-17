import { authkitMiddleware } from "@workos-inc/authkit-nextjs";

export default authkitMiddleware();

export const config = {
  matcher: ["/((?!favicon\\.ico|favicon\\.png).*)"],
};
