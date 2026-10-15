import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';

// Native Chrome DevTools protocol: browser verification without a new dependency.
export async function withBrowser(operation, extraArgs = []) {
  const diagnostic = (phase) => { if (process.env.DEBUG_CHATBIT_BROWSER === '1') console.log(`Browser check: ${phase}`); };
  const profile = await mkdtemp(join(tmpdir(), 'chatbit-browser-'));
  const listener = createServer();
  listener.listen(0, '127.0.0.1'); await once(listener, 'listening');
  const port = listener.address().port;
  await new Promise((resolve) => listener.close(resolve));
  const child = spawn(process.env.CHROME_BIN, ['--headless', '--no-sandbox', '--disable-gpu', '--no-first-run', '--disable-background-networking', '--disable-extensions', `--user-data-dir=${profile}`, `--remote-debugging-port=${port}`, ...extraArgs, 'about:blank'], { detached: true, stdio: 'ignore' });
  diagnostic('process launched');
  let socket;
  try {
    let target;
    for (let i = 0; i < 30; i++) {
      try {
        const response = await fetch(`http://127.0.0.1:${port}/json/new?about:blank`, { method: 'PUT', signal: AbortSignal.timeout(1000) });
        target = await response.json(); break;
      } catch { if (child.exitCode !== null) break; await delay(100); }
    }
    assert.ok(target?.webSocketDebuggerUrl, 'Isolated Chrome should start');
    diagnostic('debug target created');
    socket = new WebSocket(target.webSocketDebuggerUrl);
    await once(socket, 'open', { signal: AbortSignal.timeout(10000) });
    diagnostic('debug socket connected');
    let sequence = 0;
    const pending = new Map();
    socket.addEventListener('message', (event) => {
      const response = JSON.parse(event.data);
      if (!response.id) return;
      const call = pending.get(response.id);
      if (!call) return;
      pending.delete(response.id); clearTimeout(call.timeout);
      if (response.error) call.reject(new Error(`Browser protocol failed: ${response.error.message}`)); else call.resolve(response.result);
    });
    function command(method, params = {}) {
      return new Promise((resolve, reject) => {
        const id = ++sequence;
        const timeout = setTimeout(() => { pending.delete(id); reject(new Error('Browser command timed out')); }, 30000);
        pending.set(id, { resolve, reject, timeout }); socket.send(JSON.stringify({ id, method, params }));
      });
    }
    async function evaluate(expression) {
      const result = await command('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
      if (result.exceptionDetails) throw new Error('Browser evaluation failed');
      return result.result.value;
    }
    async function waitFor(expression) {
      for (let i = 0; i < 150; i++) {
        // Coerce in the browser: CDP cannot return DOM nodes by value.
        try { if (await evaluate(`Boolean(${expression})`)) return; } catch { /* Navigation replaces the execution context. */ }
        await delay(200);
      }
      if (process.env.DEBUG_CHATBIT_BROWSER === '1') {
        console.log('Browser UI diagnostics:', await evaluate(`({ready:document.readyState,value:document.querySelector('textarea')?.value,sendDisabled:document.querySelector('button[aria-label="Send message"]')?.disabled,error:document.querySelector('[role="alert"]')?.textContent,actions:Array.from(document.querySelectorAll('button[aria-label="Message actions"]')).slice(0,3).map(button=>({disabled:button.disabled,expanded:button.getAttribute('aria-expanded'),connected:button.isConnected}))})`));
        const screenshot = await command('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
        await writeFile(new URL('../../.next/auth-http-test/browser-failure.png', import.meta.url), Buffer.from(screenshot.data, 'base64'));
      }
      throw new Error(`Browser UI condition timed out: ${expression}`);
    }
    async function fill(selector, value) {
      await evaluate(`(() => { const element=document.querySelector(${JSON.stringify(selector)}); element.focus(); element.select(); })()`);
      await command('Input.insertText', { text: value });
    }
    await command('Page.enable'); await command('Network.enable');
    diagnostic('page ready');
    await operation({ command, evaluate, waitFor, fill });
  } finally {
    socket?.close();
    if (child.exitCode === null && child.signalCode === null) {
      const stopped = once(child, 'exit');
      process.kill(-child.pid, 'SIGTERM');
      await Promise.race([stopped, delay(3000)]);
      if (child.exitCode === null && child.signalCode === null) { process.kill(-child.pid, 'SIGKILL'); await stopped; }
    }
    diagnostic('process stopped');
    await rm(profile, { recursive: true, force: true });
  }
}
