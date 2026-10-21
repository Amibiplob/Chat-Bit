import { AsyncLocalStorage } from 'node:async_hooks';
import { createPerformanceTrace } from '../connection-performance.mjs';
const traces = new AsyncLocalStorage();
export function performanceRequest(operation) {
  return traces.run(createPerformanceTrace('server', { enabled: process.env.CHATBIT_PERFORMANCE === '1' }), operation);
}
export function performanceStep(stage, operation) {
  const trace = traces.getStore();
  return (trace ?? createPerformanceTrace('server', { enabled: process.env.CHATBIT_PERFORMANCE === '1' })).step(stage, operation);
}
export function performanceDuration(stage, duration) { traces.getStore()?.duration(stage, duration); }
