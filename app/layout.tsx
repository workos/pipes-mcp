import { withAuth } from "@workos-inc/authkit-nextjs";

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { user } = await withAuth();

  return (
    <html lang="en">
      <body style={{ margin: 0 }}>
        {user && (
          <div
            style={{
              position: "fixed",
              top: 0,
              left: 0,
              padding: "0.75rem 1rem",
              display: "flex",
              alignItems: "center",
              gap: "0.5rem",
              zIndex: 50,
              fontSize: "0.8125rem",
              color: "#71717a",
              fontFamily:
                '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
            }}
          >
            {user.profilePictureUrl && (
              <div
                role="img"
                aria-label={user.firstName ?? user.email}
                style={{
                  width: "24px",
                  height: "24px",
                  borderRadius: "50%",
                  backgroundImage: `url(${user.profilePictureUrl})`,
                  backgroundSize: "cover",
                  backgroundPosition: "center",
                }}
              />
            )}
            <span>{user.email}</span>
          </div>
        )}
        {children}
      </body>
    </html>
  );
}
