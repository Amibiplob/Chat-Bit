import { SettingsLayout } from "@/components/settings/settings-layout";
import { requireUser } from "@/lib/server/auth";

export default async function SettingsPage() {
  const user = await requireUser();
  return <SettingsLayout user={user} />;
}
