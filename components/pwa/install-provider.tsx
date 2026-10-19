"use client";
import { createContext, useContext, useEffect, useRef, useState } from 'react';
import { Download } from 'lucide-react';
import { installController } from '@/lib/pwa-install.mjs';

type State = { available: boolean; installed: boolean; busy: boolean; ready: boolean };
const InstallContext = createContext<{ state: State; prompt: () => Promise<string> } | null>(null);
export function InstallProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<State>({ available: false, installed: false, busy: false, ready: false });
  const controller = useRef<ReturnType<typeof installController> | null>(null);
  useEffect(() => {
    // Accessing localStorage itself can throw in private/restricted browsers.
    let storage: Pick<Storage, 'getItem' | 'setItem'>;
    try { storage = localStorage; } catch { storage = { getItem: () => null, setItem: () => {} }; }
    const current = installController({ target: window, media: matchMedia('(display-mode: standalone)'), storage,
      standalone: Boolean((navigator as Navigator & { standalone?: boolean }).standalone), changed: (next: Omit<State, 'ready'>) => setState({ ...next, ready: true }) });
    controller.current = current;
    return () => { current.dispose(); controller.current = null; };
  }, []);
  return <InstallContext.Provider value={{ state, prompt: () => controller.current?.prompt() ?? Promise.resolve('manual') }}>{children}</InstallContext.Provider>;
}

export function InstallOption() {
  const install = useContext(InstallContext);
  const [feedback, setFeedback] = useState('');
  if (!install) return null;
  if (install.state.installed) return <p className="text-sm text-muted-foreground">ChatBit is installed.</p>;
  return <div className="space-y-3" aria-label="ChatBit installation" data-install-ready={install.state.ready}>
    {install.state.available && <button type="button" disabled={install.state.busy} className="cb-button-secondary" onClick={async () => {
      const outcome = await install.prompt();
      setFeedback(outcome === 'error' ? 'The browser could not open installation. Use its menu or the steps below.' : outcome === 'accepted' ? 'Installation requested. Follow your browser’s confirmation.' : 'You can install later from your browser menu.');
    }}><Download className="size-4"/>Install ChatBit</button>}
    <details className="max-w-lg text-sm text-muted-foreground"><summary className="min-h-11 cursor-pointer py-3 font-medium">How to install ChatBit</summary><p className="pb-3 leading-7">Android: open your browser menu and choose Install app or Add to Home screen. iPhone/iPad: use Safari’s Share menu, then Add to Home Screen. On desktop, look for Install in Chrome or Edge’s address bar/menu. Options depend on your browser.</p><p className="pb-3 leading-7">Chats and calls still need a connection. Installation does not enable closed-app incoming calls or offline messaging.</p></details>
    {feedback && <p role="status" className="max-w-lg text-sm text-muted-foreground">{feedback}</p>}
  </div>;
}
