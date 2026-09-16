"use client";

import { MoreVertical, Phone, Video } from "lucide-react";

import type { Call } from "./call-data";
import {
  getCallDirectionIcon,
  getCallDirectionLabel,
  getCallTypeLabel,
} from "./call-data";

interface CallListItemProps {
  call: Call;
  onVoiceCall: (call: Call) => void;
  onVideoCall: (call: Call) => void;
  onMore: (call: Call) => void;
}

export function CallListItem({
  call,
  onVoiceCall,
  onVideoCall,
  onMore,
}: CallListItemProps) {
  const DirectionIcon = getCallDirectionIcon(call.direction);

  const isMissed = call.direction === "missed";

  return (
    <div className="group flex items-center gap-3 border-b px-5 py-4 transition-colors hover:bg-muted/50">
      {/* Avatar */}
      <div className="relative shrink-0">
        <div className="flex size-11 items-center justify-center rounded-full bg-blue-100 text-sm font-semibold text-blue-600 dark:bg-blue-950 dark:text-blue-300">
          {call.initials}
        </div>

        {call.online && (
          <span className="absolute bottom-0 right-0 size-3 rounded-full border-2 border-background bg-green-500" />
        )}
      </div>

      {/* Call information */}
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <h3
            className={`truncate text-sm font-medium ${
              isMissed ? "text-red-500" : "text-foreground"
            }`}
          >
            {call.name}
          </h3>

          <span className="shrink-0 text-xs text-muted-foreground">
            {call.timestamp}
          </span>
        </div>

        <div className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
          <DirectionIcon
            className={`size-3.5 ${
              isMissed ? "text-red-500" : "text-muted-foreground"
            }`}
          />

          <span>{getCallDirectionLabel(call.direction)}</span>

          <span>·</span>

          <span>{getCallTypeLabel(call.type)}</span>

          {call.duration && (
            <>
              <span>·</span>
              <span>{call.duration}</span>
            </>
          )}
        </div>
      </div>

      {/* Actions */}
      <div className="flex shrink-0 items-center gap-1">
        <button
          type="button"
          title="Voice call"
          aria-label={`Voice call ${call.name}`}
          onClick={() => onVoiceCall(call)}
          className="flex size-9 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          <Phone className="size-4" />
        </button>

        <button
          type="button"
          title="Video call"
          aria-label={`Video call ${call.name}`}
          onClick={() => onVideoCall(call)}
          className="flex size-9 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          <Video className="size-4" />
        </button>

        <button
          type="button"
          title="More options"
          aria-label={`More options for ${call.name}`}
          onClick={() => onMore(call)}
          className="flex size-9 items-center justify-center rounded-full text-muted-foreground opacity-0 transition-all hover:bg-muted hover:text-foreground group-hover:opacity-100"
        >
          <MoreVertical className="size-4" />
        </button>
      </div>
    </div>
  );
}
