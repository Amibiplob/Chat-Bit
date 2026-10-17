export function FieldError({ id, error }: { id: string; error?: string }) {
  return error ? <p id={`${id}-error`} className="text-sm text-destructive">{error}</p> : null;
}
