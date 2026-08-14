import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";
import AuthSessionProvider from "@/components/providers/session-provider";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Storqly — AI-Powered Store Builder",
  description: "Describe your store. AI builds it. You customize and publish. The fastest way to launch an online store.",
  keywords: ["Storqly", "AI store builder", "e-commerce", "online store", "AI", "no-code"],
  authors: [{ name: "Storqly" }],
  icons: {
    icon: "/logo.svg",
  },
  openGraph: {
    title: "Storqly — AI-Powered Store Builder",
    description: "Build your store in seconds with AI. Describe, customize, and publish.",
    type: "website",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark" suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased bg-background text-foreground`}
      >
        <AuthSessionProvider>
          {children}
        </AuthSessionProvider>
        <Toaster />
      </body>
    </html>
  );
}
