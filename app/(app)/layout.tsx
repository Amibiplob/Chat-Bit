import { performanceRequest, performanceStep } from "@/lib/server/connection-performance.mjs";
import { SettingsProvider } from "@/components/settings/settings-provider";
import { mySettings } from "@/lib/server/settings";
import { ChatLayout } from "@/components/chat/chat-layout";
import { requireUser } from "@/lib/server/auth";
import { getConversationList } from "@/lib/server/messaging";

interface ChatLayoutProps {
  children: React.ReactNode;
}

export default async function ChatRouteLayout({ children }: ChatLayoutProps) {
  return performanceRequest(async () => {
    const user = await requireUser();
    const [conversations, settings] = await Promise.all([getConversationList(), performanceStep("settings", () => mySettings())]);
    return <SettingsProvider initial={settings}><ChatLayout user={user} conversations={conversations}>{children}</ChatLayout></SettingsProvider>;
  });
}
