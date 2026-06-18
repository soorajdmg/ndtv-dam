/** @type {import('next').NextConfig} */

// Parse the API URL to extract hostname/port/protocol for Next.js remotePatterns.
// NEXT_PUBLIC_API_URL is baked in at BUILD time — set it in Vercel before deploying.
function buildRemotePatterns() {
  const patterns = [
    // Always allow localhost for local development
    {
      protocol: "http",
      hostname: "localhost",
      port: "8000",
      pathname: "/**",
    },
  ];

  const apiUrl = process.env.NEXT_PUBLIC_API_URL;
  if (apiUrl) {
    try {
      const parsed = new URL(apiUrl);
      const isLocalhost =
        parsed.hostname === "localhost" || parsed.hostname === "127.0.0.1";

      if (!isLocalhost) {
        patterns.push({
          protocol: parsed.protocol.replace(":", ""),
          hostname: parsed.hostname,
          port: parsed.port || "",
          pathname: "/**",
        });
      }
    } catch (_) {
      // Invalid URL — skip adding it
    }
  }

  // Allow Cloudflare R2 public bucket URLs.
  // Set R2_PUBLIC_HOSTNAME in Vercel env vars to the hostname of your public R2 bucket
  // e.g. "pub-xxxxxxxx.r2.dev" or your custom domain.
  const r2Host = process.env.R2_PUBLIC_HOSTNAME;
  if (r2Host) {
    patterns.push({
      protocol: "https",
      hostname: r2Host,
      pathname: "/**",
    });
  }

  return patterns;
}

const nextConfig = {
  images: {
    remotePatterns: buildRemotePatterns(),
  },
  async rewrites() {
    const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";
    return [
      {
        source: "/api/:path*",
        destination: `${apiUrl}/api/:path*`,
      },
    ];
  },
};

module.exports = nextConfig;
