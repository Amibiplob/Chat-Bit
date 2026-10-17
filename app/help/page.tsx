import Link from 'next/link';
import { Navbar } from '@/components/header/navbar';
import { Footer } from '@/components/footer/footer';
export default function HelpPage(){return <><Navbar/><main className="mx-auto max-w-3xl px-5 py-16"><p className="cb-kicker">A little help</p><h1 className="mt-4 text-4xl font-semibold tracking-tight">Make yourself at home.</h1><p className="mt-5 leading-7 text-muted-foreground">Practical answers for your next conversation.</p><div className="mt-10 space-y-4">{[
['How do I start a conversation?','Sign in, open Contacts or the new-conversation button in Chats, then search by name or exact email. Open a result to start messaging.'],
['Which files can I share?','Supported photos, MP4/WebM videos, audio, PDF, text and Office files. Each file must be nonempty and at most 10 MiB; your total attachment quota is 100 MiB. Files are verified after upload.'],
['Why is my message delayed?','Active tabs poll for updates. Network latency, database load and retries affect delivery. Background tabs may pause; returning to the app requests fresh updates. Failed sends keep your draft so you can try again.'],
['What password should I use?','Use 8–128 characters for a new password. A long unique passphrase is encouraged. Changing your password signs out all sessions. Password recovery is not currently available.'],
['Why can’t my call connect?','Allow microphone/camera access on HTTPS. Calls need both people online and the app open. TURN is not verified for this deployment, so some networks cannot connect.'],
['Are messages end-to-end encrypted?','No. Access is protected by server-side authorization and HTTPS; the server stores message contents. Do not treat ChatBit as an end-to-end encrypted messenger.'],
['Does the Android app work offline or in the background?','The Android package opens the same website. Reading chats and sending messages require a connection. Native background calls, push when the app is closed and unrestricted background execution are not provided.'],
['Can I delete my account?','Self-service account deletion, blocking, MFA and account recovery are currently unavailable. Do not share sensitive information in this portfolio application.']
].map(([q,a])=><details key={q} className="cb-panel p-5"><summary className="cursor-pointer text-sm font-semibold">{q}</summary><p className="mt-4 text-sm leading-7 text-muted-foreground">{a}</p></details>)}</div><Link className="cb-button mt-8" href="/chat">Back to chats</Link></main><Footer/></>;}
