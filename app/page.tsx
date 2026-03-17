import { withAuth } from "@workos-inc/authkit-nextjs";
import { handleSignOut } from "./actions/auth";

export default async function Home() {
  const { user } = await withAuth();

  return (
    <main
      style={{
        minHeight: "100vh",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        fontFamily: "system-ui, sans-serif",
        backgroundColor: "#f9fafb",
        gap: "1rem",
      }}
    >
      <h1
        style={{
          fontSize: "2rem",
          fontWeight: 600,
          color: "#111827",
        }}
      >
        {user ? `Hello ${user.firstName || user.email}` : "Pipes MCP"}
      </h1>
      {user && (
        <form action={handleSignOut}>
          <button
            type="submit"
            style={{
              padding: "0.5rem 1rem",
              fontSize: "0.875rem",
              color: "#374151",
              backgroundColor: "#fff",
              border: "1px solid #d1d5db",
              borderRadius: "0.375rem",
              cursor: "pointer",
            }}
          >
            Sign out
          </button>
        </form>
      )}
    </main>
  );
}
