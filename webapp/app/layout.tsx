import type { Metadata } from "next";
import { siteDescription, siteName, siteUrl } from "./config/site";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "Exerpt Workspace",
    template: `%s | ${siteName}`
  },
  description: siteDescription,
  metadataBase: new URL(siteUrl),
  alternates: {
    canonical: "/"
  },
  openGraph: {
    title: "Exerpt Workspace",
    description: siteDescription,
    siteName,
    type: "website",
    url: siteUrl
  },
  twitter: {
    card: "summary",
    title: "Exerpt Workspace",
    description: siteDescription
  },
  manifest: "/manifest.webmanifest",
  icons: {
    icon: [{ url: "/icon.svg", type: "image/svg+xml" }],
    shortcut: "/icon.svg",
    apple: "/icon.svg"
  },
  applicationName: siteName,
  appleWebApp: {
    capable: true,
    title: siteName
  }
};

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="font-sans text-ui-14" suppressHydrationWarning>
        {children}
      </body>
    </html>
  );
}
