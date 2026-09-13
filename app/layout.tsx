import type { Metadata } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
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
    <html
      lang="en"
      className={`${inter.variable} ${jetbrainsMono.variable} antialiased`}
    >
      <body className="min-h-full flex flex-col container">{children}</body>
    </html>
  );
}
