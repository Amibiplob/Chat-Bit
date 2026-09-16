"use client";

import { useMemo } from "react";

import { recentCalls, type Call } from "./call-data";
import { CallListItem } from "./call-list-item";
import { CallEmptyState } from "./call-empty-state";

interface CallListProps {
  search: string;
  onVoiceCall: (call: Call) => void;
  onVideoCall: (call: Call) => void;
  onMore: (call: Call) => void;
}

export function CallList({
  search,
  onVoiceCall,
  onVideoCall,
  onMore,
}: CallListProps) {
  const filteredCalls = useMemo(() => {
    const query = search.trim().toLowerCase();

    if (!query) {
      return recentCalls;
    }

    return recentCalls.filter((call) => {
      return (
        call.name.toLowerCase().includes(query) ||
        call.type.toLowerCase().includes(query) ||
        call.direction.toLowerCase().includes(query) ||
        call.date.toLowerCase().includes(query)
      );
    });
  }, [search]);

  if (filteredCalls.length === 0) {
    return <CallEmptyState search={search} />;
  }

  const groupedCalls = filteredCalls.reduce<Record<string, Call[]>>(
    (groups, call) => {
      if (!groups[call.date]) {
        groups[call.date] = [];
      }

      groups[call.date].push(call);

      return groups;
    },
    {},
  );

  return (
    <div className="flex-1 overflow-y-auto">
      {Object.entries(groupedCalls).map(([date, calls]) => (
        <section key={date}>
          <div className="sticky top-0 z-10 border-b bg-muted/50 px-5 py-2 text-xs font-medium text-muted-foreground backdrop-blur">
            {date}
          </div>

          {calls.map((call) => (
            <CallListItem
              key={call.id}
              call={call}
              onVoiceCall={onVoiceCall}
              onVideoCall={onVideoCall}
              onMore={onMore}
            />
          ))}
        </section>
      ))}
    </div>
  );
}
