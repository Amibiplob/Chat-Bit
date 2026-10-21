import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createPerformanceTrace } from '../lib/connection-performance.mjs';
import { performanceRequest, performanceStep } from '../lib/server/connection-performance.mjs';
test('performance is opt-in, bounded to fixed labels, ephemeral IDs and numeric durations', async () => {
  const events=[]; let clock=0;
  const disabled=createPerformanceTrace('calling',{enabled:false,sink:e=>events.push(e)});
  await disabled.step('permission',async()=>42);disabled.mark('connected');assert.equal(events.length,0);
  const trace=createPerformanceTrace('calling',{enabled:true,clock:()=>clock,sink:e=>events.push(e)});
  await trace.step('permission',async()=>{clock=25;});trace.mark('connected');trace.mark('connected');
  trace.duration('https://private',25);trace.duration('offer',NaN);
  assert.equal(events.length,2);assert.equal(events[0].durationMs,25);
  assert.deepEqual(Object.keys(events[0]),['operation','stage','durationMs','correlationId']);
  assert.match(events[0].correlationId,/^[a-f0-9-]{36}$/);assert.equal(events[0].correlationId,events[1].correlationId);
  createPerformanceTrace('calling',{enabled:true,sink:e=>events.push(e)}).mark('connected');
  assert.notEqual(events[0].correlationId,events[2].correlationId);
  createPerformanceTrace('private-identity',{enabled:true,sink:e=>events.push(e)}).mark('connected');
  assert.equal(events.length,3);
});
test('measurement never masks results or failures; server instrumentation defaults off',async()=>{
  const trace=createPerformanceTrace('messaging',{enabled:true,sink:()=>{throw new Error('sink');}});
  assert.equal(await trace.step('sync',async()=>7),7);
  await assert.rejects(trace.step('sync',async()=>{throw new Error('original');}),/original/);
  assert.equal(await performanceRequest(()=>performanceStep('authentication',async()=>8)),8);
});
