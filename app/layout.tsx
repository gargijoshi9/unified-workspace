import type { Metadata } from "next";
import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";
import "./globals.css";
import { Providers } from "./providers";

export const metadata: Metadata = {
  title: "NexusOps | Unified Enterprise Workspace",
  description: "Unified Enterprise Portal for Support Tickets, Code Reviews & Security Audits",
  icons: {
    icon: "/favicon.ico",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${GeistSans.variable} ${GeistMono.variable} ${GeistSans.className} h-full dark antialiased`}
    >
      <body className="min-h-full flex flex-col bg-[#0F1115] text-[#F5F4F1]">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
