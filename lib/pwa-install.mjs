export const INSTALL_DISMISSED_KEY = 'chatbit-install-dismissed';
const WEEK = 7 * 24 * 60 * 60 * 1000;

/** Capture the one-shot browser event at the app root; never prompt automatically. */
export function installController({ target, media, storage, standalone = false, now = Date.now, changed }) {
  let deferred = null;
  let busy = false;
  let disposed = false;
  let installed = standalone || media.matches;
  let dismissed = false;
  try { const value = Number(storage.getItem(INSTALL_DISMISSED_KEY)); dismissed = value > 0 && now() - value < WEEK; } catch { /* Installation still works when storage is blocked. */ }
  const state = () => ({ available: Boolean(deferred) && !dismissed && !installed, installed, busy });
  const emit = () => { if (!disposed) changed(state()); };
  const before = event => {
    if (typeof event.prompt !== 'function' || !event.userChoice) return;
    event.preventDefault(); deferred = event; emit();
  };
  const complete = () => { installed = true; deferred = null; emit(); };
  const mode = () => { installed = standalone || media.matches; emit(); };
  target.addEventListener('beforeinstallprompt', before);
  target.addEventListener('appinstalled', complete);
  media.addEventListener('change', mode);
  emit();
  return {
    async prompt() {
      if (busy || !state().available) return 'manual';
      const event = deferred; deferred = null; busy = true; emit();
      try {
        await event.prompt();
        const choice = await event.userChoice;
        if (choice.outcome === 'dismissed') {
          dismissed = true;
          try { storage.setItem(INSTALL_DISMISSED_KEY, String(now())); } catch { /* Keep dismissal in memory for this session. */ }
        }
        return choice.outcome;
      } catch { return 'error'; }
      finally { busy = false; emit(); }
    },
    dispose() { disposed = true; target.removeEventListener('beforeinstallprompt', before); target.removeEventListener('appinstalled', complete); media.removeEventListener('change', mode); deferred = null; },
  };
}
