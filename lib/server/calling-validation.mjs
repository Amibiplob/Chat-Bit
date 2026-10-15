import { z } from 'zod';
import { MessagingError, idSchema, validated } from './messaging-validation.mjs';
export const liveStatuses = new Set(['ringing','connecting','active']);
export const createCallSchema = z.object({ conversationId: idSchema, clientId: idSchema, tabId: idSchema, kind: z.enum(['voice','video']) }).strict();
export const callSyncSchema = z.object({ tabId: idSchema, callId: idSchema.nullable().default(null), after: z.number().int().min(0).max(512).default(0) }).strict();
export const callActionSchema = z.object({ tabId: idSchema, action: z.enum(['accept','reject','cancel','end','connected','fail']) }).strict();
const description = (type) => z.object({ type: z.literal(type), sdp: z.string().min(1).max(48000).startsWith('v=0') }).strict();
const candidate = z.object({ candidate: z.string().max(4096), sdpMid: z.string().max(256).nullable().optional(),
  sdpMLineIndex: z.number().int().min(0).max(128).nullable().optional(), usernameFragment: z.string().max(256).nullable().optional() }).strict();
export const callSignalSchema = z.object({ tabId: idSchema, clientId: idSchema,
  signal: z.discriminatedUnion('kind', [z.object({ kind: z.literal('offer'), payload: description('offer') }).strict(),
    z.object({ kind: z.literal('answer'), payload: description('answer') }).strict(),
    z.object({ kind: z.literal('ice'), payload: candidate }).strict()]) }).strict();

export function transitionCall(row, userId, action) {
  const caller = row.callerId === userId;
  if (row.callerId !== userId && row.calleeId !== userId) throw new MessagingError('Call unavailable.', 404);
  if (!liveStatuses.has(row.status)) {
    if (['end','cancel','reject','fail'].includes(action)) return row.status;
    throw new MessagingError('This call has already finished.', 409);
  }
  if (action === 'accept' && !caller && row.status === 'ringing') return 'connecting';
  if (action === 'accept' && !caller && ['connecting','active'].includes(row.status)) return row.status;
  if (action === 'reject' && !caller && row.status === 'ringing') return 'rejected';
  if (action === 'cancel' && caller && row.status === 'ringing') return 'cancelled';
  if (action === 'connected' && ['connecting','active'].includes(row.status)) return 'active';
  if (action === 'fail') return 'failed';
  if (action === 'end') return row.status === 'ringing' ? (caller ? 'cancelled' : 'rejected') : 'ended';
  throw new MessagingError('That call action is unavailable.', 409);
}
export function validateCallId(value) { return validated(idSchema, value); }
