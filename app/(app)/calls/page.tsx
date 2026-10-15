import { CallsPage } from "@/components/calls/calls-page";
import { requireUser } from "@/lib/server/auth";

export default async function CallsRoute() {
  await requireUser();
  return <CallsPage/>;
}
