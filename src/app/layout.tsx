import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import AuthSessionProvider from "@/components/providers/session-provider";
import ConnectionBanner from "@/components/connection-banner";

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
      <head>
        {/* Inline critical styles: ensures page is visible even before CSS/JS loads in iframes */}
        <style
          dangerouslySetInnerHTML={{
            __html: `
              html, body { margin: 0; padding: 0; }
              body { background-color: #09090b; color: #fafafa; font-family: system-ui, -apple-system, sans-serif; }
              .__storqly_splash {
                display: flex; align-items: center; justify-content: center;
                min-height: 100vh; flex-direction: column; gap: 12px;
              }
              .__storqly_splash span {
                font-size: 24px; font-weight: 700; letter-spacing: -0.02em;
                background: linear-gradient(to right, #a855f7, #ec4899, #f43f5e);
                -webkit-background-clip: text; -webkit-text-fill-color: transparent;
                background-clip: text;
              }
              .__storqly_splash p { color: #71717a; font-size: 14px; margin: 0; }
            `,
          }}
        />
      </head>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased bg-background text-foreground`}
      >
        {/* noscript fallback: visible when JS is disabled/blocked in iframes */}
        <noscript>
          <div className="__storqly_splash" style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 12, backgroundColor: '#09090b' }}>
            <span>Storqly</span>
            <p>Please enable JavaScript to use Storqly.</p>
          </div>
        </noscript>
        <AuthSessionProvider>
          <ConnectionBanner />
          {children}
        </AuthSessionProvider>
      </body>
    </html>
  );
}
