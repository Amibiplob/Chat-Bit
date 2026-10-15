import { requireUser } from '@/lib/server/auth';
import { ContactsPage } from '@/components/chat/contacts-page';
export default async function ContactsRoute() {await requireUser();return <ContactsPage/>;}
