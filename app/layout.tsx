import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono, Inter_Tight } from "next/font/google";
import Script from "next/script";
import { TelegramBoot } from "@/components/telegram-ui";
import { ServiceWorkerRegister } from "@/components/pwa";
import { TELEGRAM_WEB_APP_SDK } from "@/lib/telegram/web-app-launch";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const interTight = Inter_Tight({
  variable: "--font-inter-tight",
  subsets: ["latin", "cyrillic"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Jobber — a calm job search assistant",
  description: "Daily job matches scored against your profile, honest cover letters, and a simple tracker. In Telegram and on the web.",
  applicationName: "Jobber",
  appleWebApp: { capable: true, title: "Jobber", statusBarStyle: "default" },
  icons: {
    icon: [
      { url: "/favicon.ico", sizes: "48x48" },
      { url: "/icons/icon.svg", type: "image/svg+xml" },
      { url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
    ],
    apple: "/icons/apple-touch-icon.png",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#000000" },
  ],
};

// Pick light/dark before paint on the web. Inside Telegram, TelegramBoot overrides it.
const themeScript = `try{var m=localStorage.getItem('theme')||'system';var k=m==='dark'||(m==='system'&&matchMedia('(prefers-color-scheme: dark)').matches);document.documentElement.dataset.theme=k?'dark':'light'}catch(e){}`;

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="en"
      className={`${interTight.variable} ${geistSans.variable} ${geistMono.variable}`}
      suppressHydrationWarning
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className="min-h-screen antialiased">
        <Script src={TELEGRAM_WEB_APP_SDK} strategy="beforeInteractive" />
        <TelegramBoot />
        <ServiceWorkerRegister />
        {children}
      </body>
    </html>
  );
}
