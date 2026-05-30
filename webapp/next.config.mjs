const apiUrl = process.env.NEXT_PUBLIC_API_URL?.replace(/\/$/, "");

/** @type {import('next').NextConfig} */
const nextConfig = {
  async redirects() {
    return [
      {
        source: "/:path*",
        has: [{ type: "host", value: "www.exerpt.dev" }],
        destination: "https://exerpt.dev/:path*",
        permanent: true
      }
    ];
  },
  env: {
    ...(apiUrl ? { NEXT_PUBLIC_API_URL: apiUrl } : {}),
    NEXT_PUBLIC_BASE_URL:
      process.env.NEXT_PUBLIC_BASE_URL ??
      process.env.NEXT_PUBLIC_EXERPT_SITE_URL ??
      "https://exerpt.dev",
    NEXT_PUBLIC_EXERPT_SITE_URL: process.env.NEXT_PUBLIC_EXERPT_SITE_URL ?? "https://exerpt.dev"
  },
  reactStrictMode: true
};

export default nextConfig;
