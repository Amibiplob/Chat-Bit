import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
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
  title: {
    default: "ChatBit - Chat, Call, Share",
    template: "%s | ChatBit",
  },

  description:
    "ChatBit is a modern communication platform for messaging, file sharing, voice calls, and video calls.",

  keywords: [
    "ChatBit",
    "messaging",
    "chat",
    "video call",
    "voice call",
    "file sharing",
  ],

  authors: [{ name: "Md Biplob Hosain" }],
  creator: "Md Biplob Hosain",
  applicationName: "ChatBit",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        {children}
      </body>
    </html>
  );
}
