import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import {
  PLATFORM_NAME,
  PLATFORM_DESCRIPTION,
  PLATFORM_FAVICON_URL,
  PLATFORM_LOGO_URL,
  SITE_URL,
} from "@/lib/config";
import { ThemeProvider } from "./_components/theme-provider";
import { ServiceWorkerRegister } from "./_components/sw-register";
import { ToastProvider } from "./_components/toast";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    // Per-page titles become "Page · The Trees"; the root/home stays just the name.
    default: PLATFORM_NAME,
    template: `%s · ${PLATFORM_NAME}`,
  },
  description: PLATFORM_DESCRIPTION,
  // `apple` = the iOS Home Screen icon AND the icon shown on iOS web-push
  // notifications.
  icons: { icon: PLATFORM_FAVICON_URL, apple: PLATFORM_LOGO_URL },
  // iOS standalone (Add to Home Screen): run full-screen with the app's name.
  appleWebApp: {
    capable: true,
    title: PLATFORM_NAME,
    statusBarStyle: "black-translucent",
  },
  // Default social share preview (Open Graph + Twitter). Per-page routes (e.g. a
  // public profile) can override via generateMetadata.
  openGraph: {
    type: "website",
    siteName: PLATFORM_NAME,
    title: PLATFORM_NAME,
    description: PLATFORM_DESCRIPTION,
    url: SITE_URL,
    images: [{ url: PLATFORM_LOGO_URL, alt: PLATFORM_NAME }],
  },
  twitter: {
    card: "summary_large_image",
    title: PLATFORM_NAME,
    description: PLATFORM_DESCRIPTION,
    images: [PLATFORM_LOGO_URL],
  },
};

export const viewport: Viewport = {
  themeColor: "#0a0a0a",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <ThemeProvider>
          <ToastProvider>{children}</ToastProvider>
        </ThemeProvider>
        <ServiceWorkerRegister />
      </body>
    </html>
  );
}
