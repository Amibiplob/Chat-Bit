import { SettingsLayout } from "@/components/settings/settings-layout";
import { requireUser } from "@/lib/server/auth";

export default async function SettingsPage() {
  await requireUser();
  return <SettingsLayout />;
}
