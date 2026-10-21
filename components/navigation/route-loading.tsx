export function RouteLoading({ label }: { label: string }) {
  return <div role="status" aria-label={label} data-route-loading className="flex min-h-0 w-full flex-1 flex-col gap-5 p-5">
    <span className="text-sm text-muted-foreground">{label}</span>
    <div aria-hidden="true" className="h-12 w-2/3 rounded-xl bg-muted" />
    <div aria-hidden="true" className="h-24 w-full rounded-xl bg-muted/60" />
    <div aria-hidden="true" className="h-16 w-3/4 rounded-xl bg-muted/60" />
  </div>;
}
