import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  devIndicators: false,
  headers: async () => [
    {
      source: "/(.*)",
      headers: [
        { key: "X-Frame-Options", value: "DENY" },
        { key: "X-Content-Type-Options", value: "nosniff" },
      ],
    },
    // MCP: Apply CORS headers to OAuth discovery endpoints
    {
      source: "/.well-known/:path*",
      headers: [
        { key: "Access-Control-Allow-Origin", value: "*" },
        {
          key: "Access-Control-Allow-Methods",
          value: "GET,POST,PUT,DELETE,OPTIONS",
        },
        { key: "Access-Control-Allow-Headers", value: "*" },
      ],
    },
    // MCP: Apply CORS headers to MCP endpoint
    {
      source: "/mcp",
      headers: [
        { key: "Access-Control-Allow-Origin", value: "*" },
        {
          key: "Access-Control-Allow-Methods",
          value: "GET,POST,PUT,DELETE,OPTIONS",
        },
        { key: "Access-Control-Allow-Headers", value: "*" },
      ],
    },
  ],
};

export default nextConfig;
