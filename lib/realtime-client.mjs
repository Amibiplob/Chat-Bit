import { createPerformanceTrace } from './connection-performance.mjs';
import { z } from 'zod';

const id = z.uuid();
const date = z.iso.datetime();
const cursor = z.object({ id, createdAt: date });
const message = z.object({ id, conversationId: id, senderId: id, senderName: z.string().max(80),
  content: z.string().max(10000), createdAt: date, status: z.enum(['sent', 'read']), edited: z.boolean(), deleted: z.boolean(),
  attachments: z.array(z.object({ id, filename: z.string().max(255), mimeType: z.string().max(120), byteSize: z.number().int().positive(), available: z.boolean() })).default([]),
  reply: z.object({ id, senderName: z.string().max(80), content: z.string().max(10000), deleted: z.boolean() }).nullable() });
const snapshotSchema = z.object({
  revision: z.string().regex(/^\d{1,19}$/),
  conversations: z.array(z.object({ id, participantId: id, avatarVersion: z.number().int().min(0).optional(), name: z.string().max(80), initials: z.string().max(10), color: z.string().max(100),
    lastMessage: z.string().max(10000).nullable(), updatedAt: date, unread: z.number().int().min(0) })).nullable(),
  page: z.object({ messages: z.array(message).max(1000), nextCursor: cursor.nullable() }).nullable(),
  presence: z.object({ online: z.boolean(), lastSeen: date.nullable(), typing: z.boolean() }).nullable(),
});

/** @param {unknown} value @param {string | null} conversationId */
export function parseSnapshot(value, conversationId) {
  const parsed = snapshotSchema.parse(value);
  if (!conversationId && parsed.presence) throw new Error('Invalid presence snapshot');
  if (parsed.page && (!conversationId || parsed.page.messages.some((row) => row.conversationId !== conversationId))) throw new Error('Invalid conversation snapshot');
  if (parsed.page) {
    parsed.page.messages = [...new Map(parsed.page.messages.map((row) => [row.id, row])).values()]
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id));
  }
  return parsed;
}

/** Recover all explicitly loaded history using bounded, authorized pages.
 * @param {import('./messaging-types').MessagePage} initial
 * @param {import('./messaging-types').MessageCursor|null} oldest
 * @param {string} conversationId
 * @param {(cursor:import('./messaging-types').MessageCursor)=>Promise<unknown>} loadPage */
export async function completeWindow(initial, oldest, conversationId, loadPage) {
  const before = (a, b) => a.createdAt < b.createdAt || (a.createdAt === b.createdAt && a.id < b.id);
  let page = initial;
  while (oldest && page.messages[0] && before(oldest, page.messages[0]) && page.nextCursor) {
    const cursor = page.nextCursor;
    const raw = await loadPage(cursor);
    const older = parseSnapshot({ revision: '0', conversations: null, presence: null, page: raw }, conversationId).page;
    if (!older || !older.messages.length) { page = { ...page, nextCursor: null }; break; }
    const first = older.messages[0];
    if (!before(first, cursor)) throw new Error('Pagination did not advance');
    const keep = older.messages.filter((row) => !before(row, oldest));
    if (!keep.length) break;
    const merged = [...new Map([...keep, ...page.messages].map((row) => [row.id, row])).values()];
    const more = keep.length < older.messages.length || older.nextCursor !== null;
    page = { messages: merged, nextCursor: more ? { id: merged[0].id, createdAt: merged[0].createdAt } : null };
  }
  return page;
}

/** One in-flight sync, retryable database snapshots, no local event patch order.
 * @param {{request:(input: import('./realtime-types').SyncInput, signal: AbortSignal)=>Promise<unknown>,
 * getState:()=>{conversationId:string|null,oldest:import('./messaging-types').MessageCursor|null},
 * onSnapshot:(snapshot:import('./realtime-types').SyncSnapshot)=>void,
 * onStatus:(status:import('./realtime-types').ConnectionStatus)=>void,
 * onUnauthorized:()=>void, isVisible:()=>boolean, interval?:number,
 * loadPage?:(conversationId:string,cursor:import('./messaging-types').MessageCursor,signal:AbortSignal)=>Promise<unknown>}} options */
export function createSyncLoop(options) {
  const trace = createPerformanceTrace('messaging');
  let stopped = false; let running = false; let queued = false;
  let revision = /** @type {string|null} */ (null);
  let failures = 0;
  let timer = /** @type {ReturnType<typeof setTimeout>|undefined} */ (undefined);
  let controller = /** @type {AbortController|undefined} */ (undefined);
  /** @type {Array<{resolve:()=>void,reject:(error:unknown)=>void}>} */
  let waiters = [];
  function schedule(delay) {
    clearTimeout(timer);
    if (!stopped) timer = setTimeout(() => { void run(); }, delay);
  }
  async function run() {
    if (stopped || running) return;
    if (!options.isVisible()) { options.onStatus('offline'); schedule(options.interval ?? 2000); return; }
    running = true; queued = false;
    const startedAt = performance.now();
    const active = waiters; waiters = [];
    const state = options.getState();
    controller = new AbortController();
    const timeout = setTimeout(() => controller?.abort(), 15000);
    try {
      const response = await trace.step("sync", () => options.request({ ...state, revision, force: revision === null }, controller.signal));
      if (stopped) throw new Error('Synchronization stopped');
      // A mutation or registration during this request demands a fresh snapshot.
      if (!queued) {
        const snapshot = parseSnapshot(response, state.conversationId);
        if (snapshot.page && state.conversationId && options.loadPage) {
          snapshot.page = await completeWindow(snapshot.page, state.oldest, state.conversationId,
            (cursor) => options.loadPage(state.conversationId, cursor, controller.signal));
        }
        if (stopped) throw new Error('Synchronization stopped');
        if (!queued) {
          options.onSnapshot(snapshot); trace.mark("first-snapshot"); revision = snapshot.revision;
          failures = 0; options.onStatus('connected');
        }
      }
      for (const waiter of active) waiter.resolve();
    } catch (error) {
      if (!stopped) {
        revision = null; failures++; options.onStatus('reconnecting');
        if (error && typeof error === 'object' && 'status' in error && error.status === 401) {
          stopped = true; options.onUnauthorized();
        }
      }
      for (const waiter of active) waiter.reject(error);
    } finally {
      clearTimeout(timeout); running = false;
      if (stopped) { for (const waiter of waiters) waiter.reject(new Error('Synchronization stopped')); waiters = []; }
      else schedule(queued ? 0 : failures ? Math.min(30000, 1000 * 2 ** Math.min(failures, 5)) : Math.max(500, (options.interval ?? 2000) - (performance.now() - startedAt)));
    }
  }
  return {
    start() { options.onStatus('connecting'); schedule(0); },
    refresh() {
      if (stopped) return Promise.reject(new Error('Synchronization stopped'));
      revision = null; queued = true;
      const promise = new Promise((resolve, reject) => { waiters.push({ resolve: () => resolve(undefined), reject }); });
      if (!running) schedule(0);
      return promise;
    },
    stop() {
      stopped = true; clearTimeout(timer); controller?.abort();
      for (const waiter of waiters) waiter.reject(new Error('Synchronization stopped')); waiters = [];
    },
  };
}
