/** Watch the server-provided deadline even if a timer fires early or the clock
 * changes. Server authentication remains authoritative on every private read.
 * @param {number} expiresAt
 * @param {()=>void} onExpired
 */
export function watchSessionExpiry(expiresAt, onExpired, {now=Date.now, setTimer=setTimeout, clearTimer=clearTimeout}={}) {
  let timer, stopped=false;
  function check() {
    if (stopped) return;
    clearTimer(timer);
    const remaining=expiresAt-now();
    if (remaining<=0) { stopped=true; onExpired(); return; }
    timer=setTimer(check, Math.min(2147483647, Math.max(1, Math.ceil(remaining))));
  }
  check();
  return {check, stop() { stopped=true; clearTimer(timer); }};
}
