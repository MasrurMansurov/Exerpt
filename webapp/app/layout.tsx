import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Codepact Workspace",
  description: "IDE-like workspace for sifting code into AI-ready context."
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
