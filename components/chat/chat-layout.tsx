"use client";

import { useState } from "react";
import { AppSidebar } from "./app-sidebar";

export function ChatLayout() {
  const [activeSection, setActiveSection] = useState("chats");

  return (
    <div className="flex h-svh overflow-hidden bg-background">
      <AppSidebar
        activeSection={activeSection}
        onSectionChange={setActiveSection}
      />
    </div>
  );
}
