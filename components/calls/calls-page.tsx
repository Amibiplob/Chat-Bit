"use client";

import { useState } from "react";
import { Phone, Video, X } from "lucide-react";

import type { Call } from "./call-data";
import { CallList } from "./call-list";


export function CallsPage() {
  const [search, setSearch] = useState("");
  const [selectedCall, setSelectedCall] = useState<Call | null>(null);
  const [callAction, setCallAction] = useState<"voice" | "video" | null>(null);

  const handleVoiceCall = (call: Call) => {
    setSelectedCall(call);
    setCallAction("voice");
  };

  const handleVideoCall = (call: Call) => {
    setSelectedCall(call);
    setCallAction("video");
  };

  const handleMore = (call: Call) => {
    setSelectedCall(call);
    setCallAction(null);
  };

  const closeDialog = () => {
    setSelectedCall(null);
    setCallAction(null);
  };

  return (
    <main className="flex min-w-0 flex-1 flex-col bg-background">

      <CallList
        search={search}
        onVoiceCall={handleVoiceCall}
        onVideoCall={handleVideoCall}
        onMore={handleMore}
      />

      {/* Action dialog */}
      {selectedCall && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) {
              closeDialog();
            }
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label={`Call options for ${selectedCall.name}`}
            className="w-full max-w-sm rounded-2xl border bg-background p-6 shadow-xl"
          >
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-3">
                <div className="flex size-12 items-center justify-center rounded-full bg-blue-100 text-sm font-semibold text-blue-600 dark:bg-blue-950 dark:text-blue-300">
                  {selectedCall.initials}
                </div>

                <div>
                  <h2 className="font-semibold">{selectedCall.name}</h2>
                  <p className="text-sm text-muted-foreground">
                    {callAction === "voice"
                      ? "Start voice call"
                      : callAction === "video"
                        ? "Start video call"
                        : "Call options"}
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={closeDialog}
                aria-label="Close"
                className="flex size-8 items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground"
              >
                <X className="size-4" />
              </button>
            </div>

            {callAction ? (
              <div className="mt-6 space-y-3">
                <p className="text-sm text-muted-foreground">
                  {callAction === "voice"
                    ? `Voice calling ${selectedCall.name} will be connected when WebRTC is implemented.`
                    : `Video calling ${selectedCall.name} will be connected when WebRTC is implemented.`}
                </p>

                <button
                  type="button"
                  onClick={closeDialog}
                  className="flex h-10 w-full items-center justify-center gap-2 rounded-lg bg-blue-500 text-sm font-medium text-white transition-colors hover:bg-blue-600"
                >
                  {callAction === "voice" ? (
                    <Phone className="size-4" />
                  ) : (
                    <Video className="size-4" />
                  )}
                  Continue
                </button>
              </div>
            ) : (
              <div className="mt-6 space-y-2">
                <button
                  type="button"
                  onClick={() => setCallAction("voice")}
                  className="flex h-11 w-full items-center gap-3 rounded-lg px-3 text-sm transition-colors hover:bg-muted"
                >
                  <Phone className="size-4" />
                  <span>Voice call</span>
                </button>

                <button
                  type="button"
                  onClick={() => setCallAction("video")}
                  className="flex h-11 w-full items-center gap-3 rounded-lg px-3 text-sm transition-colors hover:bg-muted"
                >
                  <Video className="size-4" />
                  <span>Video call</span>
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </main>
  );
}
