import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import { ThemeProvider } from "@/components/settings/theme-provider";
import { themeBootstrap } from "@/lib/theme.mjs";
import "./globals.css";
import { RegisterWorker } from "@/components/pwa/register-worker";
import { InstallProvider } from '@/components/pwa/install-provider';
const inter=localFont({src:"../public/fonts/Inter-latin.woff2",variable:"--font-inter",display:"swap",weight:"100 900"});
const jetbrainsMono=localFont({src:"../public/fonts/JetBrainsMono-latin.woff2",variable:"--font-jetbrains-mono",display:"swap",weight:"100 800"});

export const viewport: Viewport = {width:"device-width",initialScale:1,viewportFit:"cover",interactiveWidget:"resizes-content",themeColor:[{media:"(prefers-color-scheme: light)",color:"#f5faf8"},{media:"(prefers-color-scheme: dark)",color:"#102b2c"}]};

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
  appleWebApp: {capable:true,title:"ChatBit",statusBarStyle:"default"},
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
      className={`${inter.variable} ${jetbrainsMono.variable} antialiased`}
    >
      <head><script dangerouslySetInnerHTML={{__html:themeBootstrap}}/></head>
      <body className="min-h-svh min-w-0"><ThemeProvider><InstallProvider><RegisterWorker/>{children}</InstallProvider></ThemeProvider></body>
    </html>
  );
}
