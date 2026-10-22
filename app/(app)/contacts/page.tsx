import { requireUser } from "@/lib/server/auth";

// The authenticated shell owns the persistent workspace panel.
export default async function Page() {
  await requireUser();
  return null;
}
