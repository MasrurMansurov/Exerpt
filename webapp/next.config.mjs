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
    NEXT_PUBLIC_API_URL:
      process.env.NEXT_PUBLIC_API_URL ??
      process.env.NEXT_PUBLIC_EXERPT_API_URL ??
      process.env.NEXT_PUBLIC_CODEPACT_API_URL ??
      "http://127.0.0.1:8000",
    NEXT_PUBLIC_EXERPT_API_URL:
      process.env.NEXT_PUBLIC_EXERPT_API_URL ??
      process.env.NEXT_PUBLIC_API_URL ??
      process.env.NEXT_PUBLIC_CODEPACT_API_URL ??
      "http://127.0.0.1:8000",
    NEXT_PUBLIC_BASE_URL:
      process.env.NEXT_PUBLIC_BASE_URL ??
      process.env.NEXT_PUBLIC_EXERPT_SITE_URL ??
      "https://exerpt.dev",
    NEXT_PUBLIC_EXERPT_SITE_URL: process.env.NEXT_PUBLIC_EXERPT_SITE_URL ?? "https://exerpt.dev"
  },
  reactStrictMode: true
};

export default nextConfig;
