import { Phone } from "lucide-react";

interface CallEmptyStateProps {
  search?: string;
}

export function CallEmptyState({ search }: CallEmptyStateProps) {
  const hasSearch = Boolean(search?.trim());

  return (
    <div className="flex flex-1 items-center justify-center p-8">
      <div className="max-w-sm text-center">
        <div className="mx-auto flex size-16 items-center justify-center rounded-full bg-muted">
          <Phone className="size-7 text-muted-foreground" />
        </div>

        <h2 className="mt-5 text-lg font-semibold">
          {hasSearch ? "No calls found" : "No recent calls"}
        </h2>

        <p className="mt-2 text-sm leading-6 text-muted-foreground">
          {hasSearch
            ? `We couldn't find any calls matching "${search}".`
            : "Your recent voice and video calls will appear here."}
        </p>
      </div>
    </div>
  );
}
