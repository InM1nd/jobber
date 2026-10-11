import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Script from "next/script";
import { TelegramBoot } from "@/components/telegram-ui";
import { TELEGRAM_WEB_APP_SDK } from "@/lib/telegram/web-app-launch";
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
  title: "Jobber - Your Personal Job Search Assistant",
  description: "AI-powered job search assistant with smart matching and automated applications tracking",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable}`}
    >
      <body className="min-h-screen antialiased">
        <Script src={TELEGRAM_WEB_APP_SDK} strategy="beforeInteractive" />
        <TelegramBoot />
        {children}
      </body>
    </html>
  );
}
